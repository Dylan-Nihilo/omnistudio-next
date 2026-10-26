# 线上部署维护

GitHub Actions 的 Server pipeline 只在手工执行并勾选 deploy 时更新生产；push/PR 只构建。生产参数使用仓库 Actions Variables，未配置时使用下列默认值。

- `DEPLOY_KEEP_RELEASES=3`：当前及前两个不同的成功镜像。额外保护所有容器正在引用的镜像。
- `DEPLOY_BACKUP_KEEP_COUNT=7`：至少保留最近 7 份完整备份。
- `DEPLOY_BACKUP_KEEP_DAYS=30`：30 天内的完整备份也全部保留，数量与天数取并集。
- `DEPLOY_MIN_FREE_GIB=5`：至少保留 5 GiB 可用空间，并额外预留本次归档、镜像加载和数据库／工作区备份预计空间。
- `DEPLOY_LOG_SIZE_MB=20`、`DEPLOY_LOG_FILES=5`：应用与 MySQL 都使用 json-file 日志轮转；上限不包含数据库内部日志。
- `DEPLOY_DRAIN_SECONDS=300`：暂停新写入／生成后，等待在途请求和 reserved/running 任务结束；超时取消部署并恢复原服务。

应用默认将 Agent、媒体生成、FFmpeg 和大文件上传分别限制为 8、20、2、8 个进程内任务。媒体生成达到上限时进入当前进程的等待队列，客户端断开后会取消排队；Agent、FFmpeg 和大文件上传超过上限返回 `429` 并带 `Retry-After`。可通过 `OMNISTUDIO_NEXT_AGENT_CONCURRENCY`、`OMNISTUDIO_NEXT_MEDIA_CONCURRENCY`、`OMNISTUDIO_NEXT_FFMPEG_CONCURRENCY`、`OMNISTUDIO_NEXT_UPLOAD_CONCURRENCY` 调整。该保护只覆盖单个服务进程，队列不跨进程持久化，也不能替代供应商并发额度或真实 100+ 并发压测。

生产环境的插件下载和远端 A2A 会解析目标域名并拒绝回环、私网、链路本地、保留和云元数据地址，同时逐跳复核重定向并固定连接地址。确需访问受控内网服务时，设置 `OMNISTUDIO_NEXT_ALLOW_PRIVATE_REMOTE_URLS=1`，并在防火墙或代理层限制出站范围；不要把该开关用于开放公网服务。

每次工作流使用独立 `attempt{runId}x{runAttempt}` 备份目录。同一个提交重复部署也不覆盖此前的备份。版本数不得低于 3，备份数不得低于 7，空间余量不得低于 5 GiB；参数非法会在服务停止前失败。

## 部署顺序

1. 上传前检查部署磁盘与 Docker 磁盘及数据卷所在文件系统的可用 inode；校验 SSH 主机密钥，上传镜像后验证 SHA-256 和 gzip。
2. 获取服务器部署锁，创建工作区根目录中的 `deploymentMaintenance` 标记。应用拒绝新写入／生成，保留取消、结果回传和读取。状态接口仅允许本机与正确随机令牌，不返回令牌。
3. 等待活动请求与生成任务连续三次清零；不杀死在途供应商任务。跨浏览器启动的下一步画布生成视为新请求，维护时会被拒绝，需发布后重试。
4. 停止应用，在同一静止窗口导出数据库、归档 `/app/data`、保存环境与 Compose 配置。备份通过 gzip/tar 校验后生成校验和与 complete 标记。
5. 加载镜像、核对提交／架构／积分精度标签，通过 Compose override 给应用与 MySQL 实际应用日志限制；仅首次配置变化时需要重建 MySQL 容器。
6. 核验 MySQL 健康、应用镜像 ID、应用数据库健康、维护状态接口及日志配置；原子记录成功版本后解除维护并清理已登记旧资料。

生产应用镜像使用专用 `omnistudio` 用户运行。首次升级会在停止旧应用后、启动新应用前检测旧版本以 root 创建的 `/app/data` 命名卷，并只迁移一次目录归属后启动非 root 容器；迁移期间不会删除或覆盖工作区内容。若该目录所在卷禁止修改归属，部署会失败并保留维护状态，需先在停机窗口修复卷权限。

普通部署不改 `.env`，不重写线上模型、提供方或价格，也不依赖外部供应商当时是否在线来决定应用发布成败。

## 备份与清理范围

`/opt/omnistudio-next/backups/attempt…/` 包含 `database.sql.gz`、`appData.tar.gz`、`deploymentConfig.tar.gz`、`checksums`、`complete` 以及必要的回滚记录。备份目录 0700，文件默认 0600，可能含凭据，不应直接开放下载。

如需让备份归档在服务器磁盘上静态加密，先在部署根目录创建仅 root/部署用户可读的随机口令文件：

```bash
umask 077
openssl rand -base64 48 > /opt/omnistudio-next/backupEncryption.key
chmod 600 /opt/omnistudio-next/backupEncryption.key
```

部署脚本检测到该文件后，会使用 OpenSSL AES-256-CBC、PBKDF2（600000 次迭代）加密三个归档，文件名保持不变以兼容保留策略，并在 `encryption` 元数据中记录算法。恢复时先在密文上校验 `sha256sum --check checksums`，再用同一口令文件解密，例如 `openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in database.sql.gz -out database.sql.gz.plain -pass file:/opt/omnistudio-next/backupEncryption.key`，最后对解密后的归档执行 gzip 校验。没有该文件时保持现有未加密流程；口令文件必须纳入独立备份，丢失后无法恢复加密归档。

只清理明确登记的本项目镜像／归档和完整备份；不使用 Docker 全局 prune，不删除数据卷、用户项目、未知历史文件。成功镜像以不可变 ID 登记在 `managedImages/image<digest>`，同一提交反复构建也保留记录；已登记的无标签旧镜像还须核验提交标签、容器引用与保留范围，才能按 ID 删除。当前与回滚镜像始终保护。登记失败只告警并保留资料，需处理告警后再确认清理生效。

已登记的失败上传或未完成备份，超过 7 天后清理已知文件；当前部署备份仍保护。旧数据库备份与未登记历史资料保持原样，不能把它们推断为完整备份。

保留脚本可手工只读预览，参数须使用实际当前提交及需保护的备份名称：

```bash
bash /opt/omnistudio-next/releases/<当前提交>/deploymentRetention.sh \
  /opt/omnistudio-next 3 7 30 <当前提交> attempt<runId>x<runAttempt> --dryRun
```

备份与清理随成功部署执行，当前没有独立每日备份调度，也没有异地备份目的地。频繁部署会在 30 天内保留较多备份，空间预检会在容量不足时拒绝新部署，不会为腾空间删除保护期内的备份。生产数据仍需另配独立存储与定时备份，单机磁盘损坏不能靠本机备份恢复。

容量预检只在部署时执行，不能代替运行期间的容量监控；用户素材与数据库会持续增长。Docker 日志限额也不包含 MySQL binlog、Nginx 与 journald；这些日志需要分别检查保留策略。

## 回滚与人工恢复

备份或发布失败时，恢复旧 Compose 配置并固定回原镜像，检查实际镜像 ID 与健康，全部通过后才能解除维护。普通失败不自动恢复数据库，以免覆盖用户新数据；数据库结构或迁移记录发生变化时禁止自动切回旧程序，保持维护并给出本次备份路径。

SIGKILL、机器掉电、磁盘故障无法保证执行 Bash trap。恢复时先检查容器状态、`deployedCommit`、备份 checksums 与 complete、维护标记及数据库迁移，不应直接删除标记来放开流量。没有验证过的备份不能宣称可恢复；需要实际恢复时应先在隔离环境验证。

首次升级尚无应用门闩的旧版本，需要一次性 Nginx bootstrap 规则：在所有代理到本应用的 location 中加入 `if (-f /opt/omnistudio-next/deploymentBootstrap) { return 503; }`，保留原配置并通过 nginx -t/reload。脚本检测到规则后启用该标记，等待已有 3000 端口连接与生成任务结束；缺规则会安全中止。升级成功后恢复 Nginx 原配置，后续部署使用应用门闩。

旧版浏览器的只读 SSE 订阅也会占用连接，首次升级前应暂时关闭这些测试页面，发布后再打开；脚本不会强制断开未知连接。排空超时会自动解除维护并保留旧应用，待连接释放后可重跑失败的部署任务。新版依据活动操作计数排空，空闲只读订阅不再阻塞发布。

单机部署备份和切换期间仍有短暂维护窗口；这套流程不提供零停机发布。SQL DDL 部分失败可能需要人工恢复，schemaFingerprint 会阻止不明结构下自动回滚。

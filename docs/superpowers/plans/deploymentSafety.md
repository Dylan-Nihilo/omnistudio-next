# 自动部署可靠性 Implementation Plan

> 执行方式：在现有隔离工作区内分工实现并独立复核；用户已授权实施，无需再次选择执行方式。

**Goal:** 为线上部署增加容量预检、完整本地备份、保留策略、日志轮转及可核验的安全回滚。

**Architecture:** GitHub Actions 继续构建镜像，上传前执行服务端容量预检；Bash 脚本统一持锁、排空请求、备份、发布和回滚。应用只增加由本地文件控制的维护门闩和受令牌保护的本机状态接口；保留策略仅处理明确登记的本项目文件。

**Tech Stack:** GitHub Actions、Bash、Docker Compose、Bun/TypeScript、Express、MySQL。

**Spec:** 本轮用户要求与本仓库 AGENTS.md。

## Global Constraints

- 禁止编写或新增任何测试文件，不增加测试框架或自动检查入口。
- 新文件、函数、变量使用小驼峰；不新增依赖。
- 不清理数据卷、用户项目和未知历史文件，不执行全局 Docker prune。
- 默认保留 3 个成功应用版本；完整备份保留最近 7 份与 30 天内备份的并集。
- 磁盘保留至少 5 GiB 余量，并计入本次镜像和备份预计空间。
- 应用与 MySQL 日志使用 json-file，每份 20 MB，最多 5 份。
- 维护期间等待在途任务结束；超时中止，不强制杀掉生成。
- 备份保存在本机受限目录；没有异地存储配置，不声称具备异地容灾。

## Task 1：维护与排空

Files: `apps/server/src/lib/deployment.ts`、`apps/server/src/routes/deployment/status.ts`、`apps/server/src/app.ts`，自动生成的 router。

- [x] 增加同步读取 `deploymentMaintenance` 标记的请求门闩，阻止新任务，允许取消与既有任务回传；跟踪活动请求。
- [x] `/api/deployment/status` 仅允许本机与正确随机令牌，输出维护状态及活动请求数，不输出令牌。
- [x] 执行 `bun run --cwd apps/server routes` 和 `bun run --cwd apps/server typecheck`。

## Task 2：部署编排

Files: `.github/workflows/deploy.yml`、`scripts/deployServer.sh`、`deployCompose.yaml`。

- [x] 使用 GitHub Variables 提供保留数量、天数、空间和日志配置；在 SCP 前检查部署目录和 Docker 根目录所在磁盘。
- [x] 不再覆盖线上 `.env`、模型或价格，不将第三方供应商在线状态作为应用部署成败条件。
- [x] 持有部署锁，开启门闩并等待活动请求及 reserved/running 任务清零；旧版首次迁移只允许无在途时执行，并明确限制。
- [x] 停止应用后成对备份数据库、应用数据卷及配置；校验归档，完成后才切换镜像。
- [x] 通过 override 实际应用日志限制；配置和旧镜像均参与回滚，回滚必须核验容器镜像 ID 和健康。
- [x] 新版本完全健康后原子写入成功记录，再清理；清理失败不回滚健康应用。

## Task 3：保留策略

Files: `scripts/deploymentRetention.sh`。

- [x] 校验根目录与所有参数；只处理白名单下的非符号链接、已登记记录。
- [x] 保护当前与前两个成功版本、所有容器引用的镜像，不删除其他项目镜像。
- [x] 完整备份按“最近 7 份或 30 天内”保留；失败或未知资料保留供人工判断。
- [ ] 提供运维用 `--dryRun`，成功部署后在线上只读预览候选范围。

## Task 4：验证、部署与结果

Files: `docs/deploymentOperations.md`。

- [x] `bash -n scripts/deployServer.sh scripts/deploymentRetention.sh`，解析 YAML，检查差异。
- [x] 使用既有运行环境执行必要构建/类型检查，不创建测试文件。
- [x] 独立复核删除范围、取消回滚、日志生效和维护门闩路径。
- [ ] 提交、推送并执行工作流；线上核验版本、健康、日志限制、完整备份与保留记录。
- [ ] 报告仍需外部条件解决的风险：异地备份、数据库迁移兼容性、单机部署短暂中断。

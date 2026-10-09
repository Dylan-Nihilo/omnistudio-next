# 版本依据与核验说明

核对日期：2026-10-09\
培训日期：2026-10-10\
本地仓库：`D:\personal\万象\AI漫剧\omnistudio-next`

## 本次采用的版本

- GitHub 项目：`Dylan-Nihilo/omnistudio-next`（本地目录的远程配置以仓库实际 `git remote -v` 为准）。
- 当前分支：`feature/mysql-auth-billing`。
- 当前提交：`eed435e`。
- 包管理器：Bun `1.3.14`。
- 本机依赖目录已存在。

已执行只读 `git fetch origin --prune`。远程当前公开分支为 `origin/master`（`da71c31`）；本资料按本机当前开发分支 `feature/mysql-auth-billing` 的 `eed435e` 编写，该分支当前没有对应的远程跟踪分支。培训现场若使用团队部署或安装包，应以页面实际版本和功能为准。

本资料按当前本机 `omnistudio-next` 源码和仓库文档编写，不把旧 `OmniStudio` 目录的页面入口当作新版入口。继续使用《龙族·青铜城七宗罪》的剧本和镜头资料；本轮资产和媒体全部从空工作区重新生成，迁移的是操作路径和节点结构。

## 已核验

- 路由存在 `/auth`、`/auth/login`、`/auth/setup`、`/home`、`/workspace`、`/account`。
- 首页支持开始创作、选择空工作目录、导入项目、重命名和移除列表项。
- 工作区支持画布、文档、AI 对话、设置、自动保存和离开前保存检查。
- 画布源码支持新建/切换/重命名画布、节点菜单、连接、视图操作和多种节点类型。
- 节点 readme 已核对文本、图片、图片生成、视频、视频生成、音频和 3D 导演台能力。
- 设置源码已核对文本模型、媒体模型、插件市场、MCP、开发者选项和 FFmpeg 入口。
- `bun run typecheck` 已执行并通过，所有 workspace 包返回 `Exited with code 0`。

## 已从仓库文档确认但未在团队部署逐点击验证

- 媒体供应商、模型列表和实际生成参数。
- 插件市场中每个工具的版本、读写开关和现场安装状态。
- 视频模型支持的具体时长、分辨率、参考数量和原生音频。
- Agent 在当前账号的工具权限与上下文上限。
- 3D 导演台浏览器/桌面导出能力和 FFmpeg 依赖。

## 本资料明确不声称的内容

- 未声称已经生成《七宗罪》的图片、视频、配音、字幕或最终 MP4。
- 未声称新版存在旧版固定的“一键整集剪辑台”。
- 未把计划 90 秒当作模型实际输出 90 秒。
- 未把 Agent 的提交消息当成媒体完成证据。

## 培训现场必须复核

1. 登录账号是否有创建工作区和使用模型的权限。
2. 文本、图片、视频和音频模型的真实名称、价格和限额。
3. `P07_交易与七宗罪` 是否能一次支持 20 秒；不能时拆为 P07-A/P07-B。
4. 团队是否安装时间线/合成扩展；没有则走外部剪辑。
5. 生成结果、音频、字幕和导出文件的实际保存路径。

## 主要依据文件

以下是 `omnistudio-next` 仓库内的相对路径，用于版本追溯；它们不是本培训包中需要学员另找的文件。

```text
apps/web/src/router/index.ts
apps/web/src/pages/home/index.vue
apps/web/src/pages/workspace/index.vue
apps/web/src/pages/workspace/panels/canvas/index.vue
apps/web/src/pages/workspace/panels/canvas/components/canvasMenu.vue
apps/web/src/pages/workspace/panels/document/index.vue
apps/web/src/components/settings/index.vue
packages/skills/canvas/SKILL.md
packages/skills/canvas/references/videoProduction.md
packages/skills/workflow/references/assets.md
packages/skills/workflow/references/canvasExecution.md
packages/skills/workflow/references/stateAndDelivery.md
packages/tools/canvas/readme.md
packages/tools/workspace/readme.md
packages/tools/mediaGeneration/readme.md
packages/nodes/*/readme.md
```

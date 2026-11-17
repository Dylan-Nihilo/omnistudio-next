# Agent Skill 交互与技能目录评估

**日期：** 2026-11-15<br>
**分支：** `codex/enterprise-comic-p0`<br>
**范围：** 对话框 Skill 选择层级、RunningHub RH STORY 公开入口对照、当前内置 Skill 质量，以及可加入精选市场的公开候选。

## Skill 选择交互

旧版把 AUTO/固定/不使用做成输入框底部工具栏中的高对比三段切换；固定项只有选好 Skill 后才启用，首次使用需要先发现旁边的书本图标。模式状态与技能选择入口分离，空间上也和提及、上下文、发送工具挤在一起。

当前已改为输入框下方的低强调“技能 · 当前方式”入口。菜单解释“自动匹配”“选择固定技能”“不使用技能”各自会发生什么；点击固定会打开已有的 Skill 搜索列表，选中后再进入固定状态，取消列表不会丢失原选择。模式菜单与键入 `/skill:` 打开的搜索列表互斥；切换 Auto/不使用会清理固定 Skill 前缀。无工作区时控件禁用并提供原因提示。

**RunningHub 对照：** 本轮查看的 RH STORY 公开创作入口把剧本导入/输入、画幅、画面/导演风格和“有剧本/有想法/有视频/视频重绘”模式放在同一张主创作卡片中，模式靠近内容和创作配置；该页面没有展示与本系统完全相同的聊天 Skill 三态选择器。因此只借鉴了“靠近任务输入、降低与发送工具的竞争”的位置关系，没有照搬其业务模式或声称其内部 Agent/Skill 架构相同。

## 当前 Skill 质量评估

| 范围 | 评价 | 结论 |
| --- | --- | --- |
| `assetDesign`、`audioSubtitle`、`continuity`、`delivery`、`mediaGeneration`、`reviewQa`、`scriptAnalysis`、`storyboard` | 各约 26–30 行，版本均为 0.1.0；输入/产物名为提示性元数据，加载器不会按这些名称验证 JSON 或数据库结构。多数有必要的授权、连续性和审核边界。`scriptAnalysis`、`reviewQa`、`delivery` 声明 `scriptParser`、`qa`、`assembly` 等生产阶段名，与当前项目状态枚举不一致。 | 适合作为平台行为底线和简明 SOP，尚不足以独立充当完整行业方法。生产接口仍需自己的 Zod/事务校验，并需要对齐真实项目阶段。 |
| `workflow` | 2.7.0，约 1407 行，含完整画布制作路径和 Seedance 专项规则；覆盖范围与阶段 Skill 部分重叠。 | 目前仍是平台主工作流，不直接用通用外部 Skill 覆盖；后续可以按稳定职责拆分并逐步减少重复。 |
| `storyboardTeam/skills/storyboard` | 与全局 `storyboard` 同名，二者分别服务团队成员和全局 Agent，内容有关联但维护位置不同。 | 暂不删除；后续统一规范或明确团队专属扩展关系，避免同名来源让用户困惑。 |

## 新增精选市场候选

已将 `zenstory-ai/drama-skills` v0.11.2 加入官方精选目录，作为可选的第三方个人 Skill 包，不替换现有平台原生 Skill。

- 固定 tag：`v0.11.2`；tag 解析到 commit `3d813c30871b4db5f2387d83bdc3a49db8ce7b2b`。
- 许可证：GitHub API 标为 MIT，固定 ZIP 中也含 LICENSE；GitHub tag 对象存在，但本轮未验证签名，目录依赖固定 commit 与 ZIP SHA-256 锁定内容。
- ZIP SHA-256：`d9617cb80df93a0d96fe2389e27bc6bc9d9311bd384586b9c972b048172396f7`。
- 包含 13 个 Skill，覆盖小说分析、系列开发、剧本、资产、分镜、图片/视频提示词、审查、生产流程和剪辑交付。
- 固定包下载后在临时账户实测安装通过，13 项全部由当前 Skill 加载器识别，0 个错误、0 个警告；临时账户数据已清理，没有安装到真实账户。

**兼容边界：** 上游主要以 Markdown 项目文件作为事实来源，不会自动映射生产项目数据库；部分上游操作提及 Python 3.9、Shell、FFmpeg/ffprobe 或 Remotion adapter。平台不会执行 ZIP 脚本，也不会因安装 Skill 授予这些工具。市场详情已明确这些限制；媒体生产仍须走本平台的报价、预算和用户确认流程。包内 `short-drama-knowhow` 是维护者专项，不应输入普通用户的私密项目资料；对标拆解 Skill 也要求使用已授权的作品。

其他候选处理：当前 `shuohao-skills` v2.1.0 Apache-2.0 包继续保留；`Comfy-Org/comfy-skills` 虽为 MIT，但依赖 Comfy Cloud MCP 且未发现适合固定市场发布的稳定标签，本轮不加入；`awesome-short-drama-skills` 是 CC0 链接聚合而非可直接安装的 Skill 包，也不作为目录项目。

## 后续建议

1. 保持当前原生阶段 Skill 作为平台安全与生产契约说明，基于真实使用反馈补充示例、触发词和到生产数据库字段的映射，不因外部包更长就直接替换。
2. 先观察 ZenStory 包中 `short-drama-storyboard`、`short-drama-review`、`short-drama-assets`、`short-drama-video-prompts` 的个人使用反馈，再挑选内容映射到平台草稿 schema 和权限边界。
3. 若要把某项变为系统内置，重新编写为平台原生 Skill，并把可验证的字段和前置条件放在服务端 schema/事务中；保留来源与改编归属记录。

## 验证

- `apps/server` 与 `apps/web` 的 `bun run typecheck` 通过。
- `apps/server` 与 `apps/web` 的 `bun run build` 通过；Web 构建保留现有大 chunk 警告。
- `git diff --check` 通过。
- 本地浏览器验证：从新入口打开方式菜单，选择“选择固定技能”会展开既有阶段/来源筛选列表；按 Escape 取消后草稿内容未改变。
- 用户现有个人 Skill 未升级、卸载或改写；ZenStory 实际安装验证使用独立临时数据目录。

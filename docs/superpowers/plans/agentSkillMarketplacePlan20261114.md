# Agent、Skill 与技能市场建设计划

**目标：** 在保留现有生产项目、Agent 和插件能力的基础上，补齐可发现、可选择、可安装、可追踪的 Skill 体系，并让 Agent 按制作阶段协作推进漫剧项目。

**现状判断：** 仓库已有 Skill 显式选择、全局技能安装编辑、团队 Agent、生产项目状态与版本化产物。主要缺口是技能包来源与版本不统一、缺少 AUTO 推荐和账户私有范围、没有面向普通用户的技能目录、生产项目尚未与 Agent/Skill 运行记录打通。

**设计原则：** Agent 负责理解目标、分解和交接；Skill 负责阶段方法与质量标准；工具执行读写和生成；生产项目保存唯一可信的阶段状态、版本和审批。Skill 不授予工具权限，市场不自动触发生成。

## 市场模式

- RunningHub 的公开体验提供 Skill/AUTO 选择，再以多轮对话逐步修改结果；其漫剧应用又把脚本整理、资产创建、分镜图生成做成不同阶段的可运行应用。公开资料没有披露其内部 Agent 拓扑。[Agent 使用指南](https://www.runninghub.cn/blog/ai-applications/what-is-an-ai-agent) · [脚本应用](https://www.runninghub.cn/ai-detail/2013835413944803329) · [资产应用](https://www.runninghub.cn/ai-detail/2005959329352216578) · [分镜图应用](https://www.runninghub.cn/ai-detail/2012065350921228290)
- Comfy Cloud 将 Agent 绑定到明确工作流，支持模板复用、局部编辑、运行校验，并将“每次确认”与“自动运行”分开；产品内 Skill 与外部 Coding Agent 插件也分开管理。[Comfy Agent](https://docs.comfy.org/agent-tools/in-app-agent.md) · [Comfy Agent Skills](https://docs.comfy.org/agent-tools/in-app-agent-skills.md)
- Anthropic Agent Skills 采用按需加载；LangGraph/CrewAI 用显式流程状态管理分支、暂停和恢复。适合借鉴的是“技能按需读、流程状态持久化”，而不是把整条流水线塞进一个超长 prompt。[Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) · [LangGraph 持久化](https://docs.langchain.com/oss/python/langgraph/persistence) · [CrewAI Flows](https://docs.crewai.com/en/concepts/flows)
- [shuohao-skills v2.1.0](https://github.com/eternityspring/shuohao-skills/tree/v2.1.0) 提供六个短剧 Skill，许可证为 Apache-2.0，包含 LICENSE/NOTICE；阶段交付与质量门值得借鉴。它以 JSON/Markdown 文件作为项目事实来源，部分内容依赖 Node 脚本，因此先作为有兼容限制的第三方市场包，不直接并入本机生产数据库流程。
- [ZenStory Drama Skills](https://github.com/zenstory-ai/drama-skills) 有一组覆盖短剧全流程的 MIT Skill，但当前仓库没有固定版本标签，本轮不提供安装入口。待上游提供稳定版本并完成逐项兼容审查后再评估。
- [Comfy-Org/comfy-skills](https://github.com/Comfy-Org/comfy-skills) 使用 MIT，但主要通过 Comfy Cloud MCP 执行；目前只借鉴 Skill、工具与工作流分层，不伪装成本机内置能力。

## 仓库基线

- 对话输入框已有 Skill 菜单，支持搜索和显式插入 `/skill:<name>`；加载范围是工作区 `skill/` 与全局 `data/skills/`，同名时工作区版优先。没有 AUTO 推荐、固定/禁用本轮 Skill、阶段分类浏览或账户私有范围。[skillMenu.vue](../../../apps/web/src/components/agent/skillMenu.vue) · [技能加载器](../../../apps/server/src/agent/skills/index.ts)
- 管理页能够安装、编辑、卸载全局 Skill，来源是本地文件或直接 URL；它是扩展管理器，不是有搜索、详情、兼容性和版本渠道的技能市场。[extensionPanel.vue](../../../apps/web/src/pages/admin/extensionPanel.vue) · [技能安装器](../../../apps/server/src/utils/plugins/install.ts)
- 源码发布的全局 Skill 已包含 `workflow`、`canvas` 和从当前安装副本原样纳入的八个阶段 Skill。团队私有的 `storyboard` 与全局同名项不同。发布目录与用户安装副本需保持来源清楚，不能把本机数据目录当产品清单。
- 漫剧生产项目已有项目/剧集/场景/镜头、脚本草稿与版本、资产和参考图版本、生成任务与候选版本、审片审批、成片与交付状态。生产主状态为 `draft → scripted → storyboarded → generating → editing → review → approved → delivered`；生成报价、幂等、审片和导出校验已有实现。[生产项目服务](../../../apps/server/src/services/productionProjectService.ts) · [生产项目页面](../../../apps/web/src/pages/productionProjects/detail.vue)
- `storyboardTeam` 已有 director、writer、reviewer 三个边界清晰的文字分镜成员，适合作为专用协作单元；不需要把每个 Skill 都新建成一个 Agent。[团队清单](../../../packages/teams/storyboardTeam/team.json)

## 目标体验

用户可从“直接描述目标”开始，也可在输入框显式选择 Skill。用户可按需选择 AUTO、固定 Skill 或本轮不使用 Skill。当前 AUTO 首版只按输入文本与 Skill `metadata.triggers` 命中推荐并展示理由，不读取生产项目阶段；项目阶段推荐放到阶段四接入项目状态后再做。发送后界面显示本次采用的 Skill、作用域和版本。执行步骤仍落在项目对象和现有工作台，不另造一套平行生产数据。

技能市场首期提供官方精选内容：按制作阶段和用途发现、看详情与示例、查看作者/来源/版本/兼容范围/所需工具权限，安装到明确的作用域。普通用户可管理自己的技能；管理员管理官方全局技能。社区投稿、评分和公开分发放到后续阶段。

最初的管理员市场 MVP 只开放 root 管理的全局精选目录；阶段三 A 在其基础上增加普通用户浏览和账户私有安装。升级差异、回滚、暂停 AUTO 与社区投稿仍属于后续阶段。

制作入口提供两种节奏：快速创作由一个 Agent 选择少量 Skill 完成局部任务；项目制作由制作主 Agent 根据现有阶段安排工作、提交产物并等待必要确认。专业 Agent 只用于职责清晰、可并行或需要独立审阅的任务。所有写入都指向具体项目、剧集、镜头或资产 ID，避免界面切换后落错目标。

## 分期路线

### 阶段一：统一技能库存与发布来源

- 盘点源码 `packages/skills`、当前 `data/skills`、团队私有 Skill 和 MCP 外部 Skill；为每项记录用途、当前版本、作用域、使用入口和维护状态。
- 审核八个本机阶段 Skill 与现有生产项目能力是否重复或过时。确认保留的内容迁入受版本控制的源码包；本地安装副本按现有安装策略升级，不默认覆盖用户修改。
- 统一 Skill 元数据：稳定 `name`、显示名、描述、分类/制作阶段、输入和产物、版本、作者、来源、兼容版本、所需工具及其风险级别。Skill 正文仍按需加载，references 保持独立文件。
- 明确四类作用域：工作区、账户私有、团队私有、官方全局；外部客户端导出作为独立分发目标。列表和调用都显示来源；存在同名项时由用户选定，或由显式规则解析并告知，不再悄悄覆盖。
- 核对服务构建、首次启动安装和内置团队同步。保证新安装可以复现官方清单，同时保留已有 `data/` 用户自定义内容。

**验收：** 新的干净安装与源码清单一致；八项本地阶段 Skill 有明确的保留/弃用结论；团队私有与全局同名 Skill 可区分；升级不会静默删除或覆盖用户文件。

### 阶段二：升级 Skill 选择和 AUTO 推荐

- 保留现有搜索与 `/skill:<name>` 兼容入口；菜单改为可按阶段、用途、作用域浏览，并显示 Skill 简介、版本和来源。
- 增加 AUTO、显式固定、清除选择三种使用方式。AUTO 首版按 Skill 的 `metadata.triggers` 与当前输入文本命中推荐；匹配不到时不强行套用。它不读取生产项目阶段，等阶段四关联项目状态后再扩充排序依据。
- 发送前展示本轮固定 Skill；执行时记录实际采用的 Skill、版本、来源和选择方式（自动/手动）。运行中 Skill 正文和 references 仍按需加载。
- 支持用户本轮禁用某项推荐，及在对话中移除/更换 Skill；不把 Skill 自动写入后续任务偏好，除非用户主动保存偏好。
- 避免重复的全流程“workflow” Skill 与阶段 Skill互相冲突：workflow 负责入口路由和阶段衔接，阶段 Skill 负责一项 SOP；通过元数据声明可组合关系和冲突关系。

**验收：** 用户无需记命令即可通过阶段、来源筛选和描述搜索找到并选择 Skill；AUTO 基于输入触发词说明推荐依据，用户可覆盖；发送时使用与当前输入和工作目录匹配的推荐，失败或无匹配时走通用 Agent；执行日志能还原实际使用的版本；编辑、重发和恢复会话不会串用选择状态。

### 阶段三 A：普通用户官方市场与个人安装

- 新建普通用户可访问的市场浏览入口；首期仅上架官方精选 Skill。提供搜索、阶段分类、详情页、版本记录、兼容范围、示例输入/输出、来源与权限说明。
- 市场目录保存版本、许可证、来源提交、SHA-256 和固定包地址；安装前验证摘要、包内 Skill 名称清单，再复用现有安全解包与当前加载器预检，安装到当前账户私有目录。遇到该账户或全局目录中的同名项时阻止安装，不覆盖既有内容。
- 建立官方来源与发布审核规则；Skill 只能申请使用工具，是否具备工具仍由当前账户、项目和插件权限决定。Markdown 内容按不可信输入处理，不执行包内脚本。
- 社区投稿不在本阶段开放。

**验收：** 普通用户可在产品内搜索、筛选、查看官方技能详情并安装到自己的账户；目录明确显示来源、许可证、版本、加载器兼容预检方式和上游工具要求；未登录、跨账户访问和同名安装均被拒绝；安装不会执行包内脚本，也不会开启或授予工具权限。

### 阶段三 B1：个人 AUTO 管理

- 显示个人已安装 Skill 的版本、来源、作用域和自动推荐状态；支持逐项暂停/恢复 AUTO 推荐。
- 暂停偏好保存在当前账户私有目录，不影响其他账户，也不改动 Skill 文件。

**验收：** 暂停后的 Skill 不会被 AUTO 推荐；恢复后重新参与匹配；登录用户间偏好隔离；Skill 正文与固定选择功能保持可用。

### 阶段三 B2a：升级差异与本地修改检测

- 用固定 SHA 和包内名称清单验证版本包，按每个技能的相对文件路径与 SHA 展示新增、修改、删除。
- 对没有安装来源记录的旧个人安装，只有完整目录与某个固定官方版本逐文件匹配才认定为官方基线；不匹配时列出本地修改并阻止覆盖。

**验收：** 真实 v2.0 与 v2.1 包可生成确定差异；已编辑文件能被定位；本地修改状态不能通过 UI 发起覆盖。

### 阶段三 B2b：安全升级、恢复与卸载

- 支持升级个人安装包和卸载个人包，操作前备份完整文件及来源记录。
- 备份保存来源、版本、文件清单和压缩包摘要；单账户最多保留 10 份，清理过期备份目录。升级失败或用户回滚时可恢复完整旧版本，恢复前校验备份内容与路径。
- 社区市场继续延后；开放前补齐作者身份、许可、签名/校验、举报与撤回、恶意内容审查、评价反作弊和版本撤回机制。

**验收：** 个人 Skill 可卸载；升级差异与本地修改可见；更新前有备份，失败和用户回滚均恢复到完整旧版本；操作不会改变工具授权。

### 阶段四：接入漫剧项目的 Agent/Skill 编排

- 以现有项目、脚本/镜头/资产/生成任务/审片/交付表为状态事实来源。先给 Agent 会话关联 `projectId`、阶段及目标对象 ID；只有现有会话文件和生成任务记录不足以恢复任务时，才新增持久化的生产 Agent 运行记录。
- 制作主 Agent 负责理解目标、读取当前状态、选择阶段 Skill、提出可执行任务并衔接阶段；它不自行维护一份与生产数据库竞争的“项目进度”。
- 将技能与现有阶段对齐：剧本分析/改编 → 分镜 → 资产与参考 → 提示词/生成 → 连续性与 QA → 音频字幕 → 剪辑交付。阶段 Skill 输出填入现有草稿、镜头、资产版本、审查意见等对象，而不是只留在聊天回复。
- 复用 `storyboardTeam` 做文字分镜试点，输入项目当前脚本与约束，输出待确认分镜草稿；先由用户确认后落到正式镜头。随后再接入资产规划和 QA 建议，不让 Agent 直接批准素材或发布成片。
- 生成继续调用已有报价、预算、幂等和任务 API。触发前确认对象、数量、模型、规格、提示词和预计积分；候选采用、返工、覆盖和交付分别沿用现有审批权限。
- 为输入与产物建立引用快照：脚本版本、资产版本、镜头 revision、提示词、模型参数、Skill 版本和生成任务 ID。上游变化时标记受影响的下游结果需复核，不自动删除或重生成。
- 设计可恢复运行：按阶段记录 queued/running/waitingInput/waitingApproval/completed/failed/cancelled；切换页面、服务重启或补充输入后可回到同一运行上下文，失败后先核对副作用再重试。

**验收：** 对一个现有生产项目可从脚本或指定镜头开始，不重做已确认阶段；Agent 的产物可查看、编辑和审批；生成未经授权不会启动；候选和最终成片的来源可追溯；中断后不会重复创建镜头或重复扣费。

### 阶段五：扩展 Agent 团队与创作者生态

- 根据阶段四的使用记录决定是否需要固定的资产、生成导演、QA 或交付 Agent。只有出现稳定、独立且需要专门权限/上下文的职责才新增成员。
- 每个 Agent 配置明确的目标、可用工具、可委派成员和可写入对象；审核 Agent 默认只读并输出建议，不能替人批准。
- 团队 Skill 与官方/个人 Skill 使用不同来源和授权标识；团队安装、更新、远端 A2A 和项目权限分开管理。
- 官方目录稳定后再开放社区技能；先做审核和信任体系，再加评分/评论与推荐排序。推荐排序优先兼容性、维护状态和安全信息，不单按热度。

**验收：** Agent 数量由实际职责驱动；团队工具授权最小化；审核与执行角色分离；社区包来源、版本和撤回状态可查。

## 执行顺序与范围控制

1. 阶段一已将八个本机阶段 Skill 纳入源码，并保留其安装内容不变；干净安装与升级同步行为已有独立报告。
2. 阶段二已完成用户侧 Skill 筛选、AUTO/固定/不使用选择、推荐记录与会话恢复，并通过独立验收；近期将模式控件收敛到输入框下方，固定选择直接打开技能列表。
3. 阶段三 A、B1、B2a 与 B2b 已分别通过独立验收；阶段四已开始生产项目 Agent 编排垂直切片。
4. 阶段四垂直切片已完成基础实现和拒绝路径实测，真实模型生成、草稿恢复和确认写入仍待用户确认积分后的端到端验收，再扩到生成和交付。
5. 阶段五依赖阶段四真实使用数据，避免先造一组长期无人使用的固定 Agent。

本计划是总路线图；阶段一至三（Skill 平台）、阶段四（生产 Agent 编排）、阶段五（生态）应分别拆成可独立评审的实现计划。每个实现阶段按仓库规范验证类型检查、构建和手动操作流程；不新增测试文件。

阶段三 B2b 验收证据：[个人 Skill 升级、回滚与卸载报告](../reports/agentSkillMarketLifecyclePhaseAcceptance20261115.md)。生命周期锁目前依赖单进程运行；跨进程部署需要共享锁或数据库事务后再开放并发写入。

Skill 选择交互和第三方目录评估：[Agent Skill 交互与技能目录评估](../reports/agentSkillUxAndCatalogReview20261115.md)。已在精选市场加入固定到 ZenStory Drama Skills v0.11.2 commit/SHA 的 MIT 技能包；仅作为个人可选文件式工作流，不覆盖平台原生 Skill，也不获得 Python、Shell 或媒体工具权限。

## 本轮实现

- 当前分支：`codex/enterprise-comic-p0`；不切换或修改 `master`。
- 已将八个本机阶段 Skill 原样加入 `packages/skills`，作为新安装可分发的全局 Skill。
- 已增加管理员技能精选目录，收录固定到 `shuohao-skills` v2.1.0 commit 的 ZIP 包；Apache-2.0 的 LICENSE 和 NOTICE 由现有安装器保留。
- 已将 `zenstory-ai/drama-skills` v0.11.2 作为 MIT 第三方精选包加入目录；隔离账户安装 13 项 Skill 的加载器预检通过，不自动替换原生 Skill。
- 已限制目录安装只接收固定 `packageId`，复用现有安全归档解析和 root 权限；不强制覆盖已有 Skill。源码内置 Skill 同步会安装缺失目录，并保留已存在的用户编辑。
- 已完成阶段二的按阶段/来源筛选、AUTO/固定/不使用选择、按输入触发词推荐和运行版本记录。
- 尚未完成：阶段四真实模型生成与草稿确认的端到端验收、之后基于使用数据评估的固定 Agent 团队扩展。
- 阶段四分镜 Agent 垂直切片已实现基础链路；全链路验收证据：[阶段四分镜 Agent 验收报告](../reports/productionStoryboardAgentPhaseAcceptance20261115.md)。
- 阶段验收证据：[Skill 库与管理员精选市场报告](../reports/skillMarketPhaseAcceptance20261114.md) · [Agent Skill 选择与 AUTO 报告](../reports/agentSkillSelectionPhaseAcceptance20261115.md) · [普通用户市场与个人安装报告](../reports/agentSkillMarketUserPhaseAcceptance20261115.md) · [个人 AUTO 管理报告](../reports/agentSkillMarketAutoPausePhaseAcceptance20261115.md) · [个人 Skill 更新差异预览报告](../reports/agentSkillMarketDiffPreviewPhaseAcceptance20261115.md) · [个人 Skill 升级、回滚与卸载报告](../reports/agentSkillMarketLifecyclePhaseAcceptance20261115.md)。

## 相关基线文件

- Skill 选择与加载：[skillMenu.vue](../../../apps/web/src/components/agent/skillMenu.vue)、[conversation.vue](../../../apps/web/src/components/agent/conversation.vue)、[skills/index.ts](../../../apps/server/src/agent/skills/index.ts)、[skillOperator](../../../packages/tools/skillOperator/src/index.ts)
- 安装与管理：[extensionPanel.vue](../../../apps/web/src/pages/admin/extensionPanel.vue)、[技能路由目录](../../../apps/server/src/routes/skills)、[install.ts](../../../apps/server/src/utils/plugins/install.ts)
- 精选市场：[skillMarket.vue](../../../apps/web/src/components/settings/panels/skillMarket/skillMarket.vue)、[catalog.ts](../../../apps/server/src/utils/skills/catalog.ts)、[市场路由目录](../../../apps/server/src/routes/skills/catalog)
- Agent 与团队：[subAgent.ts](../../../apps/server/src/agent/tools/subAgent.ts)、[teams/index.ts](../../../apps/server/src/agent/teams/index.ts)、[storyboardTeam](../../../packages/teams/storyboardTeam/team.json)
- 生产项目：[productionProjectService.ts](../../../apps/server/src/services/productionProjectService.ts)、[生产页面](../../../apps/web/src/pages/productionProjects/detail.vue)、[脚本生成入口](../../../apps/web/src/lib/productionScriptCreation.ts)

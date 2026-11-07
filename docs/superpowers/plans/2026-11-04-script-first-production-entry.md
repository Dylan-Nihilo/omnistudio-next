# 剧本优先生产入口改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将生产项目首屏从手工录入剧集/镜头改为“编写或导入剧本 → 预览结构 → 确认创建剧集骨架 → 进入企业生产工作台”。

**Architecture:** 保留现有 `productionProjects` 项目、预算、权限、分镜、生成、审片、批准和交付链路；在 `detail.vue` 的 `scripted` 阶段增加剧本入口工作区。剧本入口只负责编辑/导入文本、生成结构预览和调用现有剧集/镜头接口创建结构草稿，创建成功后推进项目到 `scripted`，用户再进入分镜工作台。首次实现不调用真实供应商，不消耗积分。

**Tech Stack:** Vue 3、TypeScript、现有 `@omnistudio-next/ui`、Express/Zod 现有生产项目接口、浏览器 Playwright 黑盒验证。

**Spec:** `docs/enterpriseComicPlatformUpgradePlan.md` 第 6、8 节及 `docs/lingjingEnterpriseComparisonReport.html` 的灵境实测链路。

## Global Constraints

- 所有回答和新增代码说明使用中文。
- 不新增测试文件；只运行现有类型检查、构建、差异检查和浏览器实际验证。
- 不调用真实图片/视频/音频供应商，不消耗灵境或供应商积分。
- 复用现有生产项目接口和 UI 组件，避免新增依赖。
- 文件名遵守项目小驼峰规则。
- 业务对象仍以项目、剧集、场景、镜头为事实源，画布不作为唯一事实源。

### Task 1: 剧本优先工作区

**Files:**
- Modify: `apps/web/src/pages/productionProjects/detail.vue`

**Interfaces:**
- Consumes: 当前项目详情、现有 `/api/productionProjects/episodes/create` 和 `/api/productionProjects/shots/create` 接口。
- Produces: 剧本编写/导入工作区、结构预览、创建结构草稿操作、项目状态推进。

- [ ] 在 `scripted` 阶段增加“编写剧本”和“导入剧本”两个模式，提供题材/创意文本、脚本正文、风格、画幅、集数、单集时长字段。
- [ ] 使用原生文件选择读取 `.txt/.md` 内容，不上传外部服务；导入内容回填正文和文件名。
- [ ] 实现本地结构解析：按“第 X 集”和“场景 X”标题识别剧集/场景；无标题时生成单集单场景草稿，所有解析结果显示为草稿。
- [ ] 提供“预览剧集结构”操作，展示集数、场景数、镜头数和待创建内容；未确认前不写入服务端。
- [ ] 提供“确认并创建剧集骨架”操作，顺序调用现有剧集/镜头创建接口，成功后调用现有项目保存接口将状态推进为 `scripted`，再刷新项目。
- [ ] 保留“进入分镜工作台”操作，已有剧集时直接切换到 `storyboarded` 查询阶段。
- [ ] 在脚本入口隐藏供应商、模型、工作目录和积分细节，仅在生成阶段显示。

### Task 2: 入口与企业视图衔接

**Files:**
- Modify: `apps/web/src/pages/productionProjects/index.vue`
- Modify: `apps/web/src/pages/productionProjects/detail.vue`

**Interfaces:**
- Consumes: Task 1 创建结构草稿后的项目状态。
- Produces: 创建项目后默认进入剧本入口；已有项目可从项目卡进入企业工作台。

- [ ] 新建项目弹窗保留项目名、客户 ID 和预算，但把客户 ID、预算收进“高级项目设置”文案，避免首屏压迫。
- [ ] 创建项目后保持进入 detail，但 detail 默认选择 `scripted` 阶段并将剧本工作区置于主视觉。
- [ ] 项目详情顶部提供“进入企业生产工作台”入口，不删除现有四阶段流程、预算、权限和审计信息。
- [ ] 已有剧集项目进入 detail 时显示脚本摘要和“继续分镜”入口，避免重复创建。

### Task 3: 验证

**Files:**
- No test files.

**Interfaces:**
- Consumes: Task 1、Task 2 页面。
- Produces: 可复核的浏览器验证证据。

- [ ] 运行 `bun run --cwd apps/web typecheck`。
- [ ] 运行 `bun run --cwd apps/web build`。
- [ ] 运行 `git diff --check`。
- [ ] 登录本地账号，创建或打开草稿项目，确认默认进入剧本入口。
- [ ] 点击“导入剧本”，选择本地 txt/md，确认正文显示并生成结构预览。
- [ ] 点击“确认并创建剧集骨架”，确认剧集/场景/镜头写入且项目状态变为“已编剧”；不点击真实生成按钮。
- [ ] 点击“继续分镜”，确认进入现有分镜工作台。
- [ ] 记录本地预览地址和验证结果。



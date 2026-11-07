# 沉浸式生产项目与我的画布入口改造计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将首页主任务调整为团队生产项目，并把生产项目详情与“我的画布 / 新建画布”改成专注漫剧创作的连续入口。

**Architecture:** 保留现有生产项目 API 和 `/productionProjects/:projectId` 路由，给详情页提供沉浸式壳层以隐藏团队后台导航。首页读取当前团队的生产项目作为最近项目；个人无限画布仍使用 `/workspace`，通过创建工作区后进入全屏画布。画布空状态增加与灵境相似的创作引导按钮，按钮复用现有 Agent 和画布能力，不新增供应商接口。

**Tech Stack:** Vue 3、TypeScript、Vue Router、Pinia、现有 `@omnistudio-next/ui`、Vue Flow、SCSS。

**Spec:** 用户提供的京东云灵境首页与无限画布截图，以及本次对话中确认的“生产项目优先、专注漫剧开发、我的画布新建与引导”要求。

## Global Constraints

- 所有新文件、组件、绑定名和 DOM 类名使用小驼峰。
- 不新增测试文件；使用现有类型检查、构建和浏览器手动点击验证。
- 不复制京东源代码、品牌资源或图片；只参考信息架构和交互层级。
- 生产项目详情继续继承项目权限、预算和审计逻辑。
- 画布入口不直接调用真实供应商，只有 Agent 引导或现有画布节点操作。

---

### Task 1: 首页改为团队生产项目入口

**Files:**
- Modify: `apps/web/src/pages/home/index.vue`

**Interfaces:**
- Consumes: `GET /api/productionProjects/list?workspaceId=<currentTeamId>`、`auth.currentTeamId`、现有 `router`。
- Produces: 首页“生产项目”列表、状态/预算/角色摘要和进入 `/productionProjects/:id` 的操作；“我的画布 / 新建画布”入口继续调用现有 `createProject`。

- [ ] **Step 1: Replace the recent local-project data section**

  将首页“最近项目”数据改为当前团队的生产项目类型，保留加载、错误和空状态；点击卡片进入 `/productionProjects/:id`。生产项目加载失败时显示已有 `showError` 反馈，未选择团队时显示引导。

- [ ] **Step 2: Rename the canvas creation surface**

  将首页主导航和创作卡片文案调整为“我的画布”和“新建画布”，保留工作目录选择和现有 `createProject` 的文件校验逻辑；不删除用户已有的本地画布能力。

- [ ] **Step 3: Remove obsolete local-project-only actions from the home project section**

  首页生产项目列表不再调用本地目录项目的重命名、移除、导入操作；这些能力仍由 `/workspace` 的画布菜单负责。

- [ ] **Step 4: Run typecheck for the page change**

  Run: `bun run --cwd apps/web typecheck`

  Expected: exit code `0`。

---

### Task 2: 生产项目详情进入沉浸式漫剧工作台

**Files:**
- Modify: `apps/web/src/components/account/accountShell.vue`
- Modify: `apps/web/src/pages/productionProjects/detail.vue`

**Interfaces:**
- Consumes: `accountShell` 的现有标题、操作插槽和响应式布局；详情页现有项目 API 与阶段工作台。
- Produces: `immersive` 壳层模式，详情页点击项目后隐藏后台左侧导航并保留返回项目列表、刷新、交付操作。

- [ ] **Step 1: Add an optional immersive prop to accountShell**

  增加 `immersive?: boolean`，默认 `false`；根节点添加 `immersive` class，在该模式下隐藏 `accountSidebar`，`accountMain` 使用全宽和更紧凑的顶部项目栏。

- [ ] **Step 2: Enable immersive mode in production detail**

  将详情页的 `<accountShell>` 改为 `:immersive="true"`，页面标题和阶段工作台继续复用现有实现；不要复制生产项目 API 或阶段逻辑。

- [ ] **Step 3: Verify stage navigation remains usable**

  手动确认草稿项目仍首先显示“编写剧本”，确认结构后可进入分镜；返回、刷新和交付按钮仍可见且可点击。

---

### Task 3: 无限画布增加灵境式创作引导

**Files:**
- Modify: `apps/web/src/pages/workspace/panels/canvas/index.vue`

**Interfaces:**
- Consumes: 当前画布的 `flowData`、`canvasReady`、`workspaceStore.project`、`pendingAgentMessage`。
- Produces: 空白画布中央的“剧本生成、图片生成、视频生成、智能剪辑、3D 导演台”引导条；点击后通过现有 Agent 发送带有明确创作意图的消息。

- [ ] **Step 1: Add empty-canvas computed state and guided prompts**

  以 `canvasReady && flowData` 中没有节点为显示条件，定义固定的中文引导项和提示词；不改变已有画布文件读写逻辑。

- [ ] **Step 2: Render the guide overlay inside the canvas**

  在 Vue Flow 内容上层增加可访问的空态区域：标题“从这里开始你的漫剧创作”、说明“双击添加节点或从下面开始”，按钮文案与截图保持同一信息层级；按钮使用 `@click.stop`，避免触发画布缩放或节点菜单。

- [ ] **Step 3: Connect guide actions to the existing Agent**

  设置 `workspaceStore.pendingAgentMessage`，并保留现有 Agent 面板的自动消费逻辑；没有工作目录时不发送消息并显示已有错误反馈方式。

- [ ] **Step 4: Verify the empty guide does not block a populated canvas**

  手动打开空画布确认引导出现；添加任意节点后确认引导隐藏；刷新后确认节点和画布仍可正常保存。

---

### Task 4: 集成验证与预览交付

**Files:**
- Verify: `apps/web/src/pages/home/index.vue`
- Verify: `apps/web/src/components/account/accountShell.vue`
- Verify: `apps/web/src/pages/productionProjects/detail.vue`
- Verify: `apps/web/src/pages/workspace/panels/canvas/index.vue`

- [ ] **Step 1: Run checks**

  Run:

  ```text
  bun run --cwd apps/web typecheck
  bun run --cwd apps/web build
  git diff --check
  ```

- [ ] **Step 2: Perform browser click verification**

  验证链路：登录 → 首页看到当前团队生产项目 → 点击项目进入沉浸式详情 → 确认“编写剧本”入口 → 返回首页 → 点击“我的画布 / 新建画布” → 进入 `/workspace` → 空画布显示引导 → 点击“剧本生成”后 Agent 获得引导消息。

- [ ] **Step 3: Open the reviewable preview**

  打开 `http://localhost:5173/app/#/home`，并保留一个生产项目详情 URL 和一个 `/workspace` URL 供审阅。


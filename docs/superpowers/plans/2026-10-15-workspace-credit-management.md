# 工作区与团队积分管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Follow the repository implementation instructions and verify each change before claiming completion.

**Goal:** 在平台管理用户列表中展示并筛选工作区，在团队成员列表中展示可用积分并打开积分消耗详情，同时统一团队表格的居中显示并明确已解散团队的归档行为。

**Architecture:** 复用现有用户、团队成员和积分流水模型。管理用户接口通过团队成员关系聚合工作区信息并支持查询筛选；团队成员接口返回钱包可用积分，并提供带团队权限校验的成员流水接口；前端在现有页面和 `uiTable` 样式基础上增加筛选、详情弹窗与居中列配置。

**Tech Stack:** Bun、TypeScript、Express、Drizzle ORM、Vue 3、现有 `@omnistudio-next/ui` 组件。

**Spec:** 当前会话中的用户需求。

## Global Constraints

- 遵守仓库 AGENTS.md：自有文件、变量、模板标签和 DOM 类名使用小驼峰；`.vue` 顶层顺序为 template → script → style。
- 复用现有 `accountApi`、积分账本字段、`uiTable` 与积分格式化工具，不新增重复请求封装。
- 不新增任何测试文件；验证使用类型检查、构建及必要的手动接口/页面检查。
- 团队解散沿用现有归档模型，保留资产以支持 root 恢复；界面文案需明确“已解散”仍存在的原因。

### Task 1: 管理用户工作区列与筛选

**Files:**
- Modify: `apps/server/src/services/billingService.ts`
- Modify: `apps/server/src/routes/admin/users/list.ts`
- Modify: `apps/web/src/lib/accountApi.ts`
- Modify: `apps/web/src/pages/admin/index.vue`

**Interfaces:**
- `GET /api/admin/users/list?workspaceId=<uuid>` 返回 `workspaces: [{ id, name, status }]`；省略参数返回全部用户。

- [x] 在服务端聚合用户的工作区成员关系，支持可选工作区筛选。
- [x] 在前端增加工作区列和工作区下拉筛选，基于已加载用户数据更新列表。
- [x] 运行 server/web 类型检查。

### Task 2: 团队成员积分与消耗详情

**Files:**
- Modify: `apps/server/src/services/teamService.ts`
- Modify: `apps/web/src/lib/accountApi.ts`
- Modify: `apps/web/src/pages/teams/index.vue`

**Interfaces:**
- `GET /api/account/teams/members?teamId=<uuid>` 返回 `available` 字段。
- 通过 `GET /api/account/teams/ledger?teamId=<uuid>&userId=<uuid>&limit=<n>` 查看同团队成员积分流水。

- [x] 为团队成员查询关联钱包并计算可用积分。
- [x] 前端将可用积分显示为可点击控件，点击后加载并展示该成员的积分流水与消耗明细。
- [x] 保持当前用户权限校验，错误时沿用页面错误提示。
- [x] 运行 server/web 类型检查和构建。

### Task 3: 团队表格居中与解散说明

**Files:**
- Modify: `apps/web/src/pages/teams/index.vue`

- [x] 将团队资产、团队成员表头和数据列统一设置为居中；操作列保持可读的居中布局。
- [x] 在已解散团队的提示和选择项中说明团队仍保留是为了归档资产与 root 恢复，避免误解为删除失败。
- [x] 通过现有状态条件检查 active、archived 两种团队状态的操作可用性。

### Verification

- [x] 在 `apps/server` 执行 `bun run routes`（仅当路由文件发生变化）。
- [x] 在 `apps/server` 执行 `bun run typecheck` 与必要的 `bun run build`。
- [x] 在 `apps/web` 执行项目已有类型检查/构建命令。
- [x] 检查 `git diff`，确认没有新增测试文件或无关改动。

# 企业漫剧 P0 纵切改造实施计划

## 当前执行状态（2026-10-30）

- 分支：`codex/enterprise-comic-p0`。
- 阶段一已完成代码实现：生产项目层级、项目成员角色权限、项目创建/列表/详情/保存 API；详情接口已覆盖全部季、集、场景和镜头。
- 阶段二已完成代码实现：剧集/镜头写入、镜头保存、生成任务与项目层级绑定、预算检查、成本快照、幂等键、候选片段和重拍 attempt。
- 阶段三已完成代码实现：评论、`changesRequested` 退回、候选批准、批准后锁定和审计。
- 阶段四已完成代码实现：批准完整性门禁、FFmpeg MP4、SRT、manifest、审计包和交付状态。
- 阶段五 Task 9 已完成代码实现：生产项目列表、项目详情、剧集/镜头创建、生成入口、审片决策入口和交付导出入口已接入 Vue 路由与账户导航。
- 阶段五 Task 10 已完成最小实现：审片意见单独落库，项目详情返回并展示交付记录、MP4/SRT/manifest/审计包路径和 manifest 哈希。
- 已验证：路由生成、服务端类型检查、服务端构建、全仓类型检查、`git diff --check`、实际 MySQL 迁移、登录后项目/剧集/镜头创建、完整详情读取、越权工作区返回 403、余额不足生成返回 402 且镜头回到 `ready`。
- 已通过浏览器实际点击：登录开发账号、进入“生产项目”、打开项目详情、确认 owner 权限与预算显示、打开剧集/镜头创建弹窗、提交带 `480p` 分辨率的百度 S2.0 Mini 生成请求、确认余额不足提示、确认未批准项目导出被 409 阻断；控制台无 error/warning 日志。
- 尚未完成：配置真实媒体供应商密钥后的真实生成与 FFmpeg 交付成片验证；当前开发账号余额为 0，浏览器测试未触发任何供应商扣费。详情页已补齐视频分辨率字段，避免报价阶段因缺少分辨率而误阻断。
- 说明：带决定的审片意见与批准已在服务端同一事务写入，避免出现孤立评论；审片弹窗已支持候选图片、视频和音频预览。审计 JSON/CSV 下载仍列入后续增量。
- 数据库迁移按 `userIdentityProduction01Project` → `02Delivery` → `03Generation` → `04Review` 排序，避免新库初始化时引用尚未创建的用户/项目表。

> **For agentic workers:** 本计划按阶段执行，仓库禁止新增测试文件；每个阶段使用类型检查、构建和必要的实际 HTTP 验证作为验证手段。

**Goal:** 在 `codex/enterprise-comic-p0` 分支上，把工作区/画布型底座改造成可追踪企业漫剧项目，并逐阶段跑通项目、权限、生成、预算、审片、重拍和交付证据链。

**Architecture:** 以结构化生产项目作为业务事实源，画布只保存布局和编排引用。服务端统一负责项目权限、预算预留、生成任务关联、版本状态和审计；前端先提供最小项目创建与镜头生产入口，再逐步接入审片和交付时间线。

**Tech Stack:** Bun、TypeScript、Express、Drizzle MySQL、Vue 3、Pinia、现有 generationJobs/creditLedger、FFmpeg。

**Spec:** `docs/enterpriseComicPlatformUpgradePlan.md` 第 6–13 节。

## Global Constraints

- 遵守 `AGENTS.md`：文件、目录、函数和变量使用小驼峰；服务端路由一接口一文件；路由变更后运行 `bun run routes`。
- 禁止新增 `.test.ts`、`.spec.ts` 或其他测试文件；验证使用 `bun run typecheck`、必要的 `bun run build` 和手动 HTTP 检查。
- 复用现有 `generationJobs`、`creditLedger`、`auditEvents`、`useWorkspaceFiles` 和 FFmpeg，不重复封装已有能力。
- 所有项目写操作必须服务端校验成员权限、工作区归属、预算和幂等键，并写入审计事件。
- 每个阶段保持可回滚；阶段完成后记录验证结果，再进入下一阶段。

## 阶段一：项目结构与项目级权限

**交付目标：** 创建 `productionProject/season/episode/scene/shot/projectMember` 数据对象和最小 API，使平台能够建立一份可追踪的漫剧项目。

### Task 1：数据库结构与迁移

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/db/migrations/productionProject.sql`
- Modify: `apps/server/src/db/migrations/index.sql`（如果当前迁移入口要求登记）

**实现内容：**

- 增加生产项目、季度、剧集、场景、镜头、项目成员和项目角色权限表。
- `productionProjects` 至少包含 `id/workspaceId/customerId/title/status/budgetCents/createdBy/createdAt/updatedAt`。
- `projectMembers` 至少包含 `projectId/userId/role/status/createdBy/createdAt/updatedAt`，角色使用 `owner/producer/writer/director/artist/editor/reviewer/viewer`。
- 镜头状态使用 `draft/ready/generating/review/changesRequested/approved`；项目状态使用 `draft/scripted/storyboarded/generating/editing/review/approved/delivered`。
- 外键保持与现有 MySQL 迁移风格一致，项目成员、剧集、场景、镜头均建立唯一约束和查询索引。

**验证：**

- `bun run --cwd apps/server typecheck`
- `bun run --cwd apps/server routes`
- 使用临时数据库配置执行现有迁移入口，确认表可以创建。

### Task 2：项目服务与权限门

**Files:**
- Create: `apps/server/src/services/productionProjectService.ts`
- Create: `apps/server/src/utils/productionProject/permissions.ts`
- Modify: `apps/server/src/utils.ts`

**实现内容：**

- `createProductionProject(input)`：事务创建项目和 owner 成员，并写 `productionProject.create` 审计。
- `listProductionProjects(workspaceId)`：只返回当前用户可访问项目。
- `getProductionProject(projectId)`：返回项目、成员和层级对象。
- `requireProjectAccess(projectId, action)`：默认拒绝；按项目成员角色解析动作权限。
- `updateProductionProjectStatus(projectId, status)`：只允许合法状态推进，并记录前后状态。
- 角色权限最小集合：`read/create/edit/generate/retry/comment/review/approve/export/manageBudget/invite`。

**验证：**

- `bun run --cwd apps/server typecheck`
- 手动调用服务层对应 HTTP 路由，确认无成员返回 403、viewer 写操作返回 403、owner 可创建和读取。

### Task 3：项目 HTTP 路由

**Files:**
- Create: `apps/server/src/routes/productionProjects/create.ts`
- Create: `apps/server/src/routes/productionProjects/list.ts`
- Create: `apps/server/src/routes/productionProjects/get.ts`
- Create: `apps/server/src/routes/productionProjects/save.ts`

**实现内容：**

- 遵守“一接口一文件”，所有请求使用现有 `requireAuth/requireCsrf/validateFields/success/error`。
- 创建请求接收 `workspaceId/title/customerId/budgetCents`，返回项目和 owner 成员。
- 列表只读取当前用户可访问项目；详情返回剧集、场景、镜头和成员摘要。
- 保存只允许 `owner/producer` 修改项目标题、客户和预算；状态推进走服务层状态机。
- 新增路由后运行 `bun run routes`，不手工修改 `router.ts`。

**验证：**

- `bun run --cwd apps/server routes`
- `bun run --cwd apps/server typecheck`
- 启动开发服务后用 `Invoke-WebRequest` 做创建、列表、详情、越权请求的实际 HTTP 验证。

## 阶段二：镜头生成与预算纵切

**交付目标：** 把一个镜头绑定到现有媒体生成任务、预算账本和幂等键，支持局部生成和失败释放。

### Task 4：剧集/场景/镜头写入接口

**Files:**
- Modify: `apps/server/src/services/productionProjectService.ts`
- Create: `apps/server/src/routes/productionProjects/episodes.ts`
- Create: `apps/server/src/routes/productionProjects/shots.ts`

**实现内容：**

- 创建剧集、场景、镜头时校验项目 `create/edit` 权限。
- 镜头保存提示词、对白、旁白、镜头时长、景别、运镜、引用资产和 revision。
- 提交镜头时执行 `generate` 权限、预算检查和 `Idempotency-Key` 检查。

### Task 5：生成任务关联与预算账本

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Modify: `apps/server/src/services/billingService.ts`
- Modify: `apps/server/src/utils/media/generation.ts`
- Create: `apps/server/src/services/productionGenerationService.ts`

**实现内容：**

- `generationJobs` 增加 `projectId/episodeId/sceneId/shotId/attemptNumber` 快照字段或关联表，保留现有任务兼容性。
- 增加 `estimatedCost/reservedCost/actualCost` 三类金额，预算不足时阻断生成。
- 生成成功创建 `clipVariant`；失败/取消释放未使用预留；相同业务幂等键不能重复扣费。
- 所有生成状态和成本动作写入审计。

**验证：**

- `bun run --cwd apps/server typecheck`
- 使用一个配置好的媒体供应商执行一个镜头生成；核对任务、钱包、账本和审计记录。
- 用同一 `Idempotency-Key` 重复提交，确认只保留一条任务。

## 阶段三：审片、重拍与批准

**交付目标：** 让候选片段进入 review，支持评论、退回、局部重拍、批准和版本锁定。

### Task 6：候选版本、审片和审批

**Files:**
- Modify: `apps/server/src/db/schema.ts`
- Create: `apps/server/src/services/reviewService.ts`
- Create: `apps/server/src/routes/productionProjects/review.ts`
- Create: `apps/server/src/routes/productionProjects/approve.ts`

**实现内容：**

- 增加 `clipVariants/reviews/approvals`；批准版本不能原地修改。
- `changesRequested` 只创建新的 generationAttempt，不覆盖旧候选。
- 评论支持镜头、时间码、画面区域、作者、@成员、解决/重开。
- 审批只允许 reviewer/producer/owner；viewer 只能查看。

**验证：**

- `bun run --cwd apps/server typecheck`
- 手动完成“候选 → 评论 → 退回 → 新候选 → 批准”，确认旧候选仍可读取，批准后再次编辑返回 409。

## 阶段四：时间线、交付包与审计导出

**交付目标：** 由已批准候选生成 MP4、SRT、manifest JSON 和审计/成本证据包。

### Task 7：最小时间线与导出

**Files:**
- Create: `apps/server/src/services/deliveryService.ts`
- Create: `apps/server/src/routes/productionProjects/delivery.ts`
- Modify: `apps/server/src/routes/ffmpeg/execute.ts`（仅在确认复用边界后）

**实现内容：**

- 创建 `timeline/timelineTrack/timelineItem/delivery`，只允许 approved 候选进入时间线。
- 第一版支持镜头顺序、in/out、硬切、字幕轨、音频轨和基础混音。
- 输出 MP4、SRT、manifest JSON、源文件清单、成本摘要、审批记录和版本哈希。
- 导出前检查项目状态、资产授权和审批完整性。

**验证：**

- `bun run --cwd apps/server typecheck`
- 用 3 个已批准镜头实际生成 MP4/SRT/manifest，使用 ffprobe 检查时长和媒体轨。
- 未批准镜头进入时间线时返回 409，并写审计。

### Task 8：企业审计包

**Files:**
- Create: `apps/server/src/routes/productionProjects/auditExport.ts`
- Modify: `apps/server/src/services/platformService.ts`（如需复用审计查询）

**实现内容：**

- 按项目导出成员、权限、镜头、任务、预算、审批、交付和删除事件。
- 支持 JSON/CSV，敏感提示词和素材路径按调用者权限脱敏。
- 导出动作本身写审计事件。

**验证：**

- `bun run --cwd apps/server typecheck`
- 实际导出 JSON/CSV，检查包含操作者、时间、对象、前后状态、结果和 requestId。

## 阶段五：前端生产工作区

**交付目标：** 将结构化项目、镜头、任务、审片和交付接入现有 Vue 工作区，画布作为编排视图。

### Task 9：项目列表与项目详情

**Files:**
- Create: `apps/web/src/pages/productionProjects/index.vue`
- Create: `apps/web/src/pages/productionProjects/detail.vue`
- Modify: `apps/web/src/router/index.ts`（按现有路由生成规则接入）

**实现内容：**

- 项目创建、列表、状态、预算摘要、成员角色和镜头进度。
- 详情页按剧集/场景/镜头展示结构化对象；生成、审片和交付操作均调用服务端接口。
- 画布文件只保存项目引用和布局，不再作为唯一事实源。

**当前状态：** 已完成并通过浏览器点击验收。详情接口的包裹响应已在前端正确解包，项目成员通过 `userId` 计算当前角色；生成表单包含视频分辨率并把预算/权限错误展示在弹窗内。

### Task 10：审片与交付面板

**Files:**
- Create: `apps/web/src/pages/productionProjects/components/reviewPanel.vue`
- Create: `apps/web/src/pages/productionProjects/components/deliveryPanel.vue`

**实现内容：**

- 候选片段、评论、退回、批准、版本切换和成本显示。
- 导出 MP4/SRT/manifest/审计包并显示任务状态、失败原因和重试入口。

**当前状态：** 已完成最小审片/交付增量。带决定的审片意见与审批在服务端同一事务落库；审片弹窗支持候选媒体预览；详情页展示已有交付路径与 manifest 哈希。审计包下载按钮和导出任务进度列入后续增量。

## 阶段验收顺序

1. 阶段一通过后，才进入阶段二；项目和权限先可用，避免生成结果无归属。
2. 阶段二通过后，才进入阶段三；所有候选必须能反查镜头、模型、提示词和成本。
3. 阶段三通过后，才进入阶段四；未批准候选不得进入交付。
4. 阶段四通过后，才进入阶段五；前端只消费已验证的业务 API。
5. 全链路最终 Gate：一个项目、三个镜头、三个角色完成“项目创建 → 权限 → 生成 → 预算 → 审片 → 重拍 → 批准 → MP4/SRT/manifest/审计包”。

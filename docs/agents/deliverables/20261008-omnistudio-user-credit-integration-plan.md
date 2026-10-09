# OmniStudio 用户与积分体系集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 按任务逐项执行；每个任务完成后先验证，再进行下一任务。

**目标：** 参考旧 OmniStudio 的用户、Workspace、会话、角色、积分钱包、价格表、统一模型目录和平台供应商路由能力，在 `omnistudio-next` 中从空 MySQL 数据库实现完整的新用户与积分体系，使登录身份、工作区权限、模型选择和积分扣费贯穿普通生成、Agent、媒体生成与后台管理。

**架构：** 旧 OmniStudio 只作为行为、数据结构和安全规则的参考，`omnistudio-next` 在开发、测试、预发布和正式环境统一连接 MySQL 8.0+，每个环境使用自己的空库。新项目在 Bun/Express 内实现完整认证、Workspace、角色、钱包、价格簿、统一模型目录和平台供应商路由服务，不读取或导入旧用户、旧钱包、旧账本或旧业务数据，也不保留 Core 代理、双写或并行运行路径。模型目录由仓库中的生成产物统一提供，平台 API Key 只存在服务端配置/密钥存储，用户只能选择已启用模型，不能添加供应商、填写 API Key 或修改模型列表。

**技术栈：** 旧 OmniStudio FastAPI、SQLAlchemy、Argon2id、JWT/HttpOnly Cookie、Workspace 钱包账本和价格簿作为参考；新项目 Bun 1.3.14、Express 5、TypeScript、Vue 3、Pinia、Vite、MySQL 8.0+、Drizzle ORM、`mysql2` 和 `@node-rs/argon2`。

**参考实现：** `D:/personal/万象/AI漫剧/OmniStudio/src/apps/comic_gen/auth/`、`D:/personal/万象/AI漫剧/OmniStudio/src/billing/`、`D:/personal/万象/AI漫剧/OmniStudio/src/storage/schema.py`。

**当前状态：** `omnistudio-next` 目前没有用户、Workspace 或积分关系型数据库；现有 `conf` 只将通用设置保存为数据目录下的 JSON。旧 OmniStudio 的存储层同时兼容 SQLite 和 MySQL，当前旧项目开发配置可指向 `mysql+pymysql`，但这不作为新项目的数据源。新项目的认证、Workspace、钱包、账本、价格簿、模型配置和生成任务从第一天起只使用 MySQL。

## 全局约束

- 新项目使用自己的用户、Workspace、钱包和账本 ID；旧项目中的测试账号、余额、账本和项目数据全部视为无关数据。
- 新项目不能把密码、刷新令牌或平台访问令牌放入 `localStorage`；使用 HttpOnly 会话 Cookie，并实现 CSRF 和严格 Origin 校验。
- 积分账本必须追加写入、带幂等键；生成开始时预留，成功时按实际产物结算，失败或取消时释放。
- 新项目不接入 TF-Router、第三方模型中转账户或其充值体系；平台积分是唯一面向用户的额度体系，供应商成本和密钥只在服务端受控配置中处理。
- 模型目录只有一个代码来源：参考并整理老项目 `config/model_catalog/` 的 YAML、生成 JSON、默认模型和能力约束；前端只能读取服务端下发的可用模型，不直接解析 YAML。
- 普通用户不配置任何模型供应商或 API Key；平台凭证由管理员部署配置，服务端按模型目录路由到 DashScope、Kling、Vidu、PixVerse、MuleRouter 等后端。
- 模型可用性、默认模型、模型下线和供应商健康状态由管理员/部署配置控制；用户界面不提供“添加供应商”“编辑 API Key”“自定义模型”入口。
- 服从 `omnistudio-next/AGENTS.md`：源码文件使用小驼峰命名，不新增测试文件；使用类型检查、构建和手动 HTTP 验证。
- 开发环境只启动新项目；数据库初始化、开发管理员和测试积分使用显式 seed 脚本创建，不读取旧项目运行时数据。
- 新项目的开发、测试、预发布和正式环境统一使用 MySQL 8.0+（InnoDB、`utf8mb4`）；禁止先用 SQLite 实现再切换正式数据库。
- `DATABASE_URL`、连接池、迁移和 seed 均由新项目独立管理；通用 JSON 设置仍属于文件配置，不替代账户和计费数据库。
- 每个独立阶段完成后单独提交一个原子 commit；未得到执行指令前只维护本计划，不修改业务源码。

## 任务 0：锁定产品和数据边界

**涉及文件：**

- 修改：`docs/agents/deliverables/20261008-omnistudio-user-credit-integration-plan.md`
- 对照：`D:/personal/万象/AI漫剧/OmniStudio/src/apps/comic_gen/auth/schemas.py`
- 对照：`D:/personal/万象/AI漫剧/OmniStudio/src/billing/routes.py`

- [ ] 确认数据策略：不导入旧 OmniStudio 的任何用户、Workspace、角色、钱包、账本、项目或媒体数据；新项目从空数据库开始。
- [ ] 确认账户粒度：一个用户可加入多个 Workspace；每个 Workspace 一个钱包；平台角色与 Workspace 成员角色分离。
- [ ] 确认充值范围：第一版只接入管理员手工发放/调整平台积分和流水查询；不接入 TF-Router 或任何第三方供应商充值页面，支付接入另立任务。
- [ ] 确认匿名项目处理：登录后只能由用户显式认领本地项目，不能按浏览器缓存自动归属到账号。
- [ ] 确认模型策略：沿用老项目统一模型目录和平台凭证；用户只选择模型和生成参数，不接触供应商密钥。

**验收：** 在执行记录中写明上述五项选择，并冻结 API、数据归属和开发 seed 策略。

## 任务 1：冻结新项目内部 API、数据模型和错误语义

**涉及文件：**

- 创建：`docs/agents/deliverables/20261008-core-auth-billing-api-contract.md`
- 对照：`D:/personal/万象/AI漫剧/OmniStudio/src/apps/comic_gen/auth/routes.py`
- 对照：`D:/personal/万象/AI漫剧/OmniStudio/src/billing/routes.py`
- 对照：`D:/personal/万象/AI漫剧/OmniStudio/frontend/src/lib/api.ts`
- 对照：`D:/personal/万象/AI漫剧/OmniStudio/frontend/src/lib/billing.ts`

- [ ] 固定新项目认证接口：`setup-status`、`setup`、`login`、`refresh`、`logout`、`me`、`change-password`、Workspace 列表/创建、邀请和成员管理；行为参考旧项目，但字段和实现以新项目为准。
- [ ] 固定新项目计费接口：`wallet`、`ledger`、`quote`、`pricing-table`，以及 root/admin 的价格表、角色和 Workspace 钱包管理接口。
- [ ] 固定模型接口：`GET /ai/models`、`GET /ai/media/models`、`GET /ai/capabilities`；响应只包含已启用模型、能力、参数约束、默认值和积分报价，不返回供应商 API Key、进货价或内部路由密钥。
- [ ] 固定错误码：未登录 `401`、权限不足 `403`、积分不足 `402`、参数错误 `422`、幂等冲突 `409`；前端不得依赖自由文本判断错误类型。
- [ ] 明确请求上下文：认证身份、当前 Workspace、请求 ID、幂等键、生成任务 ID；上下文由新项目自己的 Cookie 和服务端中间件建立。

**验收：** 前端和后端可根据该文档独立实现类型；接口路径、字段名、Cookie 名称和错误码不再临时变更。

## 任务 2：在新项目内建立认证与计费持久化层

**涉及文件：**

- 创建：`apps/server/src/db/database.ts`
- 创建：`apps/server/src/db/schema.ts`
- 创建：`apps/server/src/db/migrations/`
- 创建：`apps/server/src/services/authService.ts`
- 创建：`apps/server/src/services/billingService.ts`
- 创建：`apps/server/src/services/modelService.ts`
- 创建：`apps/server/src/services/providerRouter.ts`
- 创建：`apps/server/src/config/modelCatalog.ts`
- 创建：`apps/server/src/middleware/authContext.ts`
- 修改：`package.json`
- 修改：`apps/server/package.json`
- 修改：`apps/server/src/app.ts`
- 修改：`apps/server/src/index.ts`
- 修改：`apps/server/src/utils/conf/index.ts`

- [ ] 使用 Drizzle ORM + `mysql2` 连接 MySQL 8.0+，建立 `users`、`workspaces`、`workspaceMemberships`、`sessions`、`invitations`、`auditEvents`、`platformRoles`、`platformProviderConfigs`、`providerHealth`、`wallets`、`creditLedger`、`pricingSettings`、`pricingItems`、`priceBookVersions` 和 `generationJobs` 表，并将 SQL 迁移文件放在 `apps/server/src/db/migrations/`。
- [ ] 在 `apps/server/src/db/database.ts` 创建复用的 MySQL 连接池，设置 `utf8mb4`、连接上限、连接超时和健康检查；从 `DATABASE_URL` 读取连接信息，启动时拒绝空值、SQLite URL 和非 MySQL 方言。
- [ ] 提供 `initDatabase`/migration 命令和明确的空库初始化顺序，先执行结构迁移，再执行平台模型配置和开发 seed；迁移脚本可重复执行且不覆盖历史账本。
- [ ] 将老项目 `config/model_catalog/families/*.yaml`、`catalog.meta.yaml`、生成的 `model_catalog.json`、前端生成目录和默认模型配置作为代码参考，整理到新项目 `config/modelCatalog/`；增加构建时 schema 校验，禁止运行时从任意用户文件加载模型定义。
- [ ] `platformProviderConfigs` 只保存服务端可读的供应商配置；响应 DTO、日志、异常和前端状态全部对 API Key 做脱敏，部署密钥优先从环境变量或受控密钥文件读取。
- [ ] 新增 `@node-rs/argon2`，为新项目注册用户创建 Argon2id 密码哈希；不实现旧密码哈希导入或旧会话兼容。
- [ ] 所有余额和账本变更在同一个 MySQL/InnoDB 事务中完成；账本使用唯一幂等键，行锁和数据库约束共同保证 `frozen <= balance`。
- [ ] 将认证身份、当前 Workspace、角色、请求 ID、幂等键和生成任务 ID注入 Express 请求上下文；未认证或无 Workspace 成员资格的业务路由返回统一错误。
- [ ] 保留现有 `x-toonflow-workspace` 作为本地页面访问校验，同时增加服务端认证 Workspace 校验，不能只相信浏览器传入的目录或 Workspace ID。

**验收命令：**

```powershell
bun run --filter '@omnistudio-next/server' typecheck
bun run --filter '@omnistudio-next/server' build
```

## 任务 3：接入完整登录页、初始化页和 Workspace 前端状态

**涉及文件：**

- 创建：`apps/web/src/stores/auth.ts`
- 创建：`apps/web/src/lib/authApi.ts`
- 创建：`apps/web/src/pages/auth/index.vue`
- 创建：`apps/web/src/pages/auth/setup.vue`
- 创建：`apps/web/src/pages/auth/login.vue`
- 创建：`apps/web/src/pages/auth/passwordReset.vue`
- 创建：`apps/web/src/components/account/accountMenu.vue`
- 修改：`apps/web/src/main.ts`
- 修改：`apps/web/src/router/index.ts`
- 修改：`apps/web/src/App.vue`
- 修改：`apps/web/src/stores/workspace.ts`

- [ ] 应用启动先调用 `setup-status` 和 `me`，再决定进入首次初始化页、登录页、Workspace 首页或工作区画布；网络失败显示可重试状态，不静默回退为匿名用户。
- [ ] 实现首次初始化、登录、注册/邀请注册、密码重置、改密、刷新、退出、当前用户和 Workspace 切换；刷新失败清空前端身份并回到登录页。
- [ ] 使用 HttpOnly Cookie、CSRF Token 和 `axios` 响应拦截器完成会话续期；禁止把 access token 或 refresh token 存进 Pinia 持久化状态。
- [ ] 首次初始化和设置页只展示平台模型状态、默认模型、可用能力和管理员联系方式；删除/隐藏旧的自定义供应商、API Key、模型刷新和用户充值配置表单。
- [ ] 访问需要身份的路由时由路由守卫拦截；切换 Workspace 后清理旧 Workspace 的画布连接、待执行 Agent 和临时生成状态。
- [ ] 现有本地项目列表只保存目录和展示名；服务端项目/资源读写必须带当前 Workspace 上下文。

**验收命令：**

```powershell
bun run --filter '@omnistudio-next/web' typecheck
bun run --filter '@omnistudio-next/web' build
```

## 任务 4：接入钱包、价格和积分流水 UI

**涉及文件：**

- 创建：`apps/web/src/lib/billingApi.ts`
- 创建：`apps/web/src/stores/billing.ts`
- 创建：`apps/web/src/components/account/creditBalance.vue`
- 创建：`apps/web/src/components/account/creditLedgerDialog.vue`
- 创建：`apps/web/src/components/account/insufficientCreditsDialog.vue`
- 修改：`apps/web/src/components/settings/index.vue`
- 修改：`apps/web/src/components/settings/tfAccount.vue`

- [ ] 在账户菜单和设置中展示当前 Workspace 的可用、冻结和总积分余额；不展示第三方供应商账户余额或供应商充值入口。
- [ ] 展示积分流水、模型报价和当前价格簿版本；只展示对用户有意义的积分价格，不下发进货价、利润率或管理员字段。
- [ ] 在模型选择器中展示服务端允许的文本、图片、视频、音频模型和能力参数；模型不可用时显示服务端健康状态和可替代模型，不显示 API Key 或供应商配置表单。
- [ ] 移除或下线上游遗留的 `tfAccount.vue`、`tfRechargeDialog.vue`、`lib/tf.ts` 和 TF-Router 登录/充值入口；模型和供应商状态由新项目服务端模型目录接口提供，用户不能填写 API Key、获取模型、充值或修改供应商配置。
- [ ] 所有 `402 INSUFFICIENT_CREDITS` 统一打开积分不足弹窗，并提供查看报价/流水和联系管理员的入口。
- [ ] 余额在生成成功、失败、取消和 Workspace 切换后失效并刷新；不能依靠前端递减数字作为账本事实。

**验收：** 登录后切换两个 Workspace，余额和流水只显示当前 Workspace 的平台积分；页面中不存在 TF-Router 账户余额、充值或登录入口。

## 任务 5：把媒体生成纳入预留、结算、释放链路

**涉及文件：**

- 创建：`apps/server/src/lib/billingContext.ts`
- 创建：`apps/server/src/lib/mediaBilling.ts`
- 创建：`apps/server/src/routes/billing/quote.ts`
- 修改：`apps/server/src/routes/ai/media/generate.ts`
- 修改：`apps/server/src/utils/media/generation.ts`
- 修改：`apps/server/src/routes/ai/media/models.ts`

- [ ] 在调用供应商前使用 `modelId + mediaType + resolution/size/duration/audio/mode` 生成标准化报价，并将报价版本和幂等键记录到生成任务。
- [ ] `providerId`、`modelId`、分辨率、时长、音频和参考素材参数必须通过统一模型目录校验；生成请求不能携带用户自定义 `apiUrl`、`protocol`、`apiKey` 或供应商源码。
- [ ] 由 `providerRouter` 根据目录中的 `default_backend`、平台配置和健康状态选择实际后端；同一模型的 fallback 必须可审计并写入任务快照。
- [ ] 图片按张、视频按实际秒数、音频按项目约定的可计费单位结算；无法探测实际时长时使用已冻结数量并记录原因。
- [ ] 供应商异常、请求取消、文件落盘失败均释放冻结积分；重复请求或重试不能重复扣费。
- [ ] 生成路由不再允许未认证 Workspace 直接调用；目录、模型、供应商配置都必须经过服务端权限检查。

**验收：** 用一个成功、一个供应商失败、一个客户端取消、一个重复幂等键请求验证账本各只产生预期记录，余额不存在负数或残留冻结。

## 任务 6：把文本 Agent、MCP 和插件工具纳入计费

**涉及文件：**

- 创建：`apps/server/src/lib/textBilling.ts`
- 修改：`apps/server/src/routes/ai/generate.ts`
- 修改：`apps/server/src/agent/runtime/index.ts`
- 修改：`apps/server/src/agent/runtime/model.ts`
- 修改：`apps/server/src/agent/tools/index.ts`
- 修改：`apps/server/src/utils/mcp/tools.ts`
- 修改：`packages/nodeScaffold/src/nodeAi.ts`

- [ ] 在文本模型调用前检查 Workspace 可用积分，在 `message_end` 或等价事件拿到输入/输出字符和 provider usage 后按文本价格表记账。
- [ ] Agent 和节点只接收服务端下发的模型 ID；模型运行时从平台配置取凭证，插件上下文不得暴露供应商 API Key、完整 provider 配置或可任意调用的 HTTP 客户端。
- [ ] 给每次 Agent turn、MCP `runAgent`、节点 AI 调用和媒体工具调用传递同一个 `workspaceId/userId/jobId` 上下文。
- [ ] 工具插件只能通过宿主提供的媒体/文本工具生成，禁止插件绕过计费直接调用供应商；未注册或无权限工具返回明确错误。
- [ ] 处理流式连接中断：已产生的文本按实际 usage 结算，未开始的调用不扣费，幂等键使用稳定的 turn/call 标识。

**验收命令：**

```powershell
bun run --filter '@omnistudio-next/server' typecheck
bun run --filter '@omnistudio-next/web' typecheck
```

并用浏览器实际发送一次 Agent 文本请求和一次节点文本请求，确认账本记录了正确的 Workspace、模型和用量。

## 任务 7：管理员积分和价格管理

**涉及文件：**

- 创建：`apps/server/src/routes/admin/billing.ts`
- 创建：`apps/web/src/components/admin/billingPanel.vue`
- 修改：`apps/web/src/components/settings/index.vue`
- 对照：`D:/personal/万象/AI漫剧/OmniStudio/frontend/src/components/billing/BillingAdminPanel.tsx`

- [ ] root/admin 权限由新项目自己的 `platformRoles` 判断；普通用户不能看到进货价、角色管理、其他 Workspace 钱包或平台供应商密钥。
- [ ] 先实现价格簿读取、版本切换、Workspace 发放/扣回/设置余额和操作原因；每次管理操作写入审计事件并带幂等键。
- [ ] 增加平台模型管理：启用/停用模型、设置默认模型、维护能力约束、查看供应商健康状态和配置路由 fallback；所有变更记录版本和审计事件。
- [ ] 价格发布后新任务使用新版本，已冻结任务按冻结时的价格版本结算；禁止覆盖历史账本中的价格信息。
- [ ] 把“管理员发积分”和“用户充值”分开；第一阶段不实现第三方供应商充值，支付订单、支付回调和退款另立安全评审任务。

**验收：** root 可为指定 Workspace 发放积分并在流水中看到操作者和原因；member 访问管理员接口固定返回 `403`。

## 任务 8：空库初始化与开发 seed

**涉及文件：**

- 创建：`apps/server/scripts/initDatabase.ts`
- 创建：`apps/server/scripts/seedDevelopment.ts`
- 创建：`docs/agents/deliverables/20261008-core-database-initialization-runbook.md`
- 修改：`apps/server/package.json`
- 对照：`D:/personal/万象/AI漫剧/OmniStudio/src/storage/schema.py`

- [ ] `initDatabase.ts` 只连接当前环境指定的空 MySQL 库，执行 Drizzle 结构迁移、索引和约束校验；脚本不读取旧 OmniStudio 数据库、不扫描旧项目输出目录。
- [ ] `seedDevelopment.ts` 仅在 `NODE_ENV=development` 且显式传入 `SEED_DEVELOPMENT=true` 时运行，创建幂等的测试管理员、测试用户、测试 Workspace、成员关系、测试积分流水和平台启用模型配置。
- [ ] 开发 seed 使用固定的测试标识和 Argon2id 密码哈希生成策略；重复执行通过唯一键更新/跳过，不重复发放积分，不覆盖已有真实数据。
- [ ] 生产环境启动流程拒绝开发 seed；正式环境只执行结构迁移和受控的平台模型配置发布，平台密钥通过环境变量或密钥文件注入。
- [ ] 在初始化 runbook 中记录空库创建、权限最小化、连接验证、回滚备份和 seed 清理步骤；明确旧 OmniStudio 数据不会被读取、复制或同步。

**验收命令：**

```powershell
docker compose up -d mysql
bun run --filter '@omnistudio-next/server' db:migrate
bun run --filter '@omnistudio-next/server' db:seed:development
bun run --filter '@omnistudio-next/server' typecheck
bun run --filter '@omnistudio-next/server' build
```

再用一次新的 MySQL schema 重复执行 migration 和 development seed，确认结构、测试账号、钱包和账本不会重复创建或重复发放。

## 任务 9：开发运行与正式发布检查

**涉及文件：**

- 创建：`docs/agents/deliverables/20261008-auth-billing-release-runbook.md`
- 修改：`compose.yaml`
- 修改：`.env.example`
- 修改：`README.md`


- [ ] 增加 Cookie/Origin、计费开关、价格簿版本、MySQL `DATABASE_URL`、连接池和数据目录配置说明；禁止把真实密钥提交到仓库。
- [ ] 在 `compose.yaml` 增加 MySQL 8.0 服务、持久化卷、健康检查和仅内网暴露；应用服务依赖 MySQL 健康状态后启动，开发与正式部署通过环境变量注入数据库账号和密码。
- [ ] 开发和预发布使用独立 MySQL schema 执行登录、报价、预留、结算、释放和幂等演练；确认账本约束、事务隔离和连接断开恢复后再开启真实扣费。
- [ ] 正式发布前备份目标 MySQL 数据库并执行结构迁移 dry-run；出现认证失败或账本校验失败时恢复当前版本和数据库备份，不启动第二个写入源。
- [ ] 发布后验证登录、初始化、注册/邀请、刷新、退出、密码重置、Workspace 切换、余额查询、流水、图片生成、视频生成、Agent、失败释放和管理员发放。
- [ ] 发布后验证用户只能看到平台启用的模型，无法通过请求体注入未知模型、外部 API 地址或 API Key；管理员停用模型后新请求立即拒绝，已有任务仍按快照完成结算。

## 完成标准

- 新项目从空 MySQL 库启动，开发管理员可以完成初始化、登录、Workspace 操作、模型调用和积分扣费；正式环境沿用同一 MySQL 数据模型和迁移流程。
- `omnistudio-next` 使用自己的用户、Workspace、钱包和账本；旧项目只作为参考，不读取旧库，不复制旧测试数据，不保留 Core 代理、双写或并行服务依赖。
- TF-Router 及其 API Key、账户余额、充值订单、插件市场登录和上游中转接口不属于新项目体系，不进入数据模型、认证流程、积分账本或生成路由。
- 普通生成、Agent、MCP 和插件生成均无法绕过报价、预留、结算/释放和幂等检查。
- 模型目录、默认模型和平台供应商凭证由新项目统一管理；普通用户不能配置供应商或 API Key，所有生成调用都经过可审计的服务端路由。
- 认证、Workspace 权限、`401/402/403/422` 错误和会话刷新均有可复现的手动 HTTP 验证记录。
- 开发、测试、预发布和正式环境均通过 MySQL 连接健康检查；不存在 SQLite 账户/积分运行路径，migration 和 seed 可重复执行。
- `bun run typecheck`、`bun run build` 和发布前 smoke check 全部通过；没有第三方供应商余额或 API Key 进入用户界面、积分账本或日志。

## 2026-10-09 执行记录

本轮已完成并验证：

- 新增账户页 `/account`：展示当前 Workspace、可用/冻结/总积分、流水、成员、创建 Workspace 和管理员邀请；首页增加“账户与积分”入口。
- 增加平台管理员 Workspace 余额列表和发放积分入口；发放接口要求 CSRF 与幂等键，并在同一 MySQL 事务写入积分账本和审计事件，普通成员返回 `403`。
- 所有生成、Agent、设置保存和 Agent 回调写请求增加会话 CSRF 校验；前端 fetch/节点请求携带当前 Workspace 与 CSRF 上下文。
- 媒体模型接口改为复用服务端媒体目录，返回完整的媒体能力字段；文本模型返回兼容的服务端协议标识。
- 供应商运行时改为读取服务端可信 `packages/providers`/构建目录，不再读取数据目录中的用户可编辑供应商副本；TF-Router 运行时文件、模型适配和用户入口已移除。
- 积分结算改为任务、钱包、账本同一 MySQL 事务，补充任务账本关联、幂等键长度限制、余额/冻结一致性检查；开发 seed 为初始钱包写入幂等 grant 流水。
- 生产构建复制 SQL migration；迁移启动前检查同名旧表结构，避免 `CREATE TABLE IF NOT EXISTS` 静默复用不兼容旧表；增加仓库内 Electrobun 配置结构类型声明，解除 Web 类型检查对本机 `.hutch` 生成文件的依赖。

实际验收记录：

- `apps/server`: `bun run routes`、`bun run typecheck`、`bun run build` 通过。
- `apps/web`: `bun run typecheck`、`bun run build` 通过。
- HTTP smoke：登录 `200`；钱包/模型/成员接口 `200`；文本模型 3 个、媒体模型 12 个；媒体目录仅含 `apiMart` 与 `meta`，不含 TF-Router；缺少 CSRF 的 Workspace 创建 `403`，带有效 CSRF 创建 `201`。
- 管理员接口 smoke：`GET /api/admin/workspaces` 返回 `200`，返回 3 个 Workspace 且包含可用积分；发放入口复用 `/api/admin/grantCredits`。
- 浏览器验收：登录后进入首页，在“账户与积分”页面看到 Workspace 切换、余额、成员和积分流水。

仍需另立任务完成：普通用户/管理员完整后台价格簿管理、A2A/MCP 服务凭证的 Workspace 归属、Agent 多轮按 usage 的精确计费、真实供应商成功/失败/取消扣费演练，以及正式环境独立 MySQL 库和密钥注入发布演练。

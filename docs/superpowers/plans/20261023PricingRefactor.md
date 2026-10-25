# 价格体系改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 为视频模型增加“文生/图生视频”和“视频生视频”的可选分价能力，并将文本模型统一改为仅按输入、输出两类价格计费，同时保证配置页、公开报价、实际扣费、节点预估和所有媒体适配器使用同一套规则。

**架构：** 继续使用 `platform_pricing_items.constraints` JSON 保存视频价格扩展，不改变模型价格唯一键；`credits_per_unit` 数据库字段改为四位小数。视频价格以 `videoPricingMode: "unified" | "separate"` 标记：`unified` 使用一套分辨率价格，`separate` 使用 `textImageToVideo` 与 `videoToVideo` 两套分辨率价格；公共媒体入口根据原始请求中的视频引用统一分类，适配器只负责把标准 `VideoRequest` 转成上游请求。文本价格完全切换到 `input/output` 两项，运行时不读取、转换或兼容旧 `textTokenV2/V3` 价格；上线前必须把所有启用模型一次性整理成新价格，旧价格簿不得继续作为活动价格。供应商返回的缓存 token 不同步为独立价格，计费时合并到可计费输入量后按输入单价计算。开发消耗采用“最终结算捕获成功即增量 upsert 每日汇总”，导出只查汇总表；废片采用人工确认状态，Agent 只生成候选建议。

**技术栈：** Bun、TypeScript、Express、Zod、Drizzle ORM、Vue 3、Pinia、现有媒体供应商运行时与节点脚手架。

**Spec：** 本次会话中的价格体系改造需求（2026-10-23）。

## 全局约束

- 复用现有 `pricingItems.constraints` JSON，不新增价格表字段；新规则发布创建新的 price book version。发布切换前先完成全部启用模型的价格覆盖；运行时不解析、转换或适配旧价格表，已完成任务只读取自身保存的账单快照。
- 视频计费分类只在服务端公共入口完成：`videos.length > 0` 为 `videoToVideo`，否则有图片、首帧或尾帧为 `textImageToVideo`，否则仍为 `textImageToVideo`；同时存在多类引用时视频引用优先。
- “是否支持视频生视频”和“是否按视频类型区分价格”是两个独立维度：模型/适配器能力只负责控制 `videoToVideo` 配置是否可用，计费模式按钮负责选择统一计价或区分计价；能力未知时按不支持处理。
- `videoPricingMode: "unified"` 只读统一 `resolutionTiers`；`"separate"` 必须同时提供 `textImageToVideo` 与 `videoToVideo` 两套完整档位，不在两种模式之间静默回退；缺档位时拒绝发布或报价。
- 文本新价格只接受 `input` 与 `output`，服务端删除旧 `textTokenV2/V3` 读取分支；上线前必须发布覆盖所有已启用模型的新价格簿，旧价格簿统一退休并保留备份，不做运行时兼容。
- 所有价格（基础价、文本输入/输出价、图片档位、视频档位、音频基础价）统一使用十进制字符串，最多四位小数；钱包和账本内部仍使用六位小数。
- 文本模型的 `creditsPerUnit` 仅保留为数据库/列表占位值 `0.0000`，不作为第三种文本计费价格；文本实际只读取 `input` 与 `output`。
- 本计划把当前可授权的项目目录作为“工作区”维度，使用 `directoryHash` 作为聚合键；没有目录的文本调用归入固定的 `unassigned` 分组。若业务所说工作区实际指团队，则另行在请求中显式传入并校验 `teamId`，不能从目录猜团队。
- 不新增任何测试文件；验证使用现有类型检查、构建、路由生成和临时配置/实际 HTTP 手动验证。
- 新增自有文件、目录和 Vue 模板标签遵守仓库小驼峰规则；`.vue` 顶层顺序保持 `<template>` → `<script>` → `<style>`。

## 文件清单与职责

### 服务端价格与计费

- 修改 `apps/server/src/utils/billing/credits.ts`：定义两项文本费率、缓存合并到输入的用量归一化、四位价格校验和视频价格解析；删除旧四项价格读取兼容。
- 修改 `apps/server/src/services/platformService.ts`：收紧文本价格 schema 为两项，增加视频统一/区分模式的 Zod 校验，所有价格改为十进制字符串并发布规范化 JSON。
- 修改 `apps/server/src/services/billingService.ts`：扩展 `quoteCredits`、`estimateMediaCredits`、`reserveGeneration`、`settleGeneration` 的视频计费类型参数，统一处理新文本价格和视频分价。
- 修改 `apps/server/src/utils/media/generation.ts`：从标准媒体请求推导计费类型，在预留前把类型和价格快照锁入任务，并向媒体模型列表透传价格模式及两套档位。
- 修改 `apps/server/src/routes/billing/quote.ts`：公开报价接口接收显式视频计费类型/视频引用标记，并校验与服务层保持一致。
- 修改 `apps/server/src/routes/ai/media/generate.ts`：沿用现有媒体 schema，将完整视频请求交给公共生成入口；若请求 schema 需要新增显式字段，在这里同步校验。
- 修改 `apps/server/src/db/schema.ts`：将 `pricingItems.creditsPerUnit` 改为四位小数的字符串字段；为生成任务记录工作区归属；增加每日消耗汇总和生成输出状态表。
- 新增 `apps/server/src/db/migrations/userIdentityPricingPrecision.sql`：将 `platform_pricing_items.credits_per_unit` 改为 `DECIMAL(20,4)`；迁移文件名必须排在现有 `userIdentityPricingDecimals.sql` 之后。
- 新增 `apps/server/src/db/migrations/userIdentityUsageSummary.sql`：增加生成任务工作区字段、每日消耗汇总表和生成输出状态表。
- 新增 `apps/server/src/services/usageService.ts`：封装结算后的增量 upsert、输出状态变更、汇总查询和 CSV 行生成。
- 新增 `apps/server/src/routes/admin/usage/summary.ts`：按人员、工作区、日期、模型和媒体类型查询汇总。
- 新增 `apps/server/src/routes/admin/usage/export.ts`：直接查询每日汇总并流式返回 UTF-8 BOM CSV，不扫描生成任务。
- 新增 `apps/server/src/routes/admin/usage/markOutput.ts`：人工确认生成输出为 `usable` 或 `waste`，并在同一事务内修正汇总计数。

### 管理配置与账户展示

- 修改 `apps/web/src/lib/accountApi.ts`：`TokenRates`、`TextPricingInput`、`PriceConstraints`、`PlatformPriceInput` 增加新视频价格结构并移除新规则中的缓存费率字段。
- 修改 `apps/web/src/pages/admin/index.vue`：文本弹窗只显示输入/输出两项；视频弹窗增加统一/区分按钮，区分时分别编辑“文生/图生视频”和“视频生视频”的分辨率档位，发布和读取时保持结构一致。
- 修改 `apps/web/src/pages/account/index.vue`：新文本结算明细显示可计费输入、输出和两项费率；历史流水按已保存的最终账单快照展示，不增加旧价格运行时解析。
- 修改 `apps/web/src/lib/accountApi.ts`、`apps/web/src/pages/admin/index.vue`：增加消耗汇总查询、CSV 导出和输出采用/废片确认入口。
- 修改 `apps/server/scripts/seedDevelopment.ts`：开发价格簿改用新的文本两项价格和视频价格结构，保留与生产模型目录一致的分辨率档位。

### 公开媒体能力、工具和节点

- 修改 `packages/toolScaffold/src/runtime.ts`：扩展 `MediaModel` 的视频价格描述和 `MediaContext.estimateCredits` 参数；保留 `MediaGenerationRequest` 的现有引用字段。
- 修改 `packages/tools/mediaGeneration/src/runtime.ts`：估价 schema 增加视频计费类型或 `hasVideoReference`，生成 schema 保持从 `videos` 推导真实类型。
- 修改 `packages/nodeScaffold/src/nodeAi.ts`：透传新的媒体价格字段和估价参数。
- 修改 `packages/nodes/videoGenerationNode/src/index.vue`：按当前节点引用计算 `textImageToVideo/videoToVideo`，从当前模式对应的价格档位预估；区分模式缺少完整档位时直接提示配置错误。

### 适配器与模型元数据

- 审核并按需修改 `packages/providers/src/media/apiMart.ts`、`baiduVideoFire.ts`、`dashscopeVideo.ts`、`jojokey.ts`、`meta.ts`、`utoooSeedance.ts`：不在适配器内重复计费，只确保标准 `VideoRequest` 的 `mode`、`images`、`videos`、`firstFrame`、`lastFrame` 不被丢弃；对不支持视频参考的适配器保留明确的能力拒绝。
- 如需要补充能力声明，修改 `packages/providers/types.d.ts` 与供应商 `models` 元数据，统一说明数组模式中的 `videoReference` 和图像/首尾帧模式；不引入供应商专属价格字段。

---

## 任务 1：冻结价格契约与切换规则

**文件：**

- 修改：`apps/server/src/utils/billing/credits.ts`
- 修改：`apps/server/src/services/platformService.ts`
- 修改：`apps/web/src/lib/accountApi.ts`

**产出接口：**

```ts
type TextTokenRates = { input: string; output: string };
type VideoBillingKind = "textImageToVideo" | "videoToVideo";
type VideoPricing =
  | { videoPricingMode: "unified"; resolutionTiers: Record<string, string> }
  | { videoPricingMode: "separate"; videoPricingTiers: Record<VideoBillingKind, Record<string, string>> };
```

- [ ] **步骤 1：定义新文本和视频结构。** 在服务端和前端类型中使用相同字段名；视频 `unified` 使用 `resolutionTiers`，`separate` 使用 `videoPricingTiers.textImageToVideo` 与 `videoPricingTiers.videoToVideo`。不再引入 `separateResolutionTiers` 别名。
- [ ] **步骤 2：收紧发布 schema。** 文本 `textPricing.ratesPerMillion` 只允许 `input`、`output`；视频使用 discriminated union：`unified` 必须只有 `resolutionTiers`，`separate` 必须同时提供 `videoPricingTiers.textImageToVideo` 与 `videoPricingTiers.videoToVideo`，所有价格使用最多四位小数的字符串，拒绝未知字段、空档位、负价格和重复分辨率，允许 `0` 表示免费。`creditsPerUnit` 仅作为列表/数据库必填字段同步为配置档位中的最大值，视频实际报价不跨模式回退到该字段。
- [ ] **步骤 3：删除旧价格分支。** `readTextPricing` 只接受新两项结构；遇到旧 `textTokenV2/V3` 直接返回配置错误。上线前将所有启用模型补齐新价格并退休旧价格簿；不做自动转换、不保留兼容读取。
- [ ] **步骤 4：固定缓存计费归一化。** 新规则计算值为 `billableInput = input + cacheRead + cacheWrite`、`billableOutput = output`；缓存字段不进入价格配置、价格同步接口或汇总表，供应商原始 usage 只留在任务内部诊断快照。
- [ ] **步骤 5：切换价格精度。** `creditsPerUnit`、图片/视频档位和文本费率均用字符串传输；服务端用固定小数整数运算，最终钱包扣款保留六位小数。
- [ ] **步骤 6：执行服务端类型检查。** 在 `apps/server` 运行 `bun run typecheck`，确认没有调用方仍要求缓存价格字段或数值类型基础价。

---

## 任务 2：改造管理价格配置页

**文件：**

- 修改：`apps/web/src/pages/admin/index.vue`
- 修改：`apps/web/src/lib/accountApi.ts`
- 依赖：任务 1 的价格契约

- [ ] **步骤 1：改文本草稿和校验。** `TextPriceDraft`、`tokenRateFields`、示例用量、`textPricingInput()`、加载价格和发布组装全部只保留 `input/output`；输入/输出为空或格式非法时阻止发布。
- [ ] **步骤 1a：统一基础价格编辑。** 图片、视频、音频的基础价格草稿统一使用十进制字符串；音频补充直接编辑入口，控件步长 `0.0001`、精度 4 位，允许 `0` 表示免费，发布时与服务端 schema 使用同一校验。
- [ ] **步骤 2：增加能力状态和视频模式选择。** 先根据具体模型的能力元数据（不能只看适配器整体）判断是否支持 `videoReference`；不支持或能力未知时显示“视频生视频不支持”，禁用区分计价选项并强制使用统一计价。支持时显示统一/区分选择按钮；统一模式显示一套分辨率档位，区分模式显示两组同样的分辨率编辑器，分别标记“文生/图生视频”和“视频生视频”。图片档位、视频档位和基础价输入统一使用字符串草稿，控件步长 `0.0001`、精度 4 位，允许 0 表示免费。
- [ ] **步骤 3：实现视频草稿读写。** `openPriceConfig` 从 `constraints.videoPricingMode` 读取模式；新价格必须显式选择统一或区分，保存时规范化分辨率大小写、去重并保存两组档位。旧价格簿不做兼容显示，发布新价格前统一视为未配置。
- [ ] **步骤 4：阻止不完整或不适用的区分配置。** 不支持 `videoReference` 的模型只能保存 `unified`；支持 `videoReference` 的模型选择 `separate` 后，两组至少各有一个有效档位，并要求模型支持的每个分辨率在两组中都有价格；统一模式至少有一套有效档位。所有档位价格允许四位小数，超过四位或为负数时禁止保存。前端禁用只是体验保护，服务端必须再次校验能力与价格模式的一致性。
- [ ] **步骤 5：同步列表摘要和发布按钮。** 价格表“配置详情”显示当前模式及档位；音频基础价也使用同一套四位小数输入；`missingPrices`、`publishPrices`、免费模型统计和确认文案按两项文本费率及视频模式计算。
- [ ] **步骤 6：手动验证页面。** 用管理员页面检查：新统一视频价格可打开并保存；切换区分后两组价格能回显；文本只显示两项；输入 `1.2345` 能保存并准确回显；超过四位小数、未填完整价格时发布按钮保持禁用或提交被服务端拒绝。

---

## 任务 3：改造文本实际计费与账单展示

**文件：**

- 修改：`apps/server/src/utils/billing/credits.ts`
- 修改：`apps/server/src/services/billingService.ts`
- 修改：`apps/server/src/services/generationService.ts`（仅在文本预算字段仍携带缓存项时清理调用）
- 修改：`apps/server/src/routes/ai/generate.ts`（保留 raw usage schema，确认新报价只接受 input/output）
- 修改：`apps/web/src/pages/account/index.vue`

- [ ] **步骤 1：调整文本报价预算。** `TextBudget` 和 `quoteCredits` 只接受 `input/output` 预算；删除按缓存费率取最高输入费率的逻辑，报价直接按输入预算和输出预算计算。
- [ ] **步骤 2：调整结算计算。** `settleGeneration` 从新价格读取两项费率，调用归一化后的 `calculateTextCredits`；结算 billing 快照同时保存 `usage` 原始分类、`billableInput`、`billableOutput`、两项 `ratesPerMillion` 和计算结果。
- [ ] **步骤 3：切换发布边界。** 不为旧 `textTokenV2/V3` 增加运行时兼容或转换；上线前停用旧价格簿并发布覆盖全部启用模型的新价格簿。数据库中的历史账单只作为展示数据保留，不再创建依赖旧价格的待结算任务。
- [ ] **步骤 4：更新账户流水明细。** 新规则展示“可计费输入（含缓存）”“输出”和对应费率；历史账单只读取保存的 `billing` 快照，不重新按旧价格结构计算。
- [ ] **步骤 5：手动验证文本账单。** 临时配置目录/数据库中验证：新价格报价只用两项；带缓存 usage 的成功请求按合并输入计费；缺 usage 释放预留；停用旧价格簿后新请求不能选中旧规则；非法新价格被拒绝。

---

## 任务 4：贯通视频生成类型、报价、预留和结算

**文件：**

- 修改：`apps/server/src/services/billingService.ts`
- 修改：`apps/server/src/utils/media/generation.ts`
- 修改：`apps/server/src/routes/billing/quote.ts`
- 修改：`apps/server/src/routes/ai/media/generate.ts`（仅在 schema 需要同步时修改）

**产出接口：**

```ts
type VideoBillingKind = "textImageToVideo" | "videoToVideo";
function getVideoBillingKind(request: Pick<MediaGenerationRequest, "images" | "videos" | "firstFrame" | "lastFrame">): VideoBillingKind;
```

- [ ] **步骤 1：实现公共分类器。** 在服务端公共媒体模块中按 `videos.length > 0` 优先归为 `videoToVideo`；否则只要有 `images`、`firstFrame` 或 `lastFrame` 归为 `textImageToVideo`；无引用仍归为 `textImageToVideo`。分类结果不得由适配器自行覆盖。
- [ ] **步骤 2：扩展报价函数签名。** `quoteCredits`、`estimateMediaCredits`、`reserveGeneration` 增加可选 `videoBillingKind`；视频统一模式忽略该参数并读取统一档位，区分模式按对应分辨率档位取价，缺少对应档位直接返回配置错误，不跨模式回退。
- [ ] **步骤 3：锁定报价快照。** `generateMedia` 在调用 `reserveGeneration` 前分类，并把 `videoBillingKind`、分辨率、时长和原始请求摘要写入 `requestSnapshot.quote`；后续 `settleGeneration` 只能使用锁定的 price book 和 billing kind，不能重新根据当前配置报价。
- [ ] **步骤 4：保持失败/取消语义。** 视频成功按预留价格扣除，失败或取消按现有释放逻辑处理；区分模式找不到对应档位时返回明确配置错误，不得按另一类价格计费。
- [ ] **步骤 5：扩展公开报价接口。** `/api/billing/quote` 接收 `videoBillingKind`（或等价的 `hasVideoReference`），仅作为估价提示；真实生成仍从完整请求的 `videos` 字段分类，防止客户端伪造分类造成扣费不一致。
- [ ] **步骤 6：手动验证四种视频路径。** 分别验证统一模式、区分模式文生、区分模式图生、区分模式视频生；确认时长×分辨率×当前模式对应单价一致，缺档位时请求被拒绝。

---

## 任务 5：同步媒体模型公开能力和节点预估

**文件：**

- 修改：`apps/server/src/utils/media/generation.ts`
- 修改：`packages/toolScaffold/src/runtime.ts`
- 修改：`packages/tools/mediaGeneration/src/runtime.ts`
- 修改：`packages/nodeScaffold/src/nodeAi.ts`
- 修改：`packages/nodes/videoGenerationNode/src/index.vue`

- [ ] **步骤 1：扩展模型列表返回。** `/api/ai/media/models` 的 `MediaModel` 对视频返回 `videoPricingMode`、统一 `resolutionTiers` 和区分后的两组档位；未完成新价格配置的模型不返回可用报价并在管理页标记为未配置。
- [ ] **步骤 2：同步工具估价 schema。** `estimateCreditsSchema` 增加 `videoBillingKind` 或 `hasVideoReference`，并将其传给 `MediaContext.estimateCredits`；实际生成工具不要求调用方额外填写分类，服务端从 `videos` 推导。
- [ ] **步骤 3：更新节点预估。** `videoGenerationNode` 根据当前 `refList` 中是否有 VIDEO 选择 `videoToVideo`，图片/首尾帧/纯提示词选择 `textImageToVideo`；统一模式查统一档位，区分模式查对应分组，缺档位显示配置错误并禁止提交。
- [ ] **步骤 4：手动验证预估一致性。** 在节点中切换纯文本、图片引用、视频引用和统一/区分价格，确认预估变化；发起真实请求后核对预留与结算明细。

---

## 任务 6：审计并适配所有视频供应商

**文件：**

- 审核并按需修改：`packages/providers/src/media/apiMart.ts`
- 审核并按需修改：`packages/providers/src/media/baiduVideoFire.ts`
- 审核并按需修改：`packages/providers/src/media/dashscopeVideo.ts`
- 审核并按需修改：`packages/providers/src/media/jojokey.ts`
- 审核并按需修改：`packages/providers/src/media/meta.ts`
- 审核并按需修改：`packages/providers/src/media/utoooSeedance.ts`
- 可能修改：`packages/providers/types.d.ts`

- [ ] **步骤 1：逐个核对标准字段。** 确认每个 `generateVideo` 仍接收并正确处理 `mode`、`images`、`videos`、`firstFrame`、`lastFrame`；不得在适配器中增加扣费或读取价格簿的逻辑。
- [ ] **步骤 2：核对能力声明。** 对支持视频参考的具体模型确保 `mode` 包含 `videoReference:n`；对不支持或能力未知的模型在配置页禁用区分计价，并保留生成请求的明确拒绝行为；图生视频统一使用图片引用或首尾帧语义归入 `textImageToVideo`。适配器能力不直接决定价格，只决定区分价格是否可选。
- [ ] **步骤 3：处理适配器差异。** 对 apiMart、meta、jojokey 的 mode fallback、utooo/baidu 的字段映射、dashscope 对视频参考的拒绝逐项检查；只补充丢失的标准字段传递或能力元数据，不重写已正确的上游请求转换。
- [ ] **步骤 4：手动验证适配器请求。** 使用现有 provider debug/本地模拟供应商，分别检查无引用、图片/首尾帧、视频引用三种请求的上游 payload 和错误边界；不使用真实生产密钥。

---

## 任务 7：建立增量消耗汇总与导出

**文件：**

- 修改：`apps/server/src/db/schema.ts`
- 新增：`apps/server/src/db/migrations/userIdentityUsageSummary.sql`
- 新增：`apps/server/src/services/usageService.ts`
- 修改：`apps/server/src/services/billingService.ts`
- 修改：`apps/server/src/services/generationService.ts`
- 修改：`apps/server/src/utils/ai/index.ts`
- 修改：`apps/server/src/agent/runtime/model.ts`
- 修改：`apps/server/src/utils/media/generation.ts`
- 新增：`apps/server/src/routes/admin/usage/summary.ts`
- 新增：`apps/server/src/routes/admin/usage/export.ts`
- 修改：`apps/web/src/lib/accountApi.ts`
- 修改：`apps/web/src/pages/admin/index.vue`

**汇总表建议结构：**

```text
generationUsageDaily
- day
- userId
- directoryHash              # 规范化项目目录的 hash；没有目录时为 unassigned
- workspaceName              # 仅展示名称，不导出绝对路径
- providerId
- modelId
- mediaType
- videoBillingKind           # none | textImageToVideo | videoToVideo
- requestCount
- successCount
- failedCount
- outputCount
- units                       # 图片张数、视频秒数或音频计费单位
- capturedCredits             # DECIMAL(26,6)
- billableInputTokens         # input + cacheRead + cacheWrite；不拆出缓存字段
- outputTokens
- videoSeconds
- pendingCount
- usableCount
- wasteCount
- updatedAt
```

唯一键为 `day + userId + directoryHash + providerId + modelId + mediaType + videoBillingKind`。`day` 使用统一的业务时区计算（默认 `Asia/Shanghai`，禁止各接口按本机时区分别计算）。`generationJobs` 增加 `directoryHash`、`workspaceName`，预留时锁定工作区归属；媒体请求使用已授权目录生成 hash，文本请求由 `/api/ai/generate` 和 Agent runtime 透传当前目录，没有目录的调用归入 `unassigned`。不把绝对目录作为聚合键或导出字段。

- [ ] **步骤 1：记录工作区上下文。** 为 `reserveGeneration`、`createChargedStream`、`streamAi` 和 Agent runtime 增加可选 workspace 上下文；`/api/ai/generate` 只要收到 `directory` 就解析并透传，即使没有媒体引用也不能丢失归属；在任务快照和任务列中保存规范化 `directoryHash/workspaceName`，确保结算时不依赖当前已切换的工作区。
- [ ] **步骤 2：在最终结算事务内增量 upsert。** `settleGeneration` 锁定任务后，只有从 `reserved/running` 转为终态时才执行一次汇总；每个终态任务只增加一次 `requestCount`，成功增加 `successCount`，失败/取消增加 `failedCount`；只有实际 `capturedCredits` 或成功输出才累加单位、积分和 token，预留释放不计入消耗。沿用任务行锁和终态判断保证重试幂等，汇总 upsert 与钱包扣款、任务状态更新在同一事务内完成。
- [ ] **步骤 3：记录媒体输出。** 图片/视频成功结算时，为每个输出路径创建 `generationOutputs` 记录并初始置为 `pending`；生成失败不创建输出记录。使用 `jobId + outputPath` 唯一约束，避免结算重试重复计数。
- [ ] **步骤 4：实现汇总查询接口。** `/api/admin/usage/summary` 仅查询每日汇总表，支持日期范围、人员、工作区、模型和媒体类型筛选，并返回分页结果和合计行；人员名称、模型名称通过现有主数据关联展示；禁止通过重新扫描 `generationJobs` 计算。
- [ ] **步骤 5：实现 CSV 导出。** `/api/admin/usage/export` 复用同一筛选条件，按数据库游标/分页读取汇总行后流式写出 UTF-8 BOM CSV；正确转义逗号、换行、双引号和中文，导出列包含人员、工作区、模型、日期、消耗单位、积分、token、输出数、可用数、废片数、待审核数和废片占比。第一版不引入 XLSX 依赖。
- [ ] **步骤 6：增加管理员页面入口。** 在管理页增加日期、人员、工作区、模型筛选、汇总表和“导出 CSV”操作；页面展示的合计数据与导出查询使用同一接口参数。

---

## 任务 8：建立废片确认状态与可选 Agent 分析

**文件：**

- 修改：`apps/server/src/db/schema.ts`
- 新增：`apps/server/src/db/migrations/userIdentityUsageSummary.sql`
- 修改：`apps/server/src/services/usageService.ts`
- 新增：`apps/server/src/routes/admin/usage/outputs.ts`
- 新增：`apps/server/src/routes/admin/usage/markOutput.ts`
- 修改：`apps/web/src/lib/accountApi.ts`
- 修改：`apps/web/src/pages/admin/index.vue`
- 后续可选：Agent 分析工具/工作流及对应前端审核面板

**输出状态：**

```text
generationOutputs
- id
- jobId
- userId
- directoryHash
- outputPath
- mediaType
- status: pending | usable | waste
- wasteReason
- reviewSource: manual | agent
- suggestedStatus
- confidence                 # 0～1
- evidence                   # JSON，保存检测依据
- reviewedBy
- reviewedAt
- createdAt
- updatedAt
```

废片占比定义为 `waste / (usable + waste)`，即“已审核输出数量中的废片比例”；`pending` 单独导出，不进入分母。没有已审核输出时废片占比返回 `null`，避免把“尚未审核”误报为 0%。第一版只对图片和视频输出统计废片比例，文本和音频保留消耗数据但不进入废片分母。该指标按输出数量计算，不把一整个多输出任务的费用直接判为废片成本；若后续要统计“废片积分占比”，需要增加输出级费用分摊规则后再实现。

- [ ] **步骤 1：增加人工确认接口。** `markOutput` 只允许有权限的任务所属人员或管理员把 `pending` 改为 `usable`/`waste`，要求 `waste` 时填写原因；记录审核人和时间，禁止直接改写计费金额。
- [ ] **步骤 1a：提供待审核输出列表。** `outputs` 按人员、工作区、日期、媒体类型和状态分页查询输出路径与预览元数据，前端在审核面板中提供采用/废片操作；不把完整媒体内容复制进数据库。
- [ ] **步骤 2：事务内修正汇总计数。** 状态变更和对应每日汇总行的 `pendingCount/usableCount/wasteCount` 增减在同一事务内完成；重复提交相同状态幂等，状态反转只按差量修正一次。
- [ ] **步骤 3：导出废片指标。** 汇总接口和 CSV 同时输出 `outputCount`、`usableCount`、`wasteCount`、`pendingCount`、`wasteRate`，并明确列名为“已审核废片占比”。
- [ ] **步骤 4：预留 Agent 候选分析。** 先用确定性规则拦截无法播放、空文件、时长/分辨率不满足配置等客观问题；对画面质量、主体一致性、动作完整性等主观问题，Agent 读取缩略图/媒体元数据、生成提示词和节点上下文，输出 `suggestedStatus`、`confidence`、`evidence`，只保存为候选建议。用户批量确认后才调用人工确认接口写入正式状态。Agent 不得直接修改正式状态、消耗金额或导出占比。
- [ ] **步骤 5：分阶段上线。** 首期交付增量汇总、CSV 导出和人工采用/废片标记；Agent 分析作为第二阶段可选工作流，避免模型误判直接污染财务和生产报表。

---

## 任务 9：更新开发 seed、停用旧价格和发布说明

**文件：**

- 修改：`apps/server/scripts/seedDevelopment.ts`
- 可能修改：`docs/superpowers/plans/textModelCreditPlan.md` 或新增本需求对应的运维说明（仅记录最终已实现规则）

- [ ] **步骤 1：更新 seed 价格。** 文本 seed 使用 `unit: "millionTokens"` 和两项 `textPricing`；视频 seed 使用统一或完整区分结构，不能继续把文本写成 `10k_chars`。
- [ ] **步骤 2：执行价格切换。** 不改写历史账单金额；发布前一次性为所有启用模型补齐新价格并退休旧价格簿。由于本次不做旧价格表适配，发现缺失新价格的模型时直接阻止发布或停用模型，不自动换算。
- [ ] **步骤 3：更新产品说明。** 管理员说明中明确：视频选择“不区分”时所有视频生成方式共用一套价格；选择“区分”时无视频引用（文生/图生）与有视频引用（视频生视频）分别计价；文本缓存 token 不再配置独立单价，按既定规则并入输入量；所有价格最多 4 位小数。

---

## 任务 10：完成验证与上线前检查

- [ ] **步骤 1：生成路由并检查变更。** 如果修改了 `apps/server/src/routes/**`，在 `apps/server` 执行 `bun run routes`，确认 `apps/server/src/router.ts` 只包含生成器变更。
- [ ] **步骤 2：执行服务端检查。** 在 `apps/server` 依次执行 `bun run typecheck`、`bun run build`；修复所有类型错误和构建错误后再继续。
- [ ] **步骤 3：执行前端/包检查。** 使用仓库已有的前端类型检查或构建命令，至少覆盖 `apps/web`、`packages/toolScaffold`、`packages/tools/mediaGeneration`、`packages/nodeScaffold`、`packages/nodes/videoGenerationNode` 的导入和类型传递。
- [ ] **步骤 4：临时数据目录 HTTP 验证。** 使用临时 `OMNISTUDIO_NEXT_DATA_DIR` 和测试账户，验证发布价格、读取配置、报价、真实媒体生成、结算、流水展示；确认不覆盖仓库 `data/` 或真实用户 settings。
- [ ] **步骤 5：验证价格精度。** 发布 `1.2345` 成功，`1.23456` 被拒绝；基础价、文本输入/输出、图片档位、视频档位和音频基础价读写无精度丢失，钱包扣款仍按六位小数。
- [ ] **步骤 6：验证文本和视频计费。** 文本只按输入/输出费率计费，缓存 token 按既定归一化规则计入输入；视频统一模式、区分模式文生/图生、视频生视频分别使用正确档位，缺档位明确拒绝。
- [ ] **步骤 7：验证汇总幂等和导出。** 成功任务只累计一次，失败/取消无实际扣费不累计；输出标记 usable/waste 后计数和已审核废片占比正确；导出只访问汇总表，CSV 转义、中文 BOM 和筛选条件正确。
- [ ] **步骤 8：上线前回滚点。** 发布前保留数据库备份和新价格簿草稿；若某适配器不支持视频参考，停用该模型或配置为统一模式，不删除历史账单和汇总数据。

## 自审结论

- 视频配置页、服务端 schema、公开模型能力、估价接口、真实生成、预留/结算、节点预估和六个视频适配器均有对应任务。
- 文本配置、报价、结算、usage 展示和 seed 均有对应任务；旧 `textTokenV2/V3` 不做运行时适配，新价格发布后统一按 `input/output` 规则执行。
- 增量汇总以结算事务为唯一写入口，导出只读汇总表；废片占比以人工确认状态为准，Agent 只提供候选分析。
- 需要新增数据库列、迁移、汇总接口和 CSV 导出接口；修改路由文件后运行路由生成器，不新增测试文件。
- 本计划采用“缓存读写并入输入计费，取消缓存独立单价”；如产品最终决定缓存免费，只需在任务 1 步骤 4 将 `billableInput` 改为仅 `input`，不影响汇总和导出结构。

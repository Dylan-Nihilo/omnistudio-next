# 开发消耗图表与导出 Implementation Plan

> 遵守仓库 `AGENTS.md`，不新增测试文件，使用类型检查、构建和浏览器手动验证。

**目标：** 在平台管理中提供可直接访问的“消耗图表”页面，沿用开发消耗筛选条件展示积分、请求、输出和废片率，并支持导出明细 CSV 与当前图表 SVG。

**方案：** 将现有管理页的消耗标签命名为“消耗图表”，保留明细表和待审核输出流程，在表格上方增加指标卡与按日趋势柱状图。直接复用 `/api/admin/usage/summary` 的明细字段在前端按日期聚合，避免新增服务端接口和重复扫描历史生成任务；CSV 继续使用 `/api/admin/usage/export`。图表和导出使用同一组筛选参数，废片率按已审核的可用数与废片数计算。

**技术栈：** Bun、TypeScript、Vue 3、现有 `@omnistudio-next/ui` 组件、内联 SVG、`saveFile` 文件保存工具。不新增图表依赖。

## 任务

### 1. 确认现有接口

- 阅读 `apps/server/src/services/usageService.ts`、`apps/server/src/routes/admin/usage/summary.ts` 和 `apps/server/src/routes/admin/usage/export.ts`。
- 确认 summary 已返回日期、积分、请求、输出、可用和废片字段，足够完成前端聚合。
- 确认 export 与 summary 接受相同的日期、人员、工作区、模型和媒体类型筛选，不新增服务端路由或数据库扫描。

### 2. 实现管理页图表

- 修改 `apps/web/src/pages/admin/index.vue`，将入口命名为“消耗图表”。
- 复用现有筛选控件；切换到该标签或点击查询时加载 summary，保留错误、加载和空数据状态。
- 增加四个指标卡：筛选后消耗积分、请求数、输出数和废片占比。
- 使用内联 SVG 绘制按日消耗趋势，最多展示最近 14 天，提供无障碍标题和图表语义。
- 增加媒体类型分布和模型消耗排行条形图，模型排行限制前 8 项。
- 增加“导出 CSV”链接，始终同步当前筛选参数。
- 增加“导出图表”按钮，将当前 SVG 序列化为自包含 Blob，并通过 `saveFile` 下载；无数据时禁用。
- 保持待审核输出的采用/废片操作；操作成功后重新加载 summary，使指标和图表同步。

### 3. 前端接口与工具

- 保持 `apps/web/src/lib/accountApi.ts` 中现有 `getAdminUsageSummary`、`getAdminUsageExportUrl` 和待审核输出接口兼容。
- 复用 `creditMicros`、`formatCredits` 和 `saveFile`，积分保留安全精度，百分比展示两位小数。

## 验证

- 执行 `bun run --filter '@omnistudio-next/web' typecheck`。
- 执行根目录 `bun run build`，确认静态构建包含图表节点。
- 执行 `git diff --check`，确认没有测试文件和格式问题。
- 在本地管理页登录 root，点击“消耗图表”，检查指标卡、趋势图、空状态和明细表。
- 修改日期、人员、工作区、模型和媒体类型筛选并点击查询，确认图表和指标随筛选更新。
- 点击 CSV 导出并检查 URL 带有筛选参数；有数据时点击图表导出并确认 SVG 文件可下载。
- 检查浏览器控制台没有 error/warn，并保存页面截图作为交付证据。

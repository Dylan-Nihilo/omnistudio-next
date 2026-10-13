# Seedance Integration Plan

**Goal:** 接入官方 Seedance 网关适配器，将本地平台模型目录连接到 `ai-gateway.utooo.com`，并用本地凭据完成鉴权连通性验证。

**Architecture:** 新增可信媒体供应商适配器，遵循现有 `ProviderDefinition` 接口，将平台公共视频请求转换为 Seedance 异步任务请求并轮询至终态。平台目录新增独立 provider 与 Seedance 模型，凭据仅通过未跟踪的 `.env` 环境变量注入。

**Tech Stack:** Bun、TypeScript、现有媒体供应商运行时、Seedance v2.1 网关协议。

**Spec:** 用户提供的《Seedance 对接文档 v2.1.html》；文档内容作为接口参考，不覆盖仓库代码规范。

## Global Constraints

- 使用 `Authorization: Bearer <apiToken>`，Base URL 为 `https://ai-gateway.utooo.com`。
- 视频创建使用 `POST /api/v3/contents/generations/tasks`，查询使用 `GET /api/v3/contents/generations/tasks/{task_id}`。
- 不把 API 密钥写入代码、数据库迁移、Git 跟踪文件或命令输出。
- 遵循仓库现有小驼峰文件名和无测试文件约束。

### Task 1: Seedance Provider Adapter

**Files:**
- Create: `packages/providers/src/media/utoooSeedance.ts`

实现文本、首帧、首尾帧和参考素材请求映射；提交任务后按 5 秒间隔查询，成功返回视频 URL，失败抛出脱敏错误。

### Task 2: Platform Catalog

**Files:**
- Modify: `apps/server/src/utils/ai/platformCatalog.ts`
- Modify: `apps/server/scripts/seedDevelopment.ts`

添加网关 provider、平台模型和开发环境价格条目，保持原有目录可用。

### Task 3: Local Configuration and Connectivity

**Files:**
- Modify: local `.env` only (ignored)

写入 `UTOOO_SEEDANCE_API_KEY`，启动临时服务或直接调用适配器，发送最小文生视频任务请求以确认鉴权和接口连通；不轮询或下载视频，避免产生不必要费用。

### Task 4: Verification

执行 `bun run --filter '@omnistudio-next/server' typecheck`，检查工作区 diff，确认密钥不出现在 Git 跟踪文件和输出中；记录真实 HTTP 状态和官方错误体摘要。

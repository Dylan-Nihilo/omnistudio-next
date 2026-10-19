# 视频拼接/合成节点 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有节点扩展体系中增加一个“视频拼接/合成”节点，让多个 `VIDEO` 输出按明确顺序通过已集成的 FFmpeg 合成为一个新的 MP4 视频，并可继续连接到画布中的其他节点。

**Architecture:** 新增独立的 `videoComposeNode` 远程节点包。节点使用一个可接收多条连接的 `videos` 输入端口和一个 `video` 输出端口；AI 先用画布的 `connectNodes` 建立输入连接，再调用节点注册的 `composeVideos` 函数执行合成。合成过程复用 `useNode().ffmpeg()` 的浏览器代理，输出保存到当前节点自己的 `assets/<nodeId>/` 目录，保留历史输出，不修改源视频。

**Tech Stack:** Vue 3 `<script setup>`、TypeScript、`@omnistudio-next/nodes-scaffold`、`@omnistudio-next/ffmpeg` 浏览器代理、Bun、Vite、FFmpeg。

**Spec:** 本轮会话中的“第一阶段：在节点扩展中增加视频拼接/合成节点”需求；第二阶段剪辑台不在本方案实施范围内，待第一阶段实际使用后另行评估。

## Global Constraints

- 所有新建文件、文件夹名称使用小驼峰；新节点目录使用 `packages/nodes/videoComposeNode/`。
- 所有自有组件文件名、本地绑定名和模板标签使用小驼峰；`.vue` 顶层顺序固定为 `<template>` → `<script>` → `<style>`。
- 禁止新增任何测试文件或测试专用封装；使用现有节点包的 typecheck、build 和手动页面验证。
- 不新增 FFmpeg 依赖，不直接拼接 `/api/ffmpeg/execute`；统一使用 `useNode().ffmpeg()`，由现有 FFmpeg 代理负责工作区校验、SSE 进度、取消和错误传递。
- 输入和输出全部使用工作区相对路径；输出写入 `assets/<nodeId>/`，源视频保持不变。
- 连接输入时不自动触发耗时合成；必须由用户点击合成按钮或 AI 调用 `node:composeVideos` 明确启动。
- 不手工修改 `apps/server/src/router.ts`；新节点通过现有 `packages/nodes/*` workspace 和 `dev:plugins`/`build:nodes` 自动发现与同步。
- 第一阶段只做顺序拼接和 MP4 导出，不实现时间线、片段裁剪、转场、字幕、音频混音、自动转码或多轨编辑。

---

### Task 1: 建立视频合成节点包和端口契约

**Files:**
- Create: `packages/nodes/videoComposeNode/package.json`
- Create: `packages/nodes/videoComposeNode/vite.config.ts`
- Create: `packages/nodes/videoComposeNode/tsconfig.json`
- Create: `packages/nodes/videoComposeNode/src/index.vue`
- Create: `packages/nodes/videoComposeNode/readme.md`

**Interfaces:**
- Consumes: 现有画布 `VIDEO` 输出；输入端口固定为 `{ id: "videos", type: "target", dataType: "VIDEO" }`，允许最多 32 个上游连接。
- Produces: 输出端口固定为 `{ id: "video", type: "source", dataType: "VIDEO" }`；初始输出为空，合成成功后写入 `{ url, mimeType: "video/mp4" }`。
- Produces: 节点包名 `@omnistudio-next/node-video-compose`、节点类型名 `videoComposeNode`、展示名“视频拼接”。

- [ ] **Step 1: 创建节点包配置**

复用 `packages/nodes/videoNode/` 的 workspace 结构和依赖，`package.json` 只保留 Vue、Vue Flow、Element Plus、UI 包和 `@omnistudio-next/nodes-scaffold`，不引入新的媒体库。`vite.config.ts` 使用 `createNodeConfig`，节点名使用 `videoComposeNode`，展示名使用“视频拼接”。文件内容按以下接口落地：

```json
{
  "name": "@omnistudio-next/node-video-compose",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch",
    "typecheck": "vue-tsc --noEmit"
  },
  "peerDependencies": {
    "vue": "^3.5.42",
    "@vue-flow/core": "^1.48.2",
    "element-plus": "^2.14.5",
    "@omnistudio-next/ui": "workspace:*"
  },
  "dependencies": {
    "@tabler/icons-vue": "^3.46.0"
  },
  "devDependencies": {
    "@omnistudio-next/nodes-scaffold": "workspace:*",
    "typescript": "~6.0.3",
    "vite": "^8.2.2",
    "vue-tsc": "^3.3.11"
  }
}
```

```ts
import { createNodeConfig } from "@omnistudio-next/nodes-scaffold";

export default createNodeConfig({
  name: "videoComposeNode",
  displayName: "视频拼接",
  author: "omnistudio-next",
  github: "https://github.com/Dylan-Nihilo/omnistudio-next",
}, import.meta.url);
```

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 2: 声明最小端口和可渲染节点外壳**

在 `src/index.vue` 中按项目顺序写入 `<template>`、`<script setup>`、`<style>`。先声明以下端口，不在此阶段修改共享连接校验：

```ts
defineOptions({
  inheritAttrs: false,
  icon: IconVideo,
  handles: [
    { id: "videos", type: "target", dataType: "VIDEO", label: "视频片段输入" },
    { id: "video", type: "source", dataType: "VIDEO", label: "合成视频输出" },
  ] satisfies NodeHandle[],
});
```

节点外壳使用 `nodeSkeleton`，预留输入列表、合成状态、合成按钮、输出预览和下载入口。尚未合成时不创建模拟视频、不显示虚假的空结果。

- [ ] **Step 3: 编写节点说明并完成静态检查**

`readme.md` 说明：可接收多个视频输入、按连接顺序或 AI 指定顺序合成、输出 MP4、需要 FFmpeg、第一阶段不包含裁剪和转场。执行：

```powershell
bun run --filter '@omnistudio-next/node-video-compose' typecheck
```

Expected: 节点包类型检查通过；此时节点可以被构建，但还没有合成执行逻辑。

- [ ] **Step 4: 提交节点外壳**

```powershell
git add packages/nodes/videoComposeNode
git commit -m "feat: add video compose node shell"
```

### Task 2: 实现输入快照和 FFmpeg 合成执行器

**Files:**
- Create: `packages/nodes/videoComposeNode/src/composeVideos.ts`
- Modify: `packages/nodes/videoComposeNode/src/index.vue`

**Interfaces:**
- Consumes: `useNodeReferences("videos").refList` 返回的已排序上游输入；每项包含 `source`、`sourceHandle`、`dataType` 和 `value`。
- Produces: `composeVideos(ffmpeg, inputPaths, outputPath, signal, onProgress): Promise<void>`，只负责配置并等待 FFmpeg，不读取画布状态。
- Produces: 节点内部 `readCompositionInputs()`，返回去除无输出项后的 `{ source, sourceHandle, path, mimeType }[]` 快照。

- [ ] **Step 1: 固定工作区和输入快照**

在合成动作开始时先取得 `const workspaceFiles = files.getWorkspaceFiles()`，再从 `useNodeReferences("videos")` 的 `refList.value` 读取当前排序后的输入并固定输入路径数组；后续清理和输出均复用这个实例。至少要求两段输入，所有输入的 MIME 必须是 `video/*`，发现上游尚未产出视频时直接返回可读错误，不启动 FFmpeg。用 `nodeEvent.on("canConnect")` 将此端口限制为最多 32 条连接，避免无限输入导致资源失控。

```ts
type CompositionInput = {
  source: string;
  sourceHandle: string;
  path: string;
  mimeType: string;
};
```

不把实时的 `outputs` ref 跨 `await` 使用为输入来源，避免合成期间上游节点变化导致输入集合半途改变。

- [ ] **Step 2: 实现明确的顺序校验和持久化**

节点工具参数使用以下 Zod 结构：

```ts
const composeSchema = z.strictObject({
  order: z.array(z.string().min(1).max(128)).min(2).max(32).optional(),
});
```

`order` 中的值是当前已连接输入的上游 `source` 节点 ID。省略时使用 `refList.value` 当前持久化顺序；传入时必须与当前输入 ID 集合完全相同，不能重复、遗漏或引用未连接节点。校验通过后按 `order` 重排 `refList.value`，让 AI 指定的顺序写入节点的 `referenceOrder`；校验失败时不修改现有输出。

- [ ] **Step 3: 使用现有浏览器 FFmpeg 代理执行 concat**

在 `composeVideos.ts` 中导出以下实现边界：

```ts
export type ComposeProgress = { percent?: number; timemark?: string };

export async function composeVideos(
  ffmpeg: BrowserFfmpegFactory,
  inputPaths: readonly string[],
  outputPath: string,
  signal: AbortSignal,
  onProgress: (progress: ComposeProgress) => void,
): Promise<void>;
```

实现使用第一个输入创建命令，按顺序调用 `.input(path)` 添加其余输入，监听 `progress`、`end` 和 `error`，最后调用 `.concat(outputPath)`。为 `signal` 注册一次性取消监听，取消时调用 `command.kill("SIGKILL")` 并让调用方保留原有输出。不要使用 Node.js Stream、临时绝对路径或直接执行子进程。

- [ ] **Step 4: 明确第一版媒体兼容边界**

第一版要求输入至少包含视频流，且分辨率、帧率、像素格式和音频轨存在性满足 FFmpeg concat filter 的兼容要求；不在节点中自动补音频、缩放、转码或混音。FFmpeg 报告不兼容时，转换为“视频参数不兼容，请统一分辨率、帧率或音频轨后重试”，保留之前的成功输出。

- [ ] **Step 5: 使用唯一输出路径保护源文件和旧结果**

输出路径采用 `assets/<nodeId>/combined-<uuid>.mp4`。执行前确保 `assets` 和 `assets/<nodeId>` 目录存在；成功后将输出设置为当前节点的 `VIDEO` 输出。失败或取消时删除本次唯一输出路径（删除失败需保留原错误并提示清理失败），不删除输入路径和之前的历史结果。

- [ ] **Step 6: 完成执行器的局部构建验证**

```powershell
bun run --filter '@omnistudio-next/node-video-compose' typecheck
bun run --filter '@omnistudio-next/node-video-compose' build
```

Expected: 节点包可以通过类型检查和 Vite UMD 构建；未连接输入、取消和 FFmpeg 错误分支均由 TypeScript 类型覆盖到调用路径。

### Task 3: 接入节点 UI、输出历史和生命周期保护

**Files:**
- Modify: `packages/nodes/videoComposeNode/src/index.vue`

**Interfaces:**
- Consumes: Task 2 的 `readCompositionInputs`、`composeVideos` 和 FFmpeg 进度回调。
- Produces: 用户可见的当前输入列表、合成中状态、进度、错误、输出预览、下载和历史输出选择。
- Produces: 节点删除、刷新和画布保存期间的资源占用保护。

- [ ] **Step 1: 显示连接输入并支持轻量排序**

复用 `useNodeReferences("videos")` 和 `referenceItem` 展示当前输入，使用已有拖拽和 Alt+方向键能力调整片段顺序；顺序由脚手架写入节点数据的 `referenceOrder`，不另建排序存储。卡片显示视频缩略图和序号，旁边标记“拼接顺序”。这只是片段排序，不引入时间线或入点/出点编辑。

- [ ] **Step 2: 接入合成按钮和运行状态**

合成按钮调用与 `node:composeVideos` 共用的 `startComposition(order?)`，避免 UI 和 AI 产生两套逻辑。运行中禁用重复执行，显示真实 `progress.percent`；FFmpeg 未提供百分比时显示加载状态，不伪造进度。连接输入变化只标记“输入已变化，请重新合成”，不自动启动任务。

- [ ] **Step 3: 复用视频预览和历史组件**

复用 `videoPlayer` 展示当前输出，复用 `mediaHistory` 读取 `assets/<nodeId>/` 中的历史 MP4；下载入口绑定当前输出。输出为空时只显示节点外壳和输入状态，不添加示例媒体或模拟内容。

- [ ] **Step 4: 处理保存、刷新、删除和取消**

按视频生成节点的生命周期模式维护 `AbortController` 和当前任务：运行中拒绝 `reload` 保存；删除时先取消并等待 FFmpeg 任务结束，再调用 `files.removeNodeFiles()`；组件卸载时取消任务。合成失败不清空上一次成功输出，错误信息通过现有节点错误反馈入口显示。

- [ ] **Step 5: 完成 UI 类型检查**

```powershell
bun run --filter '@omnistudio-next/node-video-compose' typecheck
```

Expected: UI 状态、输出类型和生命周期回调全部通过类型检查。

### Task 4: 打通 AI 节点函数和插件说明

**Files:**
- Modify: `packages/nodes/videoComposeNode/src/index.vue`
- Modify: `packages/nodeScaffold/src/nodeTools.ts:128-130`
- Modify: `packages/nodes/videoComposeNode/readme.md`

**Interfaces:**
- Consumes: 画布 `connectNodes` 建立的 `VIDEO` 输入连接，以及 Task 2 的 `composeSchema`。
- Produces: `node:composeVideos`，参数为 `{ order?: string[] }`，成功返回 `{ status: "succeeded", output: NodeOutput }`。
- Produces: AI 可发现的节点描述，明确要求先查询节点端口和连接，再调用合成函数。

- [ ] **Step 1: 注册 `composeVideos` 节点函数**

在节点 `setup` 中注册：

```ts
nodeTools.register({
  name: "composeVideos",
  description: "按当前连接或 order 指定的上游节点顺序，将至少两个视频片段合成为一个 MP4；不会裁剪、转场或修改源文件",
  parameters: composeSchema,
  async execute({ order }, { signal }) {
    return startComposition(order, signal);
  },
});
```

函数必须等待 FFmpeg 完成后再返回；取消信号传入合成器，失败时抛出错误，不把失败包装成成功状态。

- [ ] **Step 2: 将合成函数纳入长任务超时**

在 `packages/nodeScaffold/src/nodeTools.ts` 的 `isLongRunning` 判断中加入 `node:composeVideos`，沿用现有 900000 毫秒超时，避免较长视频合成被默认 120000 毫秒的节点函数超时截断。不要为所有节点函数扩大超时。

- [ ] **Step 3: 写清 AI 操作顺序和限制**

README 必须给出以下操作顺序：

1. 用 `getCanvas({ include: ["nodeTypes"] })` 确认 `videoComposeNode` 可用。
2. 用 `addNode` 新增节点，并用 `getCanvasNodes` 读取其 `videos` 端口和上游视频节点的 `video` 端口。
3. 用 `connectNodes` 把多个视频输出连接到合成节点的 `videos` 输入。
4. 用 `getNodeTools` 查询 `node:composeVideos` 的完整 schema，再传入可选的上游节点 ID顺序。
5. 等待函数返回成功输出，再用 `fitCanvas` 或后续节点继续制作。

明确写出：连线只提供素材关系，只有调用 `composeVideos` 才会启动 FFmpeg；输入参数不兼容时需要先统一素材规格。

- [ ] **Step 4: 构建并确认插件自动发现**

```powershell
bun run dev:plugins
```

Expected: `data/nodes/videoComposeNode.umd.js` 可生成并同步，刷新画布后 `videoComposeNode` 出现在可用节点类型中；不新增路由注册或服务器接口。

### Task 5: 完成第一阶段验证并记录剪辑台评估输入

**Files:**
- Modify: `packages/nodes/videoComposeNode/readme.md`（记录已验证的实际限制和操作结果）

**Interfaces:**
- Consumes: 已构建的 `videoComposeNode`、已安装且可用的 FFmpeg/FFprobe、两个或多个真实工作区视频。
- Produces: 可复核的节点功能验收结果，以及后续是否需要剪辑台的事实依据；不在本任务实现第二阶段剪辑台。

- [ ] **Step 1: 执行仓库级静态检查**

```powershell
bun run --filter '@omnistudio-next/node-video-compose' typecheck
bun run --filter '@omnistudio-next/node-video-compose' build
bun run typecheck
git diff --check
```

Expected: 新节点包、共享节点脚手架和全仓 TypeScript 检查通过，差异无空白错误。

- [ ] **Step 2: 手动验证正常合成**

在开发环境中启用 FFmpeg，准备两个规格相同的真实视频：

1. 启动 `bun run dev`，刷新画布并确认“视频拼接”节点可添加。
2. 添加两个视频节点和一个视频拼接节点，把两个视频输出连接到 `videos`。
3. 点击“合成视频”，确认出现真实进度、合成完成后可播放和下载 MP4。
4. 检查输出路径位于 `assets/<composeNodeId>/`，源文件仍可播放，并用播放器或 FFprobe 核对输出时长接近输入片段时长之和。
5. 再次合成，确认新输出不会覆盖旧结果，历史选择仍可用。

- [ ] **Step 3: 手动验证 AI 操作链**

在 AI 对话中要求其新增合成节点、连接指定视频并调用 `composeVideos`；确认 AI 先查询端口和节点函数，函数等待完成后返回真实输出，而不是只回复“已完成”。分别用节点 UI 拖拽排序和 `order` 交换两个上游节点，确认持久化顺序与最终视频顺序都随操作改变。

- [ ] **Step 4: 验证失败、取消和生命周期**

逐项验证：只有一个输入、输入尚未产出、FFmpeg 未安装、输入分辨率或音频轨不兼容、合成中点击重复合成、合成中刷新、合成中删除节点。每种情况都应保留之前的成功输出，停止当前任务，并给出可读错误；失败产生的临时输出应被清理。

- [ ] **Step 5: 记录剪辑台评估依据**

第一阶段验收后记录以下事实：常用片段数量、单次合成耗时、失败原因分布、是否频繁需要改变顺序、是否需要裁剪入点/出点、是否需要转场/字幕/音频混音、用户是否能接受“连接后再调用合成”的操作。只有这些需求在实际使用中成立，才开始第二阶段“剪辑台”独立方案；第二阶段方案仍需单独评审后实施。

## 第一阶段验收标准

- “视频拼接”节点能被插件系统发现，具有多个 `VIDEO` 输入和一个 `VIDEO` 输出。
- AI 可以新增节点、连接多个视频、按指定顺序调用 `composeVideos`，并等待真实 FFmpeg 结果。
- 用户可以手动触发合成、看到实际状态、预览和下载 MP4；输入源不被覆盖。
- 取消、错误、刷新和删除不会把失败结果写成成功，也不会静默删除旧的成功输出。
- 第一阶段不引入时间线、剪裁、转场、混音或字幕功能，相关需求进入第二阶段评估。


# Web Chunk 体积优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Follow the repository implementation instructions and verify each change before claiming completion.

**Goal:** 在不改变现有页面行为的前提下，降低 Web 端首屏和工作区入口的 JavaScript 单块体积，减少 Vite 的 chunk 大小警告。

**Architecture:** 保留现有路由级懒加载，在工作区入口继续向下拆分画布和 Agent 两个重量级组件；再用 Vite 的 `manualChunks` 将 Vue、画布、编辑器、Markdown 和 AI 运行时按依赖边界拆成可缓存的第三方 chunk。每一步都以构建产物和浏览器网络加载结果作门禁，避免只调大告警阈值掩盖体积问题。

**Tech Stack:** Vite 8、Rollup、Vue 3、Vue Router、Bun、TypeScript。

**Spec:** 当前会话中的用户需求“要是优化的话出一个优化方案”。

## Global Constraints

- 遵守仓库 AGENTS.md：自有变量、组件绑定名和模板标签使用小驼峰；`.vue` 顶层顺序保持 `template` → `script` → `style`。
- 不新增运行时依赖，不新增测试文件；验证使用现有类型检查、构建和浏览器手动检查。
- 不通过提高 `chunkSizeWarningLimit` 消除警告；只有确认第三方运行时无法继续拆分时，才单独记录该限制。
- 不把图片、视频等静态媒体体积与 JavaScript chunk 警告混在一起处理，媒体压缩另立需求。
- 不改变画布、文档、Agent 的默认显示状态、保存时机和路由权限。

### Task 1: 建立构建基线和加载清单

**Files:**
- Inspect: `apps/web/vite.config.ts`
- Inspect: `apps/web/src/router/index.ts`
- Inspect: `apps/web/src/pages/workspace/index.vue`
- Inspect: `apps/web/src/pages/workspace/panels/canvas/canvasHost.vue`
- Inspect: `apps/web/src/pages/workspace/panels/canvas/index.vue`

**Interfaces:**
- Produces: 一份可复核的基线记录，包括当前最大 JavaScript chunk、构建警告、`/home`、`/workspace`、`/admin` 的首屏请求和工作区切换后的新增请求。

- [ ] **Step 1: 生成 Web 构建基线**

  Run from the repository root:

  ```powershell
  bun run --filter '@omnistudio-next/web' build
  Get-ChildItem build/web/assets -File | Sort-Object Length -Descending | Select-Object -First 20 Length,Name
  ```

  Record the warning text and the largest files. The current reference build contains approximately `workspace` 2.7 MB, `dist` 1.59 MB, `cpp` 785 kB, and `wasm` 622 kB JavaScript assets.

- [ ] **Step 2: Map the source of the large chunks**

  Confirm the following source boundaries before editing:

  - `workspace/index.vue` statically imports `canvasHost.vue` and `floatingAgent.vue`.
  - `canvas/index.vue` statically imports Vue Flow, Tiptap, Element Plus, AI runtime modules and their CSS, and exposes these runtimes to remote nodes.
  - `router/index.ts` already lazy-loads top-level routes, so route-level lazy loading alone cannot reduce the workspace chunk further.

- [ ] **Step 3: Record manual browser checks**

  In the local app, check the browser Network panel for these flows and save the observed behavior as the comparison point:

  1. Open `/#/home`; the canvas and Agent chunks must not be requested.
  2. Open `/#/workspace`; canvas and Agent load and render with their current default visibility.
  3. Switch between canvas and document, open settings, and send one Agent message; no request may return 404 and save/navigation behavior must remain unchanged.
  4. Open `/#/admin`; the admin page remains independently loadable.

### Task 2: Split the workspace entry into asynchronous components

**Files:**
- Modify: `apps/web/src/pages/workspace/index.vue`

**Interfaces:**
- Consumes: Existing `canvasPanel`, `floatingAgent`, `documentPanel` refs and `provide` calls.
- Produces: `canvasPanel` and `floatingAgent` remain available under the same local component names and expose the same public methods after asynchronous loading.

- [ ] **Step 1: Convert the static canvas import**

  Replace the static import with the existing Vue async component pattern:

  ```ts
  import { defineAsyncComponent, nextTick, onMounted, onScopeDispose, provide, ref, watch } from "vue";

  const canvasPanel = defineAsyncComponent(() => import("./panels/canvas/canvasHost.vue"));
  ```

  Keep the current `<canvasPanel ... />` template usage and all existing `canvasPanelRef` calls. The existing `documentPanel` pattern proves the required `InstanceType` and expose behavior is already supported.

- [ ] **Step 2: Convert the static Agent import**

  Replace the static `floatingAgent` import with:

  ```ts
  const floatingAgent = defineAsyncComponent(() => import("./components/floatingAgent.vue"));
  ```

  Keep `agentVisible` defaulting to `true` so the user-visible behavior does not change. The component will load as a separate request after the workspace route begins rendering.

- [ ] **Step 3: Run type checking and build**

  Run:

  ```powershell
  bun run --filter '@omnistudio-next/web' typecheck
  bun run --filter '@omnistudio-next/web' build
  ```

  Expected result: both commands pass; the workspace route no longer contains the full static dependency tree of canvas and Agent in one application chunk, and the route still renders correctly in the manual browser checks from Task 1.

### Task 3: Add conservative vendor chunk boundaries

**Files:**
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Consumes: The async boundaries from Task 2 and existing Vite build settings.
- Produces: Stable third-party chunk groups that can be cached independently without splitting `@omnistudio-next/*` workspace packages.

- [ ] **Step 1: Add a package classifier inside the Vite config**

  Add a small `manualChunks` function under `build.rollupOptions.output`. Normalize Windows paths before matching and only classify third-party packages:

  ```ts
  const vendorChunkGroups: Record<string, string[]> = {
    vendorVue: ["vue", "vue-router", "pinia"],
    vendorUi: ["element-plus", "tdesign-vue-next", "@tdesign-vue-next/chat", "@tabler/icons-vue"],
    vendorCanvas: ["@vue-flow", "@dagrejs/dagre", "cytoscape"],
    vendorEditor: ["@tiptap", "prosemirror"],
    vendorMarkdown: ["vue-stream-markdown", "shiki", "@markmend"],
    vendorAi: ["@earendil-works"],
  };

  function getVendorChunk(id: string) {
    const normalizedId = id.replaceAll("\\", "/");
    const marker = "/node_modules/";
    const packagePath = normalizedId.includes(marker) ? normalizedId.split(marker).pop() ?? "" : "";
    if (!packagePath) return;
    for (const [chunkName, packagePrefixes] of Object.entries(vendorChunkGroups)) {
      if (packagePrefixes.some(prefix => packagePath === prefix || packagePath.startsWith(`${prefix}/`))) return chunkName;
    }
  }
  ```

- [ ] **Step 2: Wire the classifier into Rollup output**

  Extend the existing `build` block without changing `outDir` or `emptyOutDir`:

  ```ts
  build: {
    outDir: "../../build/web",
    emptyOutDir: true,
    rollupOptions: {
      output: { manualChunks: getVendorChunk },
    },
  },
  ```

  Do not classify local workspace packages or generated node/plugin bundles. The remote node host intentionally exposes the full runtime objects, so splitting those application packages by guesswork can break plugin loading.

- [ ] **Step 3: Verify chunk graph and runtime behavior**

  Run:

  ```powershell
  bun run --filter '@omnistudio-next/web' typecheck
  bun run --filter '@omnistudio-next/web' build
  git diff --check
  ```

  Compare the largest JavaScript files with the Task 1 baseline. Then repeat the browser flows from Task 1 and verify canvas, document, settings and Agent functionality. If Rollup reports a circular dependency or a runtime 404, remove only the offending package group and keep the async component split from Task 2.

### Task 4: Decide whether deeper dependency deferral is justified

**Files:**
- Inspect: `apps/web/src/lib/shiki.ts`
- Inspect: `apps/web/src/components/messageMarkdown.vue`
- Inspect: `apps/web/src/pages/workspace/panels/canvas/index.vue`

**Interfaces:**
- Consumes: Post-Task 3 chunk sizes and browser timing.
- Produces: A go/no-go decision for a second optimization pass, with no source change if the remaining large files are unavoidable third-party runtime assets.

- [ ] **Step 1: Check the remaining warning sources**

  Identify whether the remaining files are application code, a language/highlighting bundle, or a WASM/CPP runtime. Do not treat `landingPage/assets/*.mp4`, `.png`, or `.webp` as JavaScript chunk warnings.

- [ ] **Step 2: Apply the second pass only when there is a measurable user impact**

  If the Markdown bundle is still loaded on the initial workspace path, defer the Markdown renderer behind the existing `messageMarkdown` async boundary and load Shiki only when a code block is rendered. If the remaining large file is the canvas runtime required by the editor, keep it as a separately cached vendor chunk rather than adding speculative loaders.

- [ ] **Step 3: Re-run the same verification commands**

  Use the Task 3 typecheck, build, diff check and browser flows. Stop when the largest application chunk is below the project warning threshold or when only unavoidable third-party runtime assets remain; do not raise the warning threshold to conceal them.

## Verification Checklist

- [ ] `bun run --filter '@omnistudio-next/web' typecheck` passes.
- [ ] `bun run --filter '@omnistudio-next/web' build` passes and its chunk report is compared with the baseline.
- [ ] `git diff --check` passes.
- [ ] `/home`, `/workspace`, `/admin` load without 404s.
- [ ] Canvas, document, settings, Agent and remote node loading still work.
- [ ] No test files or unrelated generated files are added.

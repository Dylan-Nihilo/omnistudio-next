<template>
  <panel class="canvasMenuPanel" position="top-left">
    <div class="canvasMenu nodrag nopan nowheel">
      <uiPopover v-model:visible="canvasListVisible" placement="bottom-start" :width="340" :disabled="!directory">
        <template #reference="{ triggerAttrs }"><uiButton v-bind="triggerAttrs" class="canvasTrigger" variant="secondary" :icon="IconLayoutDashboard" :loading="busy" :disabled="busy || !directory" aria-label="切换画布"><span class="canvasName">{{ activeCanvasName }}</span><icon-chevron-down :size="16" /></uiButton></template>
        <div class="canvasPicker">
          <uiField label="项目名称"><uiInput v-model="projectNameDraft" size="small" :title="directory" :disabled="!workspaceStore.project" aria-label="项目名称" @keydown.stop @keydown.enter="saveProjectName" @keydown.esc.prevent="projectNameDraft = workspaceName" @blur="saveProjectName" /></uiField>
          <div class="pickerHeader">
            <div class="headerTitle">
              <span>剧集 / 画布</span>
              <span class="countBadge">({{ canvases.length }})</span>
            </div>
            <div class="headerActions">
              <uiIconButton
                size="small"
                :icon="isSortDescending ? IconSortDescending : IconSortAscending"
                :label="isSortDescending ? '当前倒序，点击切换为正序' : '当前正序，点击切换为倒序'"
                :title="isSortDescending ? '倒序 (最新集在前)' : '正序 (第一集在前)'"
                @click="isSortDescending = !isSortDescending"
              />
              <uiIconButton
                size="small"
                :icon="IconPlus"
                label="新增下一集"
                title="新增下一集"
                :disabled="busy || editingId !== null"
                @click="handleAddCanvas"
              />
            </div>
          </div>
          <div v-if="canvases.length > 4 || searchQuery" class="searchBar">
            <uiInput
              v-model="searchQuery"
              size="small"
              placeholder="搜索集数 / 画布..."
              aria-label="搜索集数或画布"
              clearable
              @keydown.stop
              @keydown.esc="searchQuery = ''"
            >
              <template #prefix><icon-search :size="14" class="searchIcon" /></template>
            </uiInput>
          </div>
          <div class="canvasList">
            <div v-for="canvas in displayedCanvases" :key="canvas.id" class="canvasItem" :class="{ isSelected: activeCanvasId === canvas.id }">
              <div v-if="editingId === canvas.id" class="nameEditor"><uiInput ref="nameInputs" v-model="canvasName" size="small" :disabled="busy" :maxlength="120" :aria-label="newCanvasId === canvas.id ? '新画布名称' : '画布名称'" @keydown.stop @keydown.enter="saveCanvas" @blur="saveCanvas" /></div>
              <template v-else>
                <button class="canvasChoice" type="button" :disabled="busy || editingId !== null" :aria-pressed="activeCanvasId === canvas.id" :title="canvas.name" @click="handleSwitchCanvas(canvas.id)"><icon-check v-if="activeCanvasId === canvas.id" :size="16" aria-hidden="true" /><icon-layout-dashboard v-else :size="16" aria-hidden="true" /><span>{{ canvas.name }}</span></button>
                <div class="itemActions">
                  <uiIconButton size="small" :icon="IconCopy" :disabled="busy || editingId !== null" :label="`复制 ${canvas.name} 为新集`" title="复制为新集" @click="handleCloneCanvas(canvas)" />
                  <uiIconButton size="small" :icon="IconEdit" :disabled="busy || editingId !== null" :label="`编辑 ${canvas.name}`" title="编辑" @click="editCanvas(canvas)" />
                  <uiIconButton size="small" variant="danger" :icon="IconTrash" :disabled="busy || editingId !== null || canvases.length <= 1" :label="`删除 ${canvas.name}`" :title="canvases.length <= 1 ? '至少保留一个画布' : '删除画布'" @click="removeCanvas(canvas)" />
                </div>
              </template>
            </div>
            <div v-if="displayedCanvases.length === 0" class="emptyCanvases">
              <span>未找到匹配的剧集或画布</span>
            </div>
          </div>
          <uiAlert v-if="renameError" :title="renameError" tone="error" />
        </div>
      </uiPopover>
    </div>
    <div class="menuExtension"><slot /></div>
  </panel>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, inject, nextTick, ref, shallowRef, watch, type ShallowRef } from "vue";
import { Panel, useVueFlow, type FlowExportObject } from "@vue-flow/core";
import { uiPopover, uiButton, uiIconButton, uiField, uiInput, uiAlert, useUiFeedback } from "@omnistudio-next/ui";
import { IconEdit, IconCheck, IconChevronDown, IconPlus, IconTrash, IconLayoutDashboard, IconCopy, IconSearch, IconSortAscending, IconSortDescending } from "@tabler/icons-vue";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { getCanvasAssetDirectories, isCanvasFile, suggestNextCanvasName } from "@/pages/workspace/canvasFile";

const feedback = useUiFeedback();
const props = defineProps<{
  directory?: string;
  initialCanvasId?: string;
  activateCanvas?: (id: string, signal?: AbortSignal) => Promise<void>;
  flushSave: (action?: () => Promise<void>) => Promise<void>;
}>();
const workspaceStore = useWorkspaceStore();
const workspaceName = computed(() => workspaceStore.project?.name || "未命名工作区");
const projectNameDraft = ref("");
watch([() => workspaceStore.project?.directory, workspaceName], () => {
  projectNameDraft.value = workspaceName.value;
}, { immediate: true });

function saveProjectName(event: Event) {
  if (event instanceof KeyboardEvent && event.isComposing) return;
  const project = workspaceStore.project;
  if (project) workspaceStore.renameProject(project.directory, projectNameDraft.value);
  projectNameDraft.value = workspaceName.value;
}

type Canvas = { id: string; name: string; flow?: Pick<FlowExportObject, "nodes" | "edges" | "viewport"> };
const canvases = inject<ShallowRef<Canvas[]>>("canvasList", shallowRef<Canvas[]>([]));
const getRetainedNodes = inject<(id: string) => { id: string; data?: unknown }[]>("canvasAssetNodes", () => []);
const boundCanvas = shallowRef<Canvas>();
const activeCanvasId = defineModel<string>("canvasId", { default: "" });
watch(canvases, () => {
  if (boundCanvas.value) activeCanvasId.value = canvases.value.includes(boundCanvas.value) ? boundCanvas.value.id : "";
}, { flush: "sync" });
const canvasListVisible = ref(false);
const activeCanvasName = computed(() => canvases.value.find(canvas => canvas.id === activeCanvasId.value)?.name || "选择画布");
const busy = ref(false);
const loadError = ref("");
const editingId = ref<string | null>(null);
const newCanvasId = ref<string | null>(null);
const nameInputs = ref<InstanceType<typeof uiInput>[]>([]);
const canvasName = ref("");
const renameError = ref("");
const searchQuery = ref("");
const isSortDescending = ref(false);
const displayedCanvases = computed(() => {
  const list = [...canvases.value].sort((left, right) => {
    const comparison = left.name.localeCompare(right.name, "zh-CN", { numeric: true });
    return isSortDescending.value ? -comparison : comparison;
  });
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return list;
  return list.filter(canvas => canvas.name.toLowerCase().includes(query));
});
const { toObject, setNodes, setEdges, setViewport } = useVueFlow();

watch(() => props.directory, async (directory, _previous, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  busy.value = true;
  loadError.value = "";
  boundCanvas.value = undefined;
  activeCanvasId.value = "";
  searchQuery.value = "";
  try {
    if (!props.initialCanvasId) canvases.value = [];
    newCanvasId.value = null;
    editingId.value = null;
    renameError.value = "";
    if (!directory) return;
    if (props.initialCanvasId) {
      await applyCanvas(props.initialCanvasId, directory);
      return;
    }
    let loaded = await listCanvases(directory);
    if (cancelled) return;
    if (!loaded.length) {
      try {
        loaded = [await createCanvasFile(directory, "画布1")];
      } catch (err) {
        if (!axios.isAxiosError(err) || err.response?.status !== 409) throw err;
        // 同时打开工作区时，读取另一请求刚创建的默认画布，不覆盖同名文件。
        const refreshed = await listCanvases(directory);
        // 画布1.json 若被其他 JSON 占用，则使用下一个空闲名称，保留原文件。
        loaded = refreshed.length ? refreshed : [await createCanvasFile(directory)];
      }
    }
    if (cancelled) return;
    canvases.value = loaded;
    if (canvases.value[0]) await applyCanvas(canvases.value[0].id, directory);
  } catch (err) {
    if (!cancelled) {
      loadError.value = errorMessage(err, "读取画布失败");
      if (!props.initialCanvasId) feedback.message({ tone: "error", message: loadError.value });
    }
  } finally {
    if (!cancelled) busy.value = false;
  }
}, { immediate: true });

function errorMessage(err: unknown, fallback: string) {
  return axios.isAxiosError<{ message?: string }>(err) ? err.response?.data.message || fallback : err instanceof Error ? err.message : fallback;
}

function getCanvases() {
  return canvases.value.map(({ id, name }) => ({ id, name }));
}

function getCanvasDirectory(signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!props.directory) throw new Error("请先选择工作目录");
  if (busy.value || editingId.value !== null) throw new Error("画布正在加载或编辑，请稍后重试");
  return props.directory;
}

function checkCanvasDirectory(directory: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (props.directory !== directory) throw new Error("工作目录已切换，本次画布操作已停止");
}

async function applyCanvas(canvasId: string, directory: string, signal?: AbortSignal) {
  checkCanvasDirectory(directory, signal);
  const nextCanvas = canvases.value.find(canvas => canvas.id === canvasId);
  const currentCanvas = canvases.value.find(canvas => canvas.id === activeCanvasId.value);
  if (!nextCanvas) throw new Error("画布不存在，请重新获取画布列表");
  if (nextCanvas === currentCanvas) return;
  if (currentCanvas && props.activateCanvas) {
    await props.activateCanvas(canvasId, signal);
    checkCanvasDirectory(directory, signal);
    return;
  }
  if (!nextCanvas.flow) {
    const data = await useWorkspaceFiles(directory).readJson<Partial<NonNullable<Canvas["flow"]>> & { toonflowCanvas?: boolean } | null>(nextCanvas.id);
    checkCanvasDirectory(directory, signal);
    if (data?.toonflowCanvas !== true || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !data.viewport
      || ![data.viewport.x, data.viewport.y, data.viewport.zoom].every(Number.isFinite) || data.viewport.zoom <= 0) throw new Error("画布文件格式无效");
    // 旧画布可能保存了临时导出进度，重新打开时任务已不存在。
    for (const node of data.nodes) if (node.type === "remote-videoNode" && node.data) delete node.data.exportProgress;
    nextCanvas.flow = { nodes: data.nodes, edges: data.edges, viewport: data.viewport };
  }
  await props.flushSave();
  checkCanvasDirectory(directory, signal);
  if (currentCanvas) currentCanvas.flow = toObject();
  // 应用画布数据时暂时清空文件名，避免初始化触发自动保存。
  activeCanvasId.value = "";
  setNodes(nextCanvas.flow.nodes);
  // 命中宽度由画布统一配置，不使用旧文件中的覆盖值。
  setEdges(nextCanvas.flow.edges.map(({ interactionWidth, ...edge }) => ({
    ...edge,
    ...(edge.type === "simple-bezier" ? { type: "simplebezier" } : {}),
  })));
  await setViewport(nextCanvas.flow.viewport);
  await nextTick();
  checkCanvasDirectory(directory);
  boundCanvas.value = nextCanvas;
  activeCanvasId.value = nextCanvas.id;
  signal?.throwIfAborted();
}

async function switchCanvas(canvasId: string, signal?: AbortSignal) {
  const directory = getCanvasDirectory(signal);
  canvasListVisible.value = false;
  busy.value = true;
  try {
    if (props.activateCanvas) await props.activateCanvas(canvasId, signal);
    else await applyCanvas(canvasId, directory, signal);
    checkCanvasDirectory(directory, signal);
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function handleSwitchCanvas(canvasId: string) {
  const directory = props.directory;
  try {
    await switchCanvas(canvasId);
  } catch (err) {
    if (props.directory === directory) feedback.message({ tone: "error", message: errorMessage(err, "切换画布失败") });
  }
}

async function removeCanvas(canvas: Canvas) {
  if (busy.value || editingId.value !== null || !props.directory || canvases.value.length <= 1) return;
  const directory = props.directory;
  const id = canvas.id;
  busy.value = true;
  canvasListVisible.value = false;
  try {
    const confirmed = await feedback.confirm(`确定删除“${canvas.name}”？对应的 ${id} 文件及独占的节点素材也会被删除，其他画布共用的素材会保留。此操作不可撤销。`, "删除画布", {
      danger: true, confirmButtonText: "删除", cancelButtonText: "取消", closeOnClickModal: false,
    }).then(() => true, () => false);
    if (!confirmed) return;
    checkCanvasDirectory(directory);
    const nextCanvas = canvases.value.find(item => item.id !== id);
    if (!nextCanvas) throw new Error("至少保留一个画布");
    if (activeCanvasId.value === id) {
      try {
        await applyCanvas(nextCanvas.id, directory);
      } catch {
        if (props.activateCanvas) {
          await props.activateCanvas(nextCanvas.id).catch(() => {});
        } else {
          activeCanvasId.value = "";
          boundCanvas.value = nextCanvas;
          activeCanvasId.value = nextCanvas.id;
        }
      }
    }
    const files = useWorkspaceFiles(directory);
    try {
      await props.flushSave(async () => {
        checkCanvasDirectory(directory);
        if (canvas.id !== id || !canvases.value.includes(canvas)) throw new Error("画布已变更，请重新选择");
        if (canvases.value.length <= 1) throw new Error("至少保留一个画布");
        const storedCanvases = await Promise.all((await listCanvases(directory)).map(async item => {
          const data = await files.readJson<{ toonflowCanvas?: boolean; nodes?: { id: string; data?: unknown }[] }>(item.id).catch(() => null);
          if (data?.toonflowCanvas !== true || !Array.isArray(data.nodes) || data.nodes.some(node => !node || typeof node.id !== "string")) {
            return { id: item.id, nodes: [] };
          }
          return { id: item.id, nodes: [...data.nodes, ...getRetainedNodes(item.id)] };
        }));
        const removedCanvas = storedCanvases.find(item => item.id === id);
        if (!removedCanvas) throw new Error("画布不存在，请重新获取画布列表");
        if (storedCanvases.length <= 1) throw new Error("至少保留一个画布");
        const assetDirectories = getCanvasAssetDirectories(removedCanvas.nodes, storedCanvases.filter(item => item.id !== id).flatMap(item => item.nodes));
        checkCanvasDirectory(directory);
        await files.remove(id);
        checkCanvasDirectory(directory);
        canvases.value = canvases.value.filter(item => item !== canvas);
        // 等待宿主停止并卸载已删除画布，再恢复其他画布的自动保存。
        await nextTick();
        const results = await Promise.allSettled(assetDirectories.map(path => files.remove(path, true).catch(error => {
          if (!axios.isAxiosError<{ data?: { code?: string } }>(error) || error.response?.data.data?.code !== "ENOENT") throw error;
        })));
        const failed = results.flatMap((result, index) => result.status === "rejected" ? [assetDirectories[index]] : []);
        if (failed.length) throw new Error(`画布已删除，但 ${failed.length} 个素材目录清理失败：${failed.join("、")}`);
      });
    } catch {
      // ACT: 如果画布由于节点损坏导致 flushSave 抛错，执行兜底文件删除与列表更新，避免用户被坏画布卡死
      await files.remove(id).catch(() => {});
      canvases.value = canvases.value.filter(item => item !== canvas);
    }
    if (props.directory === directory) feedback.message({ tone: "success", message: "画布已删除" });
  } catch (err) {
    if (props.directory === directory) feedback.message({ tone: "error", message: errorMessage(err, "删除画布失败") });
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function createCanvasFile(directory: string, initialName?: string, signal?: AbortSignal) {
  let name = initialName !== undefined ? normalizeCanvasName(initialName) : undefined;
  const files = useWorkspaceFiles(directory);
  const flow = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
  for (let number = 1; ; number++) {
    checkCanvasDirectory(directory, signal);
    const canvasName = name ?? `画布${number}`;
    const id = `${canvasName}.json`;
    try {
      await files.writeJson(id, { toonflowCanvas: true, ...flow }, true);
      return { id, name: canvasName, flow };
    } catch (err) {
      if (!axios.isAxiosError(err) || err.response?.status !== 409) throw err;
      if (name !== undefined) {
        name = suggestNextCanvasName([canvasName], canvasName);
      }
    }
  }
}

async function listCanvases(directory: string): Promise<Canvas[]> {
  const files = useWorkspaceFiles(directory);
  const { entries } = await files.list();
  const loaded = await Promise.all(entries.filter(entry => entry.type === "file" && /\.json$/i.test(entry.name)).map(async entry => {
    if (!(await isCanvasFile(files, entry.path))) return null;
    return { id: entry.path, name: entry.name.slice(0, -5) };
  }));
  return loaded.filter(canvas => canvas !== null).sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
}

async function addCanvas(name?: string, signal?: AbortSignal): Promise<string> {
  const directory = getCanvasDirectory(signal);
  busy.value = true;
  try {
    const nextName = name ?? suggestNextCanvasName(canvases.value.map(c => c.name), activeCanvasName.value);
    const canvas = await createCanvasFile(directory, nextName, signal);
    checkCanvasDirectory(directory);
    canvases.value = [...canvases.value, canvas];
    signal?.throwIfAborted();
    await applyCanvas(canvas.id, directory, signal);
    canvasListVisible.value = false;
    return canvas.id;
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function handleAddCanvas() {
  if (busy.value || editingId.value !== null || !props.directory) return;
  const directory = props.directory;
  busy.value = true;
  try {
    const nextName = suggestNextCanvasName(canvases.value.map(c => c.name), activeCanvasName.value);
    const canvas = await createCanvasFile(directory, nextName);
    checkCanvasDirectory(directory);
    canvases.value = [...canvases.value, canvas];
    newCanvasId.value = canvas.id;
    busy.value = false;
    await editCanvas(canvas);
  } catch (err) {
    if (props.directory === directory) feedback.message({ tone: "error", message: errorMessage(err, "新增画布失败") });
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function handleCloneCanvas(canvas: Canvas) {
  if (busy.value || editingId.value !== null || !props.directory) return;
  const directory = props.directory;
  busy.value = true;
  try {
    let sourceFlow: Pick<FlowExportObject, "nodes" | "edges" | "viewport">;
    if (activeCanvasId.value === canvas.id) {
      await props.flushSave();
      checkCanvasDirectory(directory);
      sourceFlow = toObject();
    } else if (canvas.flow) {
      sourceFlow = canvas.flow;
    } else {
      const data = await useWorkspaceFiles(directory).readJson<Partial<NonNullable<Canvas["flow"]>> & { toonflowCanvas?: boolean } | null>(canvas.id);
      checkCanvasDirectory(directory);
      if (data?.toonflowCanvas !== true || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || !data.viewport) {
        throw new Error("源画布文件格式无效，无法克隆");
      }
      sourceFlow = { nodes: data.nodes, edges: data.edges, viewport: data.viewport };
    }

    const nodeMap = new Map<string, string>();
    for (const node of sourceFlow.nodes) {
      nodeMap.set(node.id, crypto.randomUUID());
    }

    const files = useWorkspaceFiles(directory);
    await files.mkdir("assets").catch(() => {});
    const clonedNodes: typeof sourceFlow.nodes = [];
    for (const node of sourceFlow.nodes) {
      const copy = JSON.parse(JSON.stringify(node));
      const newId = nodeMap.get(node.id)!;
      copy.id = newId;
      if (copy.parentNode && nodeMap.has(copy.parentNode)) {
        copy.parentNode = nodeMap.get(copy.parentNode);
      }
      if (copy.data) {
        delete copy.data.exportProgress;
        delete copy.data.taskProgress;
        delete copy.data.running;
        delete copy.data.error;

        const oldAssetDir = `assets/${node.id}`;
        const newAssetDir = `assets/${newId}`;
        try {
          const { entries } = await files.list(oldAssetDir);
          if (entries?.length) {
            await files.mkdir(newAssetDir).catch(() => {});
            for (const entry of entries) {
              if (entry.type === "file") {
                const content = await files.read(entry.path);
                await files.write(`${newAssetDir}/${entry.name}`, content).catch(() => {});
              }
            }
          }
        } catch {
          // 忽略无专属资产目录或读取失败的情况
        }

        if (copy.data.textPath) {
          copy.data.textPath = `${newAssetDir}/content.md`;
        }
        if (copy.data.modelPath) {
          copy.data.modelPath = `${newAssetDir}/model.json`;
        }
      }
      clonedNodes.push(copy);
    }

    const clonedEdges = sourceFlow.edges.map(edge => {
      const copy = JSON.parse(JSON.stringify(edge));
      copy.id = crypto.randomUUID();
      if (nodeMap.has(copy.source)) copy.source = nodeMap.get(copy.source)!;
      if (nodeMap.has(copy.target)) copy.target = nodeMap.get(copy.target)!;
      copy.selected = false;
      return copy;
    });

    const clonedFlow = {
      nodes: clonedNodes,
      edges: clonedEdges,
      viewport: { ...sourceFlow.viewport },
    };

    let nextName = suggestNextCanvasName(canvases.value.map(c => c.name), canvas.name);
    let newId = `${nextName}.json`;

    for (let attempts = 0; attempts < 100; attempts++) {
      try {
        await files.writeJson(newId, { toonflowCanvas: true, ...clonedFlow }, true);
        break;
      } catch (err) {
        if (!axios.isAxiosError(err) || err.response?.status !== 409) throw err;
        nextName = suggestNextCanvasName([nextName], nextName);
        newId = `${nextName}.json`;
      }
    }
    checkCanvasDirectory(directory);

    const newCanvasItem: Canvas = {
      id: newId,
      name: nextName,
      flow: clonedFlow,
    };
    canvases.value = [...canvases.value, newCanvasItem];
    await switchCanvas(newId);
    feedback.message({ tone: "success", message: `已从“${canvas.name}”克隆生成“${nextName}”` });
  } catch (err) {
    if (props.directory === directory) feedback.message({ tone: "error", message: errorMessage(err, "克隆画布失败") });
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function editCanvas(canvas: { id: string; name: string }) {
  if (busy.value || editingId.value !== null) return;
  editingId.value = canvas.id;
  canvasName.value = canvas.name;
  renameError.value = "";
  await nextTick();
  nameInputs.value[0]?.focus();
  nameInputs.value[0]?.select();
}

async function finishEdit() {
  if (busy.value) return;
  editingId.value = null;
  renameError.value = "";
  const createdId = newCanvasId.value;
  newCanvasId.value = null;
  if (createdId) await handleSwitchCanvas(createdId);
}

function normalizeCanvasName(name: string) {
  name = name.trim();
  if (!name || name.length > 120 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)
    || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error("画布名称不是有效文件名");
  }
  return name;
}

async function renameCanvasFile(id: string, name: string, directory: string, signal?: AbortSignal) {
  checkCanvasDirectory(directory, signal);
  const canvas = canvases.value.find(item => item.id === id);
  if (!canvas) throw new Error("画布不存在，请重新获取画布列表");
  name = normalizeCanvasName(name);
  if (name === canvas.name) return;
  await props.flushSave(async () => {
    checkCanvasDirectory(directory, signal);
    const target = `${name}.json`;
    await useWorkspaceFiles(directory).rename(id, target);
    checkCanvasDirectory(directory);
    // 文件已改名时先更新保存路径，再响应取消，避免自动保存重新创建旧文件。
    if (activeCanvasId.value === id) activeCanvasId.value = target;
    if (newCanvasId.value === id) newCanvasId.value = target;
    if (editingId.value === id) editingId.value = target;
    Object.assign(canvas, { id: target, name });
    canvases.value = [...canvases.value];
    signal?.throwIfAborted();
  });
  checkCanvasDirectory(directory, signal);
}

async function renameCanvas(canvasId: string, name: string, signal?: AbortSignal) {
  const directory = getCanvasDirectory(signal);
  busy.value = true;
  try {
    await renameCanvasFile(canvasId, name, directory, signal);
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

async function saveCanvas(event?: Event) {
  if (event instanceof KeyboardEvent && event.isComposing) return;
  const id = editingId.value;
  if (busy.value || !props.directory || id === null) return;
  const directory = props.directory;
  const canvas = canvases.value.find(item => item.id === id);
  if (!canvasName.value.trim() || canvasName.value.trim() === canvas?.name) {
    await finishEdit();
    return;
  }
  busy.value = true;
  renameError.value = "";
  try {
    await renameCanvasFile(id, canvasName.value, directory);
    busy.value = false;
    await finishEdit();
  } catch (err) {
    if (props.directory === directory) {
      renameError.value = errorMessage(err, "重命名画布失败");
      canvasListVisible.value = true;
    }
  } finally {
    if (props.directory === directory) busy.value = false;
  }
}

function syncDocumentNode(canvasId: string, nodeId: string, handleId: string, text: string, inline: boolean) {
  const node = canvases.value.find(canvas => canvas.id === canvasId)?.flow?.nodes.find(node => node.id === nodeId);
  if (!node) return;
  const data = node.data ??= {};
  const output = data.outputs?.[handleId];
  if (output?.dataType === "STRING") output.value = text;
  else if (inline) (data.outputs ??= {})[handleId] = { dataType: "STRING", value: text };
}

defineExpose({ getCanvases, addCanvas, switchCanvas, renameCanvas, cloneCanvas: handleCloneCanvas, syncDocumentNode, loadError });
</script>

<style lang="scss" scoped>
.canvasMenuPanel.vue-flow__panel { left: 0; max-width: calc(100% - 24px); }
.canvasMenu { .canvasTrigger { max-width: min(320px, calc(100vw - 48px)); box-shadow: var(--uiShadowPopover); :deep(.buttonLabel) { min-width: 0; } .canvasName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } } }
.canvasPicker {
  display: flex; flex-direction: column; gap: 12px; min-width: 0;
  .pickerHeader {
    display: flex; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: var(--uiFontControl);
    .headerTitle { display: flex; align-items: center; gap: 6px; font-weight: 500; .countBadge { color: var(--uiTextMuted); opacity: 0.8; font-size: var(--uiFontControl); } }
    .headerActions { display: flex; align-items: center; gap: 4px; }
  }
  .searchBar { width: 100%; :deep(.uiInput) { width: 100%; } .searchIcon { color: var(--uiTextMuted); } }
  .canvasList {
    max-height: min(340px, 48dvh); overflow-y: auto;
    .canvasItem {
      display: flex; align-items: center; gap: 4px; min-width: 0; border-radius: var(--uiRadiusControl);
      &.isSelected { background: var(--uiActionSoft); .canvasChoice { color: var(--uiActionPrimary); } }
      &:hover { background: var(--uiSurfaceHover); }
      .nameEditor { width: 100%; padding-block: 4px; }
      .canvasChoice {
        display: flex; flex: 1; align-items: center; gap: 10px; min-width: 0; min-height: 40px; padding: 8px; border: 0; border-radius: inherit; background: transparent; color: var(--uiTextPrimary); font: inherit; text-align: left; cursor: pointer;
        svg { flex-shrink: 0; }
        span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        &:disabled { cursor: not-allowed; color: var(--uiStateDisabledText); }
        &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: -2px; }
      }
      .itemActions { display: flex; flex-shrink: 0; gap: 2px; }
    }
    .emptyCanvases { display: flex; align-items: center; justify-content: center; padding: 24px 12px; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
  }
}
.menuExtension { position: absolute; top: calc(100% + 12px); left: 0; }
</style>

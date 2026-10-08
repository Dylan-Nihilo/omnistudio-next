<template>
  <aside class="fileTree" aria-label="工作区文件">
    <header class="treeHeader">
      <span class="treeTitle"><icon-folder :size="16" aria-hidden="true" />工作区文件</span>
      <span class="treeActions">
        <uiIconButton size="small" :icon="IconFilePlus" :disabled="!directory || creating" label="新建 Markdown 文件" title="新建 Markdown 文件" @click="createMarkdownFile" />
        <uiIconButton size="small" :icon="IconRefresh" :disabled="!directory || loading" label="刷新文件树" title="刷新文件树" @click="refreshTree" />
      </span>
    </header>
    <uiAlert v-if="loadError" class="loadError" :title="loadError" tone="error" />
    <uiLoading :loading="loading" class="treeContent" label="读取工作区文件">
      <uiTree v-if="directory" :key="treeVersion" :data="items" :load="loadChildren" :currentNodeKey="currentKey" label="工作区文件" emptyText="暂无文件" @nodeClick="node => selectNode(node.data as FileTreeItem)">
        <template #default="{ node, expanded }">
          <span class="fileItem" :title="node.label">
            <icon-layout-dashboard v-if="(node.data as FileTreeItem).type === 'canvas'" :size="16" aria-hidden="true" />
            <icon-file-text v-else-if="(node.data as FileTreeItem).type === 'node'" :size="16" aria-hidden="true" />
            <icon-folder-open v-else-if="(node.data as FileTreeItem).type === 'directory' && expanded" :size="16" aria-hidden="true" />
            <icon-folder v-else-if="(node.data as FileTreeItem).type === 'directory'" :size="16" aria-hidden="true" />
            <icon-file v-else :size="16" aria-hidden="true" />
            <span class="fileName">{{ node.label }}</span>
          </span>
        </template>
      </uiTree>
    </uiLoading>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { uiAlert, uiIconButton, uiLoading, uiTree, useUiFeedback, type UiTreeNode } from "@toonflow/ui";
import { IconFile, IconFilePlus, IconFileText, IconFolder, IconFolderOpen, IconLayoutDashboard, IconRefresh } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { isCanvasFile } from "@/pages/workspace/canvasFile";

type CanvasNodeSelection = { canvasPath: string; nodeId: string; label: string };
type MarkdownFileSelection = { filePath: string; label: string };
export type TreeSelection = CanvasNodeSelection | MarkdownFileSelection;
type FileTreeItem = {
  key: string;
  name: string;
  path: string;
  type: "file" | "directory" | "canvas" | "node";
  isLeaf?: boolean;
  nodeId?: string;
};

const props = defineProps<{ directory?: string; selection?: TreeSelection }>();
const emit = defineEmits<{ selectNode: [selection: TreeSelection] }>();
const markdownNamePattern = /\.(md|markdown)$/i;
const treeVersion = ref(0);
const loadError = ref("");
const feedback = useUiFeedback();
const loading = ref(false);
const items = ref<UiTreeNode[]>([]);
const currentKey = computed(() => {
  const selected = props.selection;
  return selected ? JSON.stringify("filePath" in selected ? ["file", selected.filePath] : ["node", selected.canvasPath, selected.nodeId]) : undefined;
});
function treeItem(item: FileTreeItem): UiTreeNode {
  return { value: item.key, label: item.name, leaf: item.isLeaf === true, data: item };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function canvasItems(canvas: Record<string, unknown>, path: string): FileTreeItem[] {
  if (!Array.isArray(canvas.nodes)) return [];
  return canvas.nodes.flatMap((node): FileTreeItem[] => {
    if (!isRecord(node) || typeof node.id !== "string" || !node.id || !isRecord(node.data)) return [];
    const handles = Array.isArray(node.data.handles) ? node.data.handles : [];
    const hasText = handles.length
      ? handles.some(handle => isRecord(handle) && handle.type === "source"
        && (Array.isArray(handle.dataType) ? handle.dataType : [handle.dataType]).includes("STRING"))
      : isRecord(node.data.outputs) && Object.values(node.data.outputs).some(output =>
        isRecord(output) && output.dataType === "STRING" && typeof output.value === "string");
    if (!hasText) return [];
    return [{
      key: JSON.stringify(["node", path, node.id]),
      name: typeof node.data.label === "string" && node.data.label.trim() ? node.data.label : node.id,
      path,
      type: "node",
      nodeId: node.id,
      isLeaf: true,
    }];
  }).sort((left, right) => left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
}

function fileExtension(item: FileTreeItem) {
  if (item.type === "canvas") return "json";
  const index = item.name.lastIndexOf(".");
  return index > 0 ? item.name.slice(index + 1).toLowerCase() : "";
}

function selectNode(item: FileTreeItem) {
  if (item.type === "node" && item.nodeId) emit("selectNode", { canvasPath: item.path, nodeId: item.nodeId, label: item.name });
  else if (item.type === "file" && markdownNamePattern.test(item.name)) emit("selectNode", { filePath: item.path, label: item.name });
}

async function refreshTree() {
  const version = ++treeVersion.value;
  items.value = [];
  loadError.value = "";
  loading.value = !!props.directory;
  if (!props.directory) return;
  try { const result = await readChildren(); if (version === treeVersion.value) items.value = result.map(treeItem); }
  catch { /* readChildren reports errors for the current directory. */ }
  finally { if (version === treeVersion.value) loading.value = false; }
}

const creating = ref(false);

async function createMarkdownFile() {
  const currentDirectory = props.directory;
  if (!currentDirectory || creating.value) return;
  let value: string;
  try {
    ({ value } = await feedback.prompt("在工作区根目录新建 Markdown 文件", "新建文件", {
      inputValue: "文档.md",
      inputPattern: /^[^\\/]+$/,
      inputErrorMessage: "名称不能包含斜杠",
      inputValidator: name => !!name?.trim() || "请输入文件名称",
      confirmButtonText: "创建",
      cancelButtonText: "取消",
    }));
  } catch {
    return;
  }
  const name = value.trim();
  const fileName = markdownNamePattern.test(name) ? name : `${name}.md`;
  creating.value = true;
  try {
    await useWorkspaceFiles(currentDirectory).write(fileName, "", true);
    if (currentDirectory === props.directory) refreshTree();
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;
    feedback.message({ tone: "error", message: message || (error instanceof Error ? error.message : "创建文件失败") });
  } finally {
    creating.value = false;
  }
}

watch(() => props.directory, refreshTree, { flush: "sync", immediate: true });
onBeforeUnmount(() => { treeVersion.value++; });

async function readChildren(item?: FileTreeItem, signal?: AbortSignal): Promise<FileTreeItem[]> {
  const directory = props.directory;
  const version = treeVersion.value;
  const path = item?.path ?? "";
  if (!directory) return [];
  loadError.value = "";
  try {
    const files = useWorkspaceFiles(directory);
    if (item?.type === "canvas") {
      const canvas = await files.readJson(path);
      if (!isRecord(canvas) || canvas.toonflowCanvas !== true || !Array.isArray(canvas.nodes)) throw new Error("不是有效的画布文件");
      if (signal?.aborted || version !== treeVersion.value || directory !== props.directory) throw new DOMException("目录已切换", "AbortError");
      return canvasItems(canvas, path);
    }
    const { entries } = await files.list(path);
    const items = await Promise.all(entries.map(async (entry): Promise<FileTreeItem | null> => {
      const item: FileTreeItem = { ...entry, key: JSON.stringify([entry.type, entry.path]), isLeaf: entry.type === "file" || undefined };
      if (entry.type !== "file" || !entry.name.toLowerCase().endsWith(".json")) return item;
      // ACT: 扫描仅读取文件头标记，完整结构在展开画布时校验。
      const canvas = await isCanvasFile(files, entry.path);
      if (canvas === undefined) return null;
      if (!canvas) return item;
      return { ...item, key: JSON.stringify(["canvas", entry.path]), type: "canvas", isLeaf: undefined };
    }));
    if (signal?.aborted || version !== treeVersion.value || directory !== props.directory) throw new DOMException("目录已切换", "AbortError");
    const existingItems = items.filter(item => item !== null);
    existingItems.sort((left, right) => Number(left.type !== "directory") - Number(right.type !== "directory")
      || fileExtension(left).localeCompare(fileExtension(right), "zh-CN")
      || left.name.localeCompare(right.name, "zh-CN", { numeric: true }));
    return existingItems;
  } catch (error) {
    if (version === treeVersion.value && directory === props.directory) {
      const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;
      loadError.value = `读取${path || "工作区"}失败：${message || (error instanceof Error ? error.message : "请重试")}。可重新展开目录或刷新重试。`;
    }
    throw error;
  }
}
async function loadChildren(node: UiTreeNode, signal: AbortSignal) {
  return (await readChildren(node.data as FileTreeItem, signal)).map(treeItem);
}
</script>

<style scoped lang="scss">
.fileTree {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid var(--uiBorderDefault);
  background: var(--uiBackgroundSubtle);
  color: var(--uiTextBody);

  .treeHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    gap: 8px;
    min-height: 60px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--uiBorderDefault);
    .treeTitle { white-space: nowrap; display: flex; align-items: center; gap: 8px; color: var(--uiTextPrimary); font-size: var(--uiFontControl); font-weight: 500; }
    .treeActions { display: flex; align-items: center; gap: 2px; }
  }
  .loadError { flex-shrink: 0; margin: 8px; }
  .treeContent {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px;
    overscroll-behavior: contain;
    .fileItem {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-size: var(--uiFontControl);
      svg { flex-shrink: 0; color: var(--uiTextMuted); }
      .fileName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    }
  }
}
</style>

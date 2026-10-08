<template>
  <uiDialog v-model="visible" :title="`编辑技能 · ${skill.displayName}`" :width="1080" :beforeClose="close" :closeOnClickModal="false" :closeOnPressEscape="!saving && !moving && !creating && !confirming" @closed="emit('closed')">
    <div class="skillEditor" :aria-busy="filesLoading || fileLoading">
      <uiAlert v-if="filesError" :title="filesError" tone="error" />
      <template v-else>
        <aside class="fileTree" aria-label="技能文件">
          <uiButton v-if="isDirectorySkill" class="newFileButton" variant="secondary" size="small" :icon="IconFilePlus" :loading="creating" :disabled="saving || moving || confirming" @click="createFile">新建文件</uiButton>
          <uiTree :key="treeVersion" class="tree" :data="[treeRoot]" defaultExpandAll :expandOnClickNode="false" :currentNodeKey="selectedPath" :draggable="isDirectorySkill" :allowDrag="allowDrag" :allowDrop="allowDrop" label="技能文件树" @nodeClick="handleNodeClick" @nodeDrop="handleNodeDrop">
            <template #default="{ node }"><span class="treeItem"><icon-folder v-if="node.children" :size="15" aria-hidden="true" /><icon-file v-else :size="15" aria-hidden="true" /><span class="treeLabel" :title="String(node.value)">{{ node.label }}</span><span v-if="dirtyPaths.has(String(node.value)) || node.value === selectedPath && draft !== original" class="dirtyMark" aria-label="未保存的修改">●</span></span></template>
          </uiTree>
        </aside>
        <section class="fileEditor" aria-label="文件编辑器">
          <header class="fileHeader"><strong :title="selectedPath">{{ selectedPath }}</strong><span v-if="draft !== original" class="fileStatus">有未保存的修改</span></header>
          <uiAlert v-if="fileError" :title="fileError" tone="error" />
          <template v-else><p v-if="selectedPath === mainPath" class="fileHint">name 为技能标识，不可修改</p><uiTextarea v-model="draft" class="sourceInput" :rows="20" resize="none" :disabled="fileLoading || saving" :aria-label="`${selectedPath} 源码`" :spellcheck="false" /></template>
        </section>
      </template>
    </div>
    <template #footer><uiButton variant="secondary" :disabled="saving || moving || creating || confirming" @click="close()">关闭</uiButton><uiButton :loading="saving" :disabled="fileLoading || !!fileError || draft === original || moving || creating || confirming" @click="save">保存</uiButton></template>
  </uiDialog>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { uiDialog, uiAlert, uiButton, uiTree, uiTextarea, useUiFeedback, type UiTreeNode, type UiDropPosition } from "@toonflow/ui";
import { IconFile, IconFilePlus, IconFolder } from "@tabler/icons-vue";
import type { Plugin } from "./types";

interface TreeNode extends UiTreeNode {
  key: string;
  value: string;
  label: string;
  type: "file" | "directory";
  children?: TreeNode[];
}

const { skill } = defineProps<{ skill: Plugin }>();
const feedback = useUiFeedback();
const emit = defineEmits<{ saved: []; closed: [] }>();
const visible = ref(true);
const files = ref<string[]>([]);
const mainPath = ref("");
const filesLoading = ref(true);
const filesError = ref("");
const treeVersion = ref(0);
const selectedPath = ref("");
const draft = ref("");
const original = ref("");
const fileLoading = ref(true);
const fileError = ref("");
const saving = ref(false);
const creating = ref(false);
const moving = ref(false);
const confirming = ref(false);
const drafts = new Map<string, string>();
const dirtyPaths = ref(new Set<string>());
const headers = { "x-toonflow-workspace": "1" };
let controller = new AbortController();

// 单文件技能只有主文件本身，没有可管理的附属文件目录。
const isDirectorySkill = computed(() => files.value.length > 1 || files.value[0] !== mainPath.value);
const treeRoot = computed<TreeNode>(() => {
  const root: TreeNode = { key: "", value: "", label: skill.displayName, type: "directory", children: [] };
  const directories = new Map<string, TreeNode>([["", root]]);
  for (const path of files.value) {
    const parts = path.split("/");
    let parentKey = "";
    for (let index = 0; index < parts.length - 1; index++) {
      const key = parts.slice(0, index + 1).join("/");
      if (!directories.has(key)) {
        const node: TreeNode = { key, value: key, label: parts[index]!, type: "directory", children: [] };
        directories.get(parentKey)!.children!.push(node);
        directories.set(key, node);
      }
      parentKey = key;
    }
    directories.get(parentKey)!.children!.push({ key: path, value: path, label: parts.at(-1)!, type: "file" });
  }
  return root;
});

onBeforeUnmount(() => controller.abort());
onMounted(loadFiles);

async function loadFiles() {
  filesLoading.value = true;
  filesError.value = "";
  try {
    const { data } = await axios.get("/api/skills/list", { params: { name: skill.name }, headers, signal: controller.signal });
    if (data.code !== 200 || typeof data.data?.mainPath !== "string" || !Array.isArray(data.data.files) || !data.data.files.every((path: unknown) => typeof path === "string")) {
      throw new Error(data.message || "技能文件列表格式错误");
    }
    mainPath.value = data.data.mainPath;
    files.value = data.data.files;
    treeVersion.value++;
    if (!selectedPath.value || !files.value.includes(selectedPath.value)) await selectFile(mainPath.value);
  } catch (error) {
    if (!controller.signal.aborted) filesError.value = errorMessage(error, "读取技能文件列表失败，请重新打开重试");
  } finally {
    filesLoading.value = false;
  }
}

function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) return typeof error.response?.data?.message === "string" ? error.response.data.message : fallback;
  return error instanceof Error ? error.message : fallback;
}

async function selectFile(path: string) {
  if (path === selectedPath.value || saving.value) return;
  const previousPath = selectedPath.value;
  if (previousPath) {
    if (draft.value !== original.value) {
      drafts.set(previousPath, draft.value);
      dirtyPaths.value.add(previousPath);
    } else {
      drafts.delete(previousPath);
      dirtyPaths.value.delete(previousPath);
    }
  }
  selectedPath.value = path;
  const cached = drafts.get(path);
  draft.value = cached ?? "";
  original.value = "";
  fileError.value = "";
  fileLoading.value = true;
  controller.abort();
  const requestController = new AbortController();
  controller = requestController;
  try {
    const { data } = await axios.get("/api/skills/read", {
      params: path === mainPath.value ? { name: skill.name } : { name: skill.name, path },
      headers,
      signal: requestController.signal,
    });
    if (requestController.signal.aborted || selectedPath.value !== path) return;
    if (data.code !== 200 || typeof data.data?.content !== "string") throw new Error(data.message || "技能内容格式错误");
    original.value = data.data.content;
    if (cached === undefined) draft.value = data.data.content;
  } catch (error) {
    if (!requestController.signal.aborted && selectedPath.value === path) fileError.value = errorMessage(error, "读取文件失败，请重新选择重试");
  } finally {
    if (selectedPath.value === path) fileLoading.value = false;
  }
}

function handleNodeClick(node: UiTreeNode) {
  const data = node as TreeNode;
  if (data.type === "file" && !moving.value && !creating.value && !confirming.value) selectFile(data.key);
}

function allowDrag(node: UiTreeNode) {
  const data = node as TreeNode;
  return data.type === "file" && data.key !== mainPath.value && !saving.value && !moving.value && !creating.value && !confirming.value;
}

function parentOf(path: string) {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

function allowDrop(draggingNode: UiTreeNode, dropNode: UiTreeNode, type: UiDropPosition) {
  if (saving.value || moving.value || creating.value || confirming.value) return false;
  const drop = dropNode as TreeNode;
  if (type === "inside") return drop.type === "directory";
  // 仅允许拖到同目录内的兄弟文件前后调整顺序；跨目录移动统一走拖入目录节点。
  if (drop.type !== "file") return false;
  const dragging = draggingNode as TreeNode;
  return parentOf(dragging.key) === parentOf(drop.key);
}

async function handleNodeDrop(draggingNode: UiTreeNode, dropNode: UiTreeNode, dropType: UiDropPosition) {
  if (moving.value || saving.value || creating.value || confirming.value) return;
  const dragging = draggingNode as TreeNode;
  const drop = dropNode as TreeNode;
  const sourcePath = dragging.key;
  if (dropType === "inside") {
    const fileName = sourcePath.split("/").pop()!;
    const targetPath = drop.key ? `${drop.key}/${fileName}` : fileName;
    if (targetPath === sourcePath) { treeVersion.value++; return; }
    moving.value = true;
    try {
      const { data } = await axios.put("/api/skills/move", { name: skill.name, path: sourcePath, target: targetPath }, { headers });
      if (data.code !== 200) throw new Error(data.message || "移动文件失败");
      if (drafts.has(sourcePath)) { drafts.set(targetPath, drafts.get(sourcePath)!); drafts.delete(sourcePath); }
      if (dirtyPaths.value.has(sourcePath)) { dirtyPaths.value.add(targetPath); dirtyPaths.value.delete(sourcePath); }
      if (selectedPath.value === sourcePath) selectedPath.value = targetPath;
      await loadFiles();
    } catch (error) {
      feedback.message({ tone: "error", message: errorMessage(error, "移动文件失败，请重试") });
      treeVersion.value++;
    } finally {
      moving.value = false;
    }
    return;
  }
  // 同目录内调整顺序（dropType 为 before/after），不改变文件路径。
  const siblings = files.value.filter(path => path !== mainPath.value && path !== sourcePath);
  const dropIndex = siblings.indexOf(drop.key);
  const insertIndex = dropIndex < 0 ? siblings.length : dropType === "before" ? dropIndex : dropIndex + 1;
  siblings.splice(insertIndex, 0, sourcePath);
  moving.value = true;
  try {
    const { data } = await axios.put("/api/skills/order", { name: skill.name, order: siblings }, { headers });
    if (data.code !== 200) throw new Error(data.message || "保存顺序失败");
    await loadFiles();
  } catch (error) {
    feedback.message({ tone: "error", message: errorMessage(error, "保存顺序失败，请重试") });
    treeVersion.value++;
  } finally {
    moving.value = false;
  }
}

async function createFile() {
  if (creating.value || saving.value || moving.value || confirming.value || !isDirectorySkill.value) return;
  const directory = selectedPath.value.includes("/") ? selectedPath.value.slice(0, selectedPath.value.lastIndexOf("/")) : "";
  let fileName: string;
  try {
    const { value } = await feedback.prompt(directory ? `新文件将创建在“${directory}”目录` : "新文件将创建在技能根目录", "新建文件", {
      inputPattern: /^[^\\/]+$/,
      inputValidator: value => !!value?.trim() || "请输入文件名称",
      inputErrorMessage: "名称不能包含斜杠",
      confirmButtonText: "创建",
      cancelButtonText: "取消",
    });
    fileName = value.trim();
  } catch { return; }
  const path = directory ? `${directory}/${fileName}` : fileName;
  creating.value = true;
  try {
    const { data } = await axios.post("/api/skills/create", { name: skill.name, path }, { headers });
    if (data.code !== 200) throw new Error(data.message || "创建文件失败");
    await loadFiles();
    await selectFile(path);
  } catch (error) {
    feedback.message({ tone: "error", message: errorMessage(error, "创建文件失败，请重试") });
  } finally {
    creating.value = false;
  }
}

async function close(done?: () => void) {
  if (saving.value || moving.value || creating.value || confirming.value) return;
  if (draft.value !== original.value || dirtyPaths.value.size) {
    confirming.value = true;
    try {
      await feedback.confirm("修改尚未保存，确定放弃修改并关闭吗？", "未保存的修改", { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑", danger: true });
    } catch { return; }
    finally { confirming.value = false; }
  }
  if (done) done();
  else visible.value = false;
}

async function save() {
  if (fileLoading.value || saving.value || moving.value || creating.value || fileError.value || confirming.value || draft.value === original.value) return;
  saving.value = true;
  const path = selectedPath.value;
  const content = draft.value;
  try {
    const { data } = await axios.put("/api/skills/save", { name: skill.name, ...(path === mainPath.value ? {} : { path }), content }, { headers });
    if (data.code !== 200) throw new Error(data.message || "保存文件失败");
    if (selectedPath.value === path) original.value = content;
    drafts.delete(path);
    dirtyPaths.value.delete(path);
    emit("saved");
    feedback.message({ tone: "success", message: "已保存" });
  } catch (error) {
    feedback.message({ tone: "error", message: errorMessage(error, "保存文件失败，请重试") });
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.skillEditor {
  display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 24px; height: min(64dvh, 640px); min-height: 260px; min-width: 0;
  > :deep(.uiAlert) { grid-column: 1 / -1; align-self: start; }
  .fileTree { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: 0; padding-right: 20px; border-right: 1px solid var(--uiBorderDefault); .newFileButton { width: 100%; } .tree { flex: 1; min-height: 0; overflow: auto; } .treeItem { display: flex; align-items: center; gap: 8px; min-width: 0; svg { flex-shrink: 0; color: var(--uiTextMuted); } .treeLabel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .dirtyMark { flex-shrink: 0; color: var(--uiActionPrimary); } } }
  .fileEditor { display: flex; flex-direction: column; gap: 16px; min-width: 0; min-height: 0; .fileHeader { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; min-width: 0; strong { min-width: 0; overflow-wrap: anywhere; font-size: var(--uiFontLabel); font-weight: 500; } .fileStatus { margin-left: auto; color: var(--uiTextMuted); font-size: var(--uiFontControl); } } .fileHint { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); } .sourceInput { flex: 1; min-height: 0; font-family: ui-monospace, Consolas, monospace; line-height: 1.7; tab-size: 2; } }
  @media (max-width: 700px) { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(100px, 0.35fr) minmax(0, 1fr); gap: 16px; .fileTree { padding-right: 0; padding-bottom: 16px; border-right: 0; border-bottom: 1px solid var(--uiBorderDefault); } }
}
</style>
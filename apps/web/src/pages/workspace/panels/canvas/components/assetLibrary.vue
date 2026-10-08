<template>
  <aside v-if="visible" class="assetLibrary nodrag nopan nowheel" aria-label="素材库" @dblclick.stop>
    <header class="libraryHeader"><h3>素材库</h3><div class="libraryActions"><uiIconButton size="small" :icon="IconFolderPlus" label="新建文件夹" title="新建文件夹" :disabled="newFolderParent !== undefined" @click="startFolder" /><uiIconButton size="small" :icon="IconX" label="关闭素材库" title="关闭素材库" @click="visible = false" /></div></header>
    <uiInput v-model="searchQuery" size="small" placeholder="搜索素材" aria-label="搜索素材" clearable @keydown.esc.stop="searchQuery = ''"><template #prefix><icon-search :size="16" /></template></uiInput>
    <div class="libraryScroll">
      <uiTree ref="assetTree" :data="assetNodes" :currentNodeKey="folder === '.' ? undefined : folder" :filterNodeMethod="filterEntry" defaultExpandAll label="素材文件" @nodeClick="node => selectFolder(assetEntry(node))">
        <template #default="{ node }">
          <div class="assetEntry" :title="node.label" :draggable="assetEntry(node).type === 'file'" @dragstart.stop="startAssetDrag($event, assetEntry(node))" @dblclick.stop="openPreview(assetEntry(node))" @contextmenu="openItemMenu($event, assetEntry(node))">
            <icon-folder-filled v-if="assetEntry(node).type === 'directory'" class="folderIcon" :size="24" />
            <uiImage v-else-if="mediaKind(assetEntry(node)) === 'image'" class="assetThumbnail" :src="assetUrl(String(node.value))" :alt="node.label" fit="cover" loading="lazy" draggable="false" @click.stop="openPreview(assetEntry(node))"><template #error><icon-photo :size="22" /></template></uiImage>
            <span v-else class="fileIcon"><icon-music v-if="mediaKind(assetEntry(node)) === 'audio'" :size="22" /><icon-video v-else-if="mediaKind(assetEntry(node)) === 'video'" :size="22" /><icon-file v-else :size="22" /></span>
            <div v-if="assetEntry(node).draft" class="folderNameInput"><uiInput ref="folderInput" v-model="newFolderName" size="small" aria-label="文件夹名称" :disabled="folderSaving" @click.stop @keydown.stop @keydown.enter.prevent="!$event.isComposing && saveFolder()" @keydown.esc.prevent="cancelFolder" @blur="saveFolder" /></div>
            <span v-else class="assetName">{{ node.label }}</span>
            <uiIconButton v-if="mediaKind(assetEntry(node))" size="small" :icon="IconEye" :label="'预览 ' + node.label" title="预览（也可双击素材）" @click.stop="openPreview(assetEntry(node))" />
            <uiIconButton v-if="!assetEntry(node).draft" size="small" :icon="IconDots" :label="'更多 ' + node.label" title="更多" @click.stop="openItemMenu($event, assetEntry(node))" />
          </div>
        </template>
      </uiTree>
    </div>
    <div v-if="previewAsset?.kind === 'audio'" class="audioPreview"><div class="audioHeader"><span :title="previewAsset.name">{{ previewAsset.name }}</span><uiIconButton size="small" :icon="IconX" label="关闭音频预览" @click="previewAsset = undefined" /></div><uiAlert v-if="previewError" :title="previewError" tone="error" /><uiMediaPlayer v-else :key="previewAsset.url" :src="previewAsset.url" kind="audio" :label="previewAsset.name" @error="previewError = '音频无法播放，文件可能已损坏或当前浏览器不支持其编码。'" /></div>
  </aside>
  <assetMenu v-if="visible" ref="assetMenuRef" :entries="entries" @changed="refreshAssets" />
  <uiImageViewer v-if="previewAsset?.kind === 'image'" :modelValue="true" :urls="[previewAsset.url]" :title="previewAsset.name" @update:modelValue="value => { if (!value) previewAsset = undefined; }" />
  <uiDialog :modelValue="previewAsset?.kind === 'video'" :title="previewAsset?.name ?? '视频预览'" :width="800" destroyOnClose @update:modelValue="value => { if (!value) previewAsset = undefined; }"><div v-if="previewAsset?.kind === 'video'" class="assetPreview"><uiAlert v-if="previewError" :title="previewError" tone="error" /><uiMediaPlayer v-else :key="previewAsset.url" :src="previewAsset.url" :label="previewAsset.name" @error="previewError = '视频无法播放，文件可能已损坏或当前浏览器不支持其编码。'" /></div></uiDialog>
  <uiDialog v-model="saveVisible" title="保存到素材库" :width="600" :closeOnClickModal="false" :closeOnPressEscape="!saving && !folderSaving" :showClose="!saving && !folderSaving" @opened="nextTick(() => assetNameInput?.select())">
    <form class="saveForm" @submit.prevent="saveAsset">
      <uiField label="素材名称"><uiInput ref="assetNameInput" v-model="assetName" aria-label="素材名称" placeholder="输入完整文件名" :disabled="saving" @keydown.enter.prevent="!$event.isComposing && saveAsset()" /></uiField>
      <uiField v-if="outputs.length > 1" label="节点输出"><uiSelect v-model="selectedOutput" :options="outputs.map((item, index) => ({ label: item.label, value: index }))" aria-label="节点输出" :disabled="saving" /></uiField>
      <section class="saveLocation" aria-label="保存位置"><header class="locationHeader"><span>保存位置</span><uiButton variant="ghost" size="small" :icon="IconFolderPlus" :disabled="saving || saveFolderName !== undefined" @click="startSaveFolder">新建文件夹</uiButton></header><p class="locationPath" :title="saveLocationLabel">{{ saveLocationLabel }}</p><div class="saveFolderScroll"><uiTree :data="folderNodes" :currentNodeKey="saveDirectory" :expandOnClickNode="false" defaultExpandAll label="素材保存目录" @nodeClick="node => { if (!saving && saveFolderName === undefined) saveDirectory = String(node.value); }"><template #default="{ node }"><span class="saveFolderEntry"><icon-folder-filled :size="20" /><span>{{ node.label }}</span></span></template></uiTree></div><div v-if="saveFolderName !== undefined" class="createFolderRow"><uiInput ref="saveFolderInput" v-model="saveFolderName" aria-label="新文件夹名称" :disabled="folderSaving" @keydown.enter.prevent="!$event.isComposing && createFolder()" @keydown.esc.stop="saveFolderName = undefined" /><uiButton :loading="folderSaving" :disabled="!saveFolderName.trim()" @click="createFolder">创建</uiButton><uiButton variant="ghost" :disabled="folderSaving" @click="saveFolderName = undefined">取消</uiButton></div></section>
    </form>
    <template #footer><uiButton variant="secondary" :disabled="saving || folderSaving" @click="saveVisible = false">取消</uiButton><uiButton :loading="saving" :disabled="!assetName.trim() || /[\\/]/.test(assetName) || saveFolderName !== undefined" @click="saveAsset">保存</uiButton></template>
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { uiIconButton, uiInput, uiTree, uiImage, uiImageViewer, uiDialog, uiAlert, uiMediaPlayer, uiField, uiSelect, uiButton, useUiFeedback, type UiTreeNode } from "@toonflow/ui";
import { IconDots, IconEye, IconFile, IconFolderFilled, IconFolderPlus, IconMusic, IconPhoto, IconSearch, IconVideo, IconX } from "@tabler/icons-vue";
import type { NodeOutput } from "@toonflow/nodes-scaffold/values";
import { startAssetDrag } from "../canvasDrop";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import assetMenu from "./assetMenu.vue";

type AssetEntry = { name: string; path: string; type: "file" | "directory"; children?: AssetEntry[]; draft?: boolean };
type AssetOutput = { label: string; output: NodeOutput };

const feedback = useUiFeedback();
const props = defineProps<{ directory?: string }>();
const visible = defineModel<boolean>({ default: false });
const saveVisible = ref(false);
const saving = ref(false);
const entries = ref<AssetEntry[]>([]);
const folder = ref(".");
const assetName = ref("");
const assetNameInput = ref<InstanceType<typeof uiInput>>();
const saveDirectory = ref(".");
const saveFolderName = ref<string>();
const saveFolderInput = ref<InstanceType<typeof uiInput>>();
const saveLocationLabel = computed(() => saveDirectory.value === "." ? "素材库" : `素材库 / ${saveDirectory.value.split("/").join(" / ")}`);
const searchQuery = ref("");
const assetTree = ref<InstanceType<typeof uiTree>>();
const folderInput = ref<InstanceType<typeof uiInput>>();
const newFolderParent = ref<string>();
const newFolderName = ref("");
const folderSaving = ref(false);
const assetMenuRef = ref<InstanceType<typeof assetMenu>>();
const previewAsset = ref<{ name: string; url: string; kind: "image" | "audio" | "video" }>();
const previewError = ref("");
let loadRequest = 0;
onBeforeUnmount(() => { loadRequest++; });

function assetUrl(path: string) {
  return `/api/assets/read?path=${encodeURIComponent(path)}`;
}

function mediaKind(entry: AssetEntry) {
  if (entry.type !== "file" || entry.draft) return;
  if (/\.(avif|apng|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(entry.name)) return "image";
  if (/\.(mp3|wav|ogg|opus|flac|m4a|aac)$/i.test(entry.name)) return "audio";
  if (/\.(mp4|m4v|webm|mov|mkv|avi|ogv)$/i.test(entry.name)) return "video";
}

function openPreview(entry: AssetEntry) {
  const kind = mediaKind(entry);
  if (!kind) return;
  previewError.value = "";
  previewAsset.value = { name: entry.name, url: assetUrl(entry.path), kind };
}

function openItemMenu(event: MouseEvent, entry: AssetEntry) {
  if (entry.draft) return;
  event.preventDefault();
  event.stopPropagation();
  assetMenuRef.value?.openMenu(event, entry);
}

async function refreshAssets(path?: string, target?: string) {
  if (path && (folder.value === path || folder.value.startsWith(path + "/"))) {
    folder.value = target ? target + folder.value.slice(path.length) : ".";
  }
  try { await loadEntries(); } catch (error) { showError(error); }
}
const displayEntries = computed(() => {
  function withDraft(items: AssetEntry[], parent: string): AssetEntry[] {
    const children = items.map(item => item.children ? { ...item, children: withDraft(item.children, item.path) } : item);
    if (newFolderParent.value === parent) children.push({ name: "新建文件夹", path: `${parent}/:newFolder`, type: "directory", draft: true });
    return children;
  }
  return newFolderParent.value === undefined ? entries.value : withDraft(entries.value, ".");
});

function assetEntry(node: UiTreeNode) { return node.data as AssetEntry; }
function treeNodes(items: AssetEntry[]): UiTreeNode[] {
  return items.map(entry => ({ value: entry.path, label: entry.name, data: entry, leaf: entry.type === "file", children: entry.children ? treeNodes(entry.children) : undefined }));
}
const assetNodes = computed(() => treeNodes(displayEntries.value));
const folderNodes = computed(() => treeNodes(folders.value));
function filterEntry(query: string, node: UiTreeNode) {
  return !!assetEntry(node).draft || node.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
}

watch(searchQuery, query => assetTree.value?.filter(query));

async function startFolder() {
  searchQuery.value = "";
  newFolderParent.value = folder.value;
  newFolderName.value = "新建文件夹";
  await nextTick();
  assetTree.value?.expand(folder.value);
  await nextTick();
  folderInput.value?.select();
}

function cancelFolder() {
  newFolderParent.value = undefined;
}

async function saveFolder() {
  if (newFolderParent.value === undefined || folderSaving.value) return;
  const name = newFolderName.value.trim();
  if (!name) return cancelFolder();
  const parent = newFolderParent.value;
  folderSaving.value = true;
  try {
    await createAssetFolder(parent, name);
    cancelFolder();
    await loadEntries();
    folder.value = parent;
  } catch (error) {
    showError(error);
    await nextTick();
    folderInput.value?.focus();
  } finally {
    folderSaving.value = false;
  }
}

const outputs = ref<AssetOutput[]>([]);
const selectedOutput = ref(0);
let sourceDirectory: string | undefined;
const folders = computed(() => directoryEntries(entries.value));
const extension = computed(() => {
  const output = outputs.value[selectedOutput.value]?.output;
  if (!output) return "";
  if (typeof output.value !== "object") return output.dataType === "STRING" ? ".txt" : ".json";
  return output.value.url.match(/\.[^./\\]+$/)?.[0] ?? "";
});

function directoryEntries(items: AssetEntry[]): AssetEntry[] {
  return items.filter(item => item.type === "directory").map(item => ({ ...item, children: directoryEntries(item.children ?? []) }));
}

async function loadEntries() {
  const request = ++loadRequest;
  try {
    const { data } = await axios.get<{ data: { entries: AssetEntry[] } }>("/api/assets/list");
    if (request !== loadRequest) return;
    entries.value = data.data.entries;
    await nextTick();
    if (request === loadRequest) assetTree.value?.filter(searchQuery.value);
  } catch (error) {
    if (request === loadRequest) throw error;
  }
}

function showError(error: unknown) {
  feedback.message({ tone: "error", message: axios.isAxiosError<{ message: string }>(error) ? error.response?.data.message || error.message : error instanceof Error ? error.message : "素材操作失败" });
}

watch(visible, opened => {
  if (opened) loadEntries().catch(showError);
  else {
    cancelFolder();
    previewAsset.value = undefined;
  }
});

function selectFolder(entry: AssetEntry) {
  if (entry.draft) return;
  const path = entry.type === "directory" ? entry.path : entry.path.split("/").slice(0, -1).join("/") || ".";
  folder.value = folder.value === path ? "." : path;
}

async function startSaveFolder() {
  saveFolderName.value = "新建文件夹";
  await nextTick();
  saveFolderInput.value?.select();
}

async function createFolder() {
  const name = saveFolderName.value?.trim();
  if (!name || folderSaving.value) return;
  folderSaving.value = true;
  try {
    const path = await createAssetFolder(saveDirectory.value, name);
    await loadEntries();
    saveDirectory.value = path;
    saveFolderName.value = undefined;
  } catch (error) {
    showError(error);
  } finally {
    folderSaving.value = false;
  }
}

async function createAssetFolder(parent: string, name: string) {
  if (/[\\/]/.test(name)) throw new Error("文件夹名称不能包含斜杠");
  const path = parent === "." ? name : `${parent}/${name}`;
  await axios.post("/api/assets/mkdir", { path });
  return path;
}

async function openSave(label: string, items: AssetOutput[]) {
  outputs.value = items;
  selectedOutput.value = 0;
  assetName.value = label.endsWith(extension.value) ? label : `${label}${extension.value}`;
  saveDirectory.value = folder.value;
  saveFolderName.value = undefined;
  sourceDirectory = props.directory;
  saveVisible.value = true;
  try {
    await loadEntries();
  } catch (error) {
    showError(error);
  }
}

async function saveAsset() {
  const output = outputs.value[selectedOutput.value]?.output;
  const name = assetName.value.trim();
  if (!output || !name || /[\\/]/.test(name) || saving.value || saveFolderName.value !== undefined) return;
  const path = saveDirectory.value === "." ? name : `${saveDirectory.value}/${name}`;
  saving.value = true;
  try {
    const content = typeof output.value === "object"
      ? await useWorkspaceFiles(() => sourceDirectory).read(output.value.url)
      : new Blob([String(output.value)]);
    await axios.put("/api/assets/save", content, { params: { path }, headers: { "Content-Type": "application/octet-stream" } });
    saveVisible.value = false;
    feedback.message({ tone: "success", message: "已保存到素材库" });
    await loadEntries();
  } catch (error) {
    showError(error);
  } finally {
    saving.value = false;
  }
}

defineExpose({ openSave });
</script>

<style lang="scss" scoped>
.assetLibrary {
  display: flex; flex-direction: column; gap: 16px; width: min(360px, calc(100vw - 32px)); max-height: calc(100dvh - 260px); padding: 16px;
  border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); box-shadow: var(--uiShadowPopover);
  .libraryHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; h3 { margin: 0; color: var(--uiTextPrimary); font-size: var(--uiFontTitle); font-weight: 600; } .libraryActions { display: flex; gap: 4px; } }
  .libraryScroll { min-height: 0; overflow: auto; overscroll-behavior: contain; :deep(.treeRow) { padding-inline-end: 0; } .assetEntry { display: flex; align-items: center; gap: 8px; min-width: 0; &[draggable="true"] { cursor: grab; } .folderIcon { flex-shrink: 0; color: var(--uiTextMuted); } .assetThumbnail, .fileIcon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: var(--uiRadiusControl); color: var(--uiTextMuted); background: var(--uiBackgroundSubtle); } .assetName { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .folderNameInput { flex: 1; min-width: 0; } } }
  .audioPreview { flex-shrink: 0; padding-top: 12px; border-top: 1px solid var(--uiBorderDefault); .audioHeader { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--uiFontControl); } } }
}
.saveForm {
  display: flex; flex-direction: column; gap: 24px;
  .saveLocation { min-width: 0; padding-top: 20px; border-top: 1px solid var(--uiBorderDefault); .locationHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--uiTextBody); font-size: var(--uiFontLabel); } .locationPath { margin: 8px 0 16px; overflow-wrap: anywhere; color: var(--uiTextMuted); font-size: var(--uiFontControl); } .saveFolderScroll { max-height: 220px; overflow: auto; .saveFolderEntry { display: flex; align-items: center; gap: 8px; min-width: 0; svg { flex-shrink: 0; color: var(--uiTextMuted); } span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } } } .createFolderRow { display: flex; align-items: center; gap: 8px; margin-top: 16px; :deep(.uiInput) { flex: 1; min-width: 0; } } }
}
</style>

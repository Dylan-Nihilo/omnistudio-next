<template>
  <uiDialog :modelValue="open" title="导入素材" :width="680" :closeOnClickModal="true" destroyOnClose @update:modelValue="open = $event">
    <section class="mediaPicker">
      <nav class="pickerTabs" aria-label="素材来源">
        <button type="button" :aria-pressed="activeSource === 'workspace'" :class="{ isActive: activeSource === 'workspace' }" :disabled="disabled" @click="activeSource = 'workspace'">工作区</button>
        <button type="button" :aria-pressed="activeSource === 'library'" :class="{ isActive: activeSource === 'library' }" :disabled="disabled" @click="activeSource = 'library'">共享素材库</button>
      </nav>

      <div class="pickerToolbar">
        <nav class="pickerBreadcrumbs" :aria-label="activeSource === 'workspace' ? '工作区目录' : '共享素材库目录'">
          <button type="button" :disabled="!canNavigate" @click="navigateTo('')">{{ activeSource === 'workspace' ? '工作区' : '共享素材' }}</button>
          <template v-for="crumb in breadcrumbs" :key="crumb.path">
            <icon-chevron-right :size="14" aria-hidden="true" />
            <button type="button" :disabled="!canNavigate" @click="navigateTo(crumb.path)">{{ crumb.name }}</button>
          </template>
        </nav>
        <label class="pickerSearch">
          <icon-search :size="16" aria-hidden="true" />
          <input v-model.trim="searchQuery" type="search" aria-label="搜索素材名称" placeholder="搜索素材名称" :disabled="disabled" />
        </label>
      </div>

      <div v-if="errorMessage" class="pickerError" role="alert">{{ errorMessage }}</div>
      <div ref="pickerList" class="pickerList" :aria-busy="loading">
        <div v-if="loading" class="pickerState" role="status">正在读取素材…</div>
        <div v-else-if="visibleEntries.length === 0" class="pickerState">{{ searchQuery ? '没有匹配的素材' : '当前目录没有可导入的素材' }}</div>
        <div
          v-for="entry in visibleEntries"
          v-else
          :key="entry.path"
          class="pickerEntry"
          :class="{ isDisabled: !canSelect(entry) || disabled }"
          :title="entry.type === 'directory' ? `打开文件夹 ${entry.name}` : undefined"
          @click="previewEntry(entry)">
          <button v-if="entry.type === 'directory'" class="entryFolder" type="button" :disabled="!canNavigate" @click.stop="selectEntry(entry)">
            <span class="entryIcon"><icon-folder :size="18" aria-hidden="true" /></span>
            <span class="entryName">{{ entry.name }}</span>
            <span class="entryMeta">文件夹</span>
            <icon-chevron-right class="entryChevron" :size="16" aria-hidden="true" />
          </button>
          <template v-else>
            <button class="entryPreview" type="button" :disabled="!canPreviewMedia(entry) || disabled" :aria-label="`预览 ${entry.name}`" @click.stop="previewEntry(entry)">
              <uiImage v-if="mediaKind(entry) === 'image' && canPreviewMedia(entry)" class="entryThumbnail" :src="entryPreviewUrl(entry)" :alt="entry.name" fit="cover" loading="lazy">
                <template #error><span class="thumbnailFallback"><icon-photo :size="20" aria-hidden="true" /></span></template>
              </uiImage>
              <span v-else-if="mediaKind(entry) === 'video'" class="entryThumbnail videoThumbnail" :data-video-thumbnail-path="canPreviewMedia(entry) ? entry.path : undefined">
                <img v-if="videoThumbnailFrames[entry.path]" :src="videoThumbnailFrames[entry.path]" alt="" loading="lazy" />
                <span v-else class="thumbnailFallback"><icon-video :size="20" aria-hidden="true" /></span>
                <span class="videoPlayMark" aria-hidden="true"><icon-video :size="14" /></span>
              </span>
              <span v-else class="entryThumbnail entryIcon"><icon-music v-if="mediaKind(entry) === 'audio'" :size="20" aria-hidden="true" /><icon-photo v-else :size="20" aria-hidden="true" /></span>
              <span class="entryDetails">
                <span class="entryName">{{ entry.name }}</span>
                <span class="entryMeta">{{ entry.status === 'Processing' ? '处理中' : entry.status && entry.status !== 'Active' ? '不可用' : mediaKind(entry) === 'video' ? '视频 · 点击预览' : mediaKind(entry) === 'audio' ? '音频 · 点击试听' : '图片 · 点击预览' }}</span>
              </span>
            </button>
            <button class="entryImport" type="button" :disabled="!canSelect(entry) || disabled" :aria-label="`导入 ${entry.name}`" :title="entry.status === 'Processing' ? '素材仍在处理中' : entry.status && entry.status !== 'Active' ? '素材不可用' : `导入 ${entry.name}`" @click.stop="selectEntry(entry)">导入</button>
          </template>
        </div>
      </div>

      <footer class="pickerFooter">
        <button class="backButton" type="button" :disabled="!canNavigate || !currentPath" aria-label="返回上级目录" @click="navigateTo(parentPath)"><icon-arrow-left :size="16" />返回上级</button>
        <button class="closeButton" type="button" @click="open = false">关闭</button>
      </footer>
    </section>
  </uiDialog>
  <uiImageViewer v-model="imagePreviewVisible" :urls="previewItem?.kind === 'image' ? [previewItem.url] : []" :title="previewItem?.name || '图片预览'" />
  <uiDialog v-model="mediaPreviewVisible" :title="previewItem?.name || '素材预览'" width="min(900px, 92vw)" showFullscreen destroyOnClose>
    <uiMediaPlayer v-if="mediaPreviewVisible && previewItem" :src="previewItem.url" :kind="previewItem.kind === 'audio' ? 'audio' : 'video'" :poster="previewItem.poster" :label="previewItem.name" @error="previewError = '无法预览此素材，请检查文件是否可用，以及当前浏览器是否支持该媒体编码。'" />
    <p v-if="previewError" class="previewError" role="alert">{{ previewError }}</p>
  </uiDialog>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, ref, watch } from "vue";
import { uiDialog, uiImage, uiImageViewer, uiMediaPlayer } from "@omnistudio-next/ui";
import { IconArrowLeft, IconChevronRight, IconFolder, IconMusic, IconPhoto, IconSearch, IconVideo } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { getSessionSnapshot } from "@/lib/sessionState";
import { createTimelineThumbnailGenerator } from "./editorThumbnails";

type MediaSource = { type: "workspace" | "library"; path: string };
type MediaEntry = { name: string; path: string; type: "file" | "directory"; children?: MediaEntry[]; status?: string; mimeType?: string };
type MediaKind = "video" | "audio" | "image";

const props = defineProps<{ directory: string; disabled?: boolean }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ import: [source: MediaSource] }>();
const activeSource = ref<MediaSource["type"]>("workspace");
const workspacePath = ref("");
const libraryPath = ref("");
const searchQuery = ref("");
const workspaceEntries = ref<MediaEntry[]>([]);
const libraryEntries = ref<MediaEntry[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const pickerList = ref<HTMLElement>();
const videoThumbnailFrames = ref<Record<string, string>>({});
const imagePreviewVisible = ref(false);
const mediaPreviewVisible = ref(false);
const previewItem = ref<{ name: string; url: string; kind: MediaKind; poster?: string } | null>(null);
const previewError = ref("");
let loadRequest = 0;

const currentPath = computed(() => activeSource.value === "workspace" ? workspacePath.value : libraryPath.value);
const parentPath = computed(() => currentPath.value.split("/").slice(0, -1).join("/"));
const canNavigate = computed(() => !loading.value && !props.disabled);
const currentEntries = computed(() => activeSource.value === "workspace" ? workspaceEntries.value : entriesAtPath(libraryEntries.value, libraryPath.value));
const visibleEntries = computed(() => currentEntries.value.filter(entry => {
  if (!safeRelativePath(entry.path)) return false;
  if (entry.type !== "directory" && !mediaKind(entry)) return false;
  return entry.name.toLocaleLowerCase().includes(searchQuery.value.toLocaleLowerCase());
}));
const breadcrumbs = computed(() => currentPath.value.split("/").filter(Boolean).map((name, index, parts) => ({ name, path: parts.slice(0, index + 1).join("/") })));

watch(open, value => {
  if (value) {
    activeSource.value = "workspace";
    workspacePath.value = "";
    libraryPath.value = "";
    searchQuery.value = "";
  } else loadRequest++;
});
watch([open, () => props.directory, activeSource, workspacePath, libraryPath], ([visible]) => {
  imagePreviewVisible.value = false;
  mediaPreviewVisible.value = false;
  previewItem.value = null;
  previewError.value = "";
  if (!visible) return;
  if (activeSource.value === "workspace") void loadWorkspaceEntries();
  else void loadLibraryEntries();
}, { immediate: true, flush: "post" });

watch([open, pickerList, visibleEntries, loading, () => props.directory, activeSource, () => props.disabled], (_value, _previous, onCleanup) => {
  videoThumbnailFrames.value = {};
  if (!open.value || loading.value || props.disabled || !pickerList.value) return;
  const videoEntries = new Map(visibleEntries.value.filter(entry => mediaKind(entry) === "video" && canPreviewMedia(entry)).map(entry => [entry.path, entry]));
  if (!videoEntries.size) return;
  const generator = createTimelineThumbnailGenerator();
  const controller = new AbortController();
  const observer = new IntersectionObserver(entries => {
    for (const observed of entries) {
      if (!observed.isIntersecting || controller.signal.aborted) continue;
      const entry = videoEntries.get((observed.target as HTMLElement).dataset.videoThumbnailPath ?? "");
      if (!entry) continue;
      observer.unobserve(observed.target);
      void generator.getFrame(entryPreviewUrl(entry), 0, controller.signal).then(frame => {
        if (!controller.signal.aborted) videoThumbnailFrames.value[entry.path] = frame;
      }).catch(() => {
        // ACT: 浏览器无法解码时保留视频图标，仍可点击预览查看错误原因。
      });
    }
  }, { root: pickerList.value, rootMargin: "80px 0px" });
  pickerList.value.querySelectorAll<HTMLElement>("[data-video-thumbnail-path]").forEach(element => observer.observe(element));
  onCleanup(() => { observer.disconnect(); controller.abort(); generator.dispose(); });
}, { flush: "post" });

function safeRelativePath(path: string) {
  return !!path && !path.startsWith("/") && !path.includes("\\") && !/[\u0000-\u001f:<>"|?*]/.test(path)
    && path.split("/").every(part => part && part !== "." && part !== ".." && !/[. ]$/.test(part));
}

function mediaKind(entry: MediaEntry): MediaKind | undefined {
  if (entry.type !== "file") return;
  const mimeType = entry.mimeType?.toLowerCase() ?? "";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  const extension = entry.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (["mp4", "mov", "m4v", "webm", "mkv"].includes(extension ?? "")) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].includes(extension ?? "")) return "audio";
  if (["png", "jpg", "jpeg", "webp"].includes(extension ?? "")) return "image";
}

function entriesAtPath(entries: MediaEntry[], path: string): MediaEntry[] {
  if (!path) return entries;
  let current = entries;
  for (const part of path.split("/")) {
    const folder = current.find(entry => entry.type === "directory" && entry.name === part);
    if (!folder) return [];
    current = folder.children ?? [];
  }
  return current;
}

function navigateTo(path: string) {
  if (!canNavigate.value || (path && !safeRelativePath(path))) return;
  if (activeSource.value === "workspace") workspacePath.value = path;
  else libraryPath.value = path;
}

async function loadWorkspaceEntries() {
  const request = ++loadRequest;
  const directory = props.directory;
  loading.value = true;
  errorMessage.value = "";
  workspaceEntries.value = [];
  try {
    if (!directory) throw new Error("请先选择工作区");
    if (workspacePath.value && !safeRelativePath(workspacePath.value)) throw new Error("工作区目录路径无效");
    const result = await useWorkspaceFiles(directory).list(workspacePath.value);
    if (request === loadRequest) workspaceEntries.value = result.entries;
  } catch (error) {
    if (request === loadRequest) errorMessage.value = errorMessageFor(error, "读取工作区素材失败");
  } finally {
    if (request === loadRequest) loading.value = false;
  }
}

async function loadLibraryEntries() {
  const request = ++loadRequest;
  loading.value = true;
  errorMessage.value = "";
  libraryEntries.value = [];
  try {
    const { data } = await axios.get<{ data: { entries: MediaEntry[] } }>("/api/assets/list");
    if (request === loadRequest) libraryEntries.value = data.data.entries;
  } catch (error) {
    if (request === loadRequest) errorMessage.value = errorMessageFor(error, "读取共享素材失败");
  } finally {
    if (request === loadRequest) loading.value = false;
  }
}

function errorMessageFor(error: unknown, fallback: string) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : fallback;
}

function canSelect(entry: MediaEntry) {
  if (entry.type === "directory") return true;
  return !!mediaKind(entry) && (activeSource.value === "workspace" || entry.status === "Active");
}

function canPreviewMedia(entry: MediaEntry) {
  return entry.type === "file" && canSelect(entry);
}

function entryPreviewUrl(entry: MediaEntry) {
  if (activeSource.value === "workspace") return useWorkspaceFiles(props.directory).mediaUrl(entry.path);
  return `/api/assets/read?path=${encodeURIComponent(entry.path)}&accountId=${encodeURIComponent(getSessionSnapshot().userId)}`;
}

function previewEntry(entry: MediaEntry) {
  const kind = mediaKind(entry);
  if (!canNavigate.value || !kind || !canPreviewMedia(entry) || !safeRelativePath(entry.path)) return;
  previewItem.value = { name: entry.name, kind, url: entryPreviewUrl(entry), poster: kind === "video" ? videoThumbnailFrames.value[entry.path] : undefined };
  previewError.value = "";
  if (kind === "image") imagePreviewVisible.value = true;
  else mediaPreviewVisible.value = true;
}

function selectEntry(entry: MediaEntry) {
  if (props.disabled || loading.value) return;
  if (entry.type === "directory") {
    if (!safeRelativePath(entry.path)) return;
    navigateTo(entry.path);
    return;
  }
  if (!canSelect(entry) || !safeRelativePath(entry.path)) return;
  emit("import", { type: activeSource.value, path: entry.path });
  open.value = false;
}
</script>

<style lang="scss" scoped>
.mediaPicker {
  display: grid;
  gap: 14px;
  min-width: 0;
  color: #e8ece7;
  font-family: var(--uiFontFamily, sans-serif);
  font-size: 13px;

  button, input { font: inherit; }
  button { cursor: pointer; }
  button:focus-visible { outline: 2px solid #a1d0ad; outline-offset: 2px; }
  button:disabled { cursor: not-allowed; opacity: .42; }

  .pickerTabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3px;
    padding: 3px;
    border: 1px solid #3d453e;
    border-radius: 5px;
    background: #181c19;

    button { min-height: 34px; border: 0; border-radius: 3px; color: #aab5ac; background: transparent; }
    button:hover { color: #eff4ef; background: #29312b; }
    button.isActive { color: #eff4ef; background: #35463a; box-shadow: inset 0 0 0 1px #526b58; }
  }

  .pickerToolbar { display: grid; grid-template-columns: minmax(0, 1fr) minmax(190px, 250px); align-items: center; gap: 12px; }
  .pickerBreadcrumbs { display: flex; align-items: center; gap: 5px; min-width: 0; overflow: auto; color: #87938a; }
  .pickerBreadcrumbs button { flex: 0 0 auto; padding: 3px 0; border: 0; color: #aeb8b0; background: transparent; font-size: 11px; white-space: nowrap; }
  .pickerBreadcrumbs button:last-child { color: #e2e9e3; }
  .pickerBreadcrumbs button:hover:not(:disabled) { color: #a1d0ad; }
  .pickerSearch { display: flex; align-items: center; gap: 7px; min-width: 0; height: 34px; padding: 0 9px; border: 1px solid #3d453e; border-radius: 4px; color: #87938a; background: #181c19; }
  .pickerSearch input { width: 100%; min-width: 0; border: 0; outline: 0; color: #e3e8e3; background: transparent; font-size: 12px; }
  .pickerSearch input::placeholder { color: #7b877e; }
  .pickerSearch:focus-within { border-color: #6eaa87; box-shadow: 0 0 0 2px rgb(112 172 137 / 17%); }

  .pickerError { padding: 9px 10px; border: 1px solid #774b45; border-radius: 4px; color: #e9aaa0; background: #2b211f; line-height: 1.45; }
  .pickerList { display: flex; flex-direction: column; min-height: 240px; max-height: min(48vh, 420px); overflow: auto; border: 1px solid #343d36; border-radius: 5px; background: #1b201c; }
  .pickerEntry {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-height: 82px;
    padding: 0 12px 0 0;
    border-bottom: 1px solid #2d352f;
    color: #dce3dc;
    cursor: pointer;
    &:last-child { border-bottom: 0; }
    &:hover:not(.isDisabled) { background: #29312b; }
    &.isDisabled { color: #78847b; cursor: not-allowed; }
    &:has(.entryFolder) { min-height: 44px; padding: 0; }
    .entryIcon { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 4px; color: #a0c2a8; background: #28322b; }
    .entryFolder {
      display: grid;
      grid-column: 1 / -1;
      grid-template-columns: 28px minmax(0, 1fr) auto 16px;
      align-items: center;
      gap: 9px;
      min-height: 44px;
      padding: 7px 12px;
      border: 0;
      color: inherit;
      text-align: left;
      background: transparent;
    }
    .entryPreview {
      display: grid;
      grid-template-columns: 84px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      min-width: 0;
      min-height: 82px;
      padding: 9px 0 9px 12px;
      border: 0;
      color: inherit;
      text-align: left;
      background: transparent;
      .entryThumbnail {
        position: relative;
        display: block;
        width: 84px;
        height: 64px;
        overflow: hidden;
        border: 1px solid #46594b;
        border-radius: 5px;
        background: #111612;
        .thumbnailFallback { display: grid; place-items: center; width: 100%; height: 100%; color: #8caa94; }
        img { display: block; width: 100%; height: 100%; object-fit: cover; }
        .videoPlayMark { position: absolute; right: 4px; bottom: 4px; display: grid; place-items: center; padding: 3px; border-radius: 3px; color: #fff; background: rgb(0 0 0 / 65%); }
        &.entryIcon { display: grid; place-items: center; }
      }
      .entryDetails { display: grid; gap: 7px; min-width: 0; }
      &:hover:not(:disabled) .entryThumbnail { border-color: #a1d0ad; }
    }
    .entryImport {
      padding: 6px 10px;
      border: 1px solid #516759;
      border-radius: 4px;
      color: #dcebdd;
      background: #304337;
      font-size: 12px;
      &:hover:not(:disabled) { border-color: #88b297; background: #3c5746; }
    }
    .entryName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .entryMeta { color: #9ca99f; font-size: 11px; white-space: nowrap; }
    .entryChevron { color: #8e9a91; }
  }
  .pickerState { display: grid; flex: 1; place-items: center; min-height: 180px; padding: 24px; color: #89958d; text-align: center; }

  .pickerFooter { display: flex; justify-content: space-between; gap: 10px; }
  .backButton, .closeButton { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 34px; padding: 0 11px; border: 1px solid #414940; border-radius: 4px; color: #bfc8c0; background: #242a25; }
  .backButton:hover:not(:disabled), .closeButton:hover { color: #f1f5f1; border-color: #637168; background: #303831; }

  @media (max-width: 640px) {
    .pickerToolbar { grid-template-columns: minmax(0, 1fr); }
    .pickerSearch { grid-row: 1; }
    .pickerBreadcrumbs { grid-row: 2; }
  }
}
.previewError { margin: 12px 0 0; color: var(--uiDanger, #e9aaa0); line-height: 1.6; }
</style>

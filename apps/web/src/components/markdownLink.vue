<template>
  <span class="markdownLinkWrapper">
    <!-- 工作区视频链接：渲染为可点击播放的交互胶囊 -->
    <a
      v-if="isWorkspaceVideo"
      class="workspaceMediaLink"
      href="javascript:void(0)"
      :title="title || '点击播放视频'"
      @click.prevent="openVideo">
      <icon-movie :size="15" />
      <span class="linkContent">
        <component :is="NodeList" v-bind="link" :parentNode="link.node" :nodes="link.node.children" :deep="link.deep + 1" />
      </span>
      <icon-player-play :size="13" class="playIcon" />
    </a>

    <!-- 工作区图片链接：渲染为可点击查看大图的链接 -->
    <a
      v-else-if="isWorkspaceImage"
      class="workspaceMediaLink"
      href="javascript:void(0)"
      :title="title || '点击查看图片'"
      @click.prevent="openImage">
      <icon-photo :size="15" />
      <span class="linkContent">
        <component :is="NodeList" v-bind="link" :parentNode="link.node" :nodes="link.node.children" :deep="link.deep + 1" />
      </span>
      <icon-zoom-in :size="13" class="playIcon" />
    </a>

    <!-- 工作区其他文件链接：点击下载或获取 -->
    <a
      v-else-if="isWorkspaceFile"
      class="workspaceFileLink"
      href="javascript:void(0)"
      :title="title || '点击下载工作区文件'"
      @click.prevent="downloadWorkspaceFile">
      <icon-file :size="15" />
      <span class="linkContent">
        <component :is="NodeList" v-bind="link" :parentNode="link.node" :nodes="link.node.children" :deep="link.deep + 1" />
      </span>
      <icon-download :size="13" class="playIcon" />
    </a>

    <!-- 外部标准超链接 -->
    <a
      v-else
      class="externalLink"
      :href="rawUrl"
      target="_blank"
      rel="noopener noreferrer"
      :title="title">
      <span class="linkContent">
        <component :is="NodeList" v-bind="link" :parentNode="link.node" :nodes="link.node.children" :deep="link.deep + 1" />
      </span>
      <icon-external-link :size="13" class="extIcon" />
    </a>

    <!-- 视频播放弹窗 -->
    <uiDialog v-model="videoDialogVisible" :title="videoTitle" :width="800" showFullscreen @closed="closeVideo">
      <uiMediaPlayer v-if="videoUrl" :src="videoUrl" kind="video" />
    </uiDialog>

    <!-- 图片预览弹窗 -->
    <uiImageViewer v-model="imageViewerVisible" :urls="imageUrl ? [imageUrl] : []" :title="title || '图片预览'" />
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { IconMovie, IconPlayerPlay, IconPhoto, IconZoomIn, IconFile, IconDownload, IconExternalLink } from "@tabler/icons-vue";
import { uiDialog, uiImageViewer, uiMediaPlayer } from "@omnistudio-next/ui";
import { NodeList, type LinkNodeRendererProps } from "vue-stream-markdown";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps<{ link: LinkNodeRendererProps; directory: string }>();
const workspaceStore = useWorkspaceStore();

const effectiveDirectory = computed(() => props.directory || workspaceStore.project?.directory || "");

const rawUrl = computed(() => props.link.node.url?.trim().replace(/^<|>$/g, "") ?? "");
const title = computed(() => props.link.node.title ?? "");

const isExternal = computed(() => /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(rawUrl.value));

const videoRegex = /\.(mp4|webm|mov|mkv|m4v|ogv)(?:[?#]|$)/i;
const imageRegex = /\.(avif|apng|png|jpe?g|gif|webp|svg|bmp)(?:[?#]|$)/i;

const isWorkspaceVideo = computed(() => !isExternal.value && !!effectiveDirectory.value && videoRegex.test(rawUrl.value));
const isWorkspaceImage = computed(() => !isExternal.value && !!effectiveDirectory.value && imageRegex.test(rawUrl.value));
const isWorkspaceFile = computed(() => !isExternal.value && !!effectiveDirectory.value);

const videoDialogVisible = ref(false);
const videoUrl = ref("");
const videoTitle = ref("视频预览");
let videoRelease: (() => void) | undefined;

async function openVideo() {
  const dir = effectiveDirectory.value;
  if (!dir) return;
  const rawPath = rawUrl.value.split(/[?#]/, 1)[0]!;
  const path = decodeURIComponent(rawPath).replaceAll("\\", "/");
  videoTitle.value = path.split("/").pop() || "视频预览";
  try {
    const preview = useWorkspaceFiles(dir).acquireUrl(path, "video/mp4");
    videoRelease?.();
    videoRelease = preview.release;
    videoUrl.value = await preview.url;
    videoDialogVisible.value = true;
  } catch (err) {
    console.error("加载视频失败", err);
  }
}

function closeVideo() {
  videoDialogVisible.value = false;
  videoUrl.value = "";
  videoRelease?.();
  videoRelease = undefined;
}

const imageViewerVisible = ref(false);
const imageUrl = ref("");
let imageRelease: (() => void) | undefined;

async function openImage() {
  const dir = effectiveDirectory.value;
  if (!dir) return;
  const rawPath = rawUrl.value.split(/[?#]/, 1)[0]!;
  const path = decodeURIComponent(rawPath).replaceAll("\\", "/");
  try {
    const preview = useWorkspaceFiles(dir).acquireUrl(path);
    imageRelease?.();
    imageRelease = preview.release;
    imageUrl.value = await preview.url;
    imageViewerVisible.value = true;
  } catch (err) {
    console.error("加载图片失败", err);
  }
}

async function downloadWorkspaceFile() {
  const dir = effectiveDirectory.value;
  if (!dir) return;
  const rawPath = rawUrl.value.split(/[?#]/, 1)[0]!;
  const path = decodeURIComponent(rawPath).replaceAll("\\", "/");
  const fileName = path.split("/").pop() || "download";
  try {
    const preview = useWorkspaceFiles(dir).acquireUrl(path);
    const resolvedUrl = await preview.url;
    const anchor = document.createElement("a");
    anchor.href = resolvedUrl;
    anchor.download = fileName;
    anchor.click();
    setTimeout(() => preview.release(), 1000);
  } catch (err) {
    console.error("下载文件失败", err);
  }
}

onBeforeUnmount(() => {
  videoRelease?.();
  imageRelease?.();
});
</script>

<style scoped lang="scss">
.markdownLinkWrapper {
  display: inline;

  .workspaceMediaLink,
  .workspaceFileLink {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    margin: 0 2px;
    border-radius: var(--uiRadiusControl);
    background: var(--uiBackgroundSubtle);
    border: 1px solid var(--uiBorderDefault);
    color: var(--uiActionPrimary);
    text-decoration: none;
    cursor: pointer;
    font-size: 0.9em;
    vertical-align: baseline;
    transition: background-color 0.15s ease, border-color 0.15s ease;

    .linkContent {
      word-break: break-all;
    }

    .playIcon {
      opacity: 0.8;
    }

    &:hover {
      background: var(--uiBackgroundSurface);
      border-color: var(--uiActionPrimary);
      text-decoration: none;
    }
  }

  .externalLink {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--uiActionPrimary);
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;

    .extIcon {
      opacity: 0.7;
    }

    &:hover {
      color: var(--uiActionPrimaryHover);
    }
  }
}
</style>

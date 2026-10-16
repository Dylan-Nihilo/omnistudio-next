<template>
  <div class="markdownImageWrapper">
    <div
      v-if="failed"
      class="markdownImageFailed"
      role="button"
      tabindex="0"
      aria-label="图片加载失败，点击重试"
      title="点击重新加载图片"
      @click="triggerManualRetry"
      @keydown.enter="triggerManualRetry">
      <icon-refresh v-if="loading" class="isLoading" :size="16" />
      <icon-photo-off v-else :size="16" />
      <span>{{ loading ? '正在重试加载…' : '图片加载失败（点击重试）' }}</span>
    </div>
    <div v-else-if="loading && !imageUrl" class="markdownImageLoading" role="status" aria-label="正在加载图片">
      <icon-loader-2 class="isLoading" :size="16" />
      <span>加载图片中…</span>
    </div>
    <figure v-else-if="imageUrl" class="markdownImageFigure">
      <div class="markdownImageFrame" @click="viewerVisible = true">
        <img
          class="markdownImage"
          :src="imageUrl"
          :alt="alt"
          :title="title"
          loading="eager"
          decoding="async"
          @error="handleImgError"
        />
        <div class="imageOverlay" title="点击查看大图">
          <icon-zoom-in :size="20" />
        </div>
      </div>
      <figcaption v-if="title || alt" class="markdownImageCaption">{{ title || alt }}</figcaption>
      <uiImageViewer v-model="viewerVisible" :urls="[imageUrl]" :title="title || alt || '图片预览'" />
    </figure>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { IconLoader2, IconPhotoOff, IconZoomIn, IconRefresh } from "@tabler/icons-vue";
import { uiImageViewer } from "@omnistudio-next/ui";
import type { ImageNodeRendererProps } from "vue-stream-markdown";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { useWorkspaceStore } from "@/stores/workspace";

const props = defineProps<{ image: ImageNodeRendererProps; directory: string }>();
const workspaceStore = useWorkspaceStore();

const effectiveDirectory = computed(() => props.directory || workspaceStore.project?.directory || "");

const imageUrl = ref("");
const loading = ref(false);
const failed = ref(false);
const viewerVisible = ref(false);
const lastLoadedKey = ref("");

let cleanupRelease: (() => void) | undefined;
let activeToken = 0;

const rawUrl = computed(() => props.image.node.url?.trim().replace(/^<|>$/g, "") ?? "");
const alt = computed(() => String(props.image.node.alt ?? ""));
const title = computed(() => String(props.image.node.title ?? ""));

const isExternal = computed(() => /^(?:[a-z][a-z\d+.-]*:|\/\/|data:|blob:)/i.test(rawUrl.value));

function handleImgError() {
  if (imageUrl.value && !isExternal.value) {
    imageUrl.value = "";
    lastLoadedKey.value = "";
    void triggerManualRetry();
  } else {
    failed.value = true;
  }
}

async function triggerManualRetry() {
  if (loading.value) return;
  lastLoadedKey.value = "";
  failed.value = false;
  await fetchImage(effectiveDirectory.value, rawUrl.value);
}

async function fetchImage(directory: string, url: string) {
  const token = ++activeToken;
  if (!url) {
    cleanupRelease?.();
    cleanupRelease = undefined;
    imageUrl.value = "";
    loading.value = false;
    failed.value = false;
    return;
  }

  if (isExternal.value) {
    cleanupRelease?.();
    cleanupRelease = undefined;
    imageUrl.value = url;
    failed.value = false;
    loading.value = false;
    return;
  }

  if (!directory) {
    cleanupRelease?.();
    cleanupRelease = undefined;
    imageUrl.value = "";
    loading.value = true;
    return;
  }

  const rawPath = url.split(/[?#]/, 1)[0]!;
  const path = decodeURIComponent(rawPath).replaceAll("\\", "/");
  const key = `${directory}:${path}`;

  if (lastLoadedKey.value === key && imageUrl.value) {
    return;
  }

  loading.value = true;
  failed.value = false;

  // ACT: 针对后端刚生成文件的时延窗口，自动重试最多 4 次（间隔 400ms, 800ms, 1200ms, 2000ms）
  const retryDelays = [400, 800, 1200, 2000];
  let attempt = 0;

  while (token === activeToken) {
    try {
      const preview = useWorkspaceFiles(directory).acquireUrl(path);
      cleanupRelease?.();
      cleanupRelease = preview.release;
      const resolvedUrl = await preview.url;
      if (token !== activeToken) return;
      imageUrl.value = resolvedUrl;
      lastLoadedKey.value = key;
      failed.value = false;
      loading.value = false;
      return;
    } catch {
      if (token !== activeToken) return;
      if (attempt < retryDelays.length) {
        const delay = retryDelays[attempt++]!;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        failed.value = true;
        loading.value = false;
        return;
      }
    }
  }
}

watch(
  () => [effectiveDirectory.value, rawUrl.value] as const,
  ([directory, url]) => {
    void fetchImage(directory, url);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  activeToken++;
  cleanupRelease?.();
  cleanupRelease = undefined;
});
</script>

<style scoped lang="scss">
.markdownImageWrapper {
  display: inline-block;
  max-width: 100%;
  margin: 8px 0;
  vertical-align: middle;

  .markdownImageLoading,
  .markdownImageFailed {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid var(--uiBorderDefault);
    border-radius: var(--uiRadiusControl);
    background: var(--uiBackgroundSubtle);
    color: var(--uiTextMuted);
    font-size: 13px;

    .isLoading {
      animation: spin 1s linear infinite;
    }
  }

  .markdownImageFailed {
    color: var(--uiTextSecondary);
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;

    &:hover {
      background: var(--uiBackgroundSurface);
      border-color: var(--uiActionPrimary);
      color: var(--uiActionPrimary);
    }
  }

  .markdownImageFigure {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    margin: 0;
    max-width: 100%;

    .markdownImageFrame {
      position: relative;
      display: inline-block;
      max-width: 100%;
      cursor: pointer;
      border-radius: var(--uiRadiusControl);
      overflow: hidden;
      border: 1px solid var(--uiBorderDefault);
      background: var(--uiBackgroundCanvas);

      .markdownImage {
        display: block;
        max-width: 100%;
        max-height: 520px;
        height: auto;
        object-fit: contain;
        transition: transform 0.2s ease;
      }

      .imageOverlay {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.25);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.15s ease;
      }

      &:hover {
        .imageOverlay {
          opacity: 1;
        }
        .markdownImage {
          transform: scale(1.02);
        }
      }
    }

    .markdownImageCaption {
      margin-top: 6px;
      font-size: 12px;
      color: var(--uiTextMuted);
      text-align: center;
      line-height: 1.4;
    }
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>

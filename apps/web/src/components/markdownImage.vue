<template>
  <div class="markdownImageWrapper">
    <div v-if="failed" class="markdownImageFailed" role="img" aria-label="图片加载失败">
      <icon-photo-off :size="18" />
      <span>图片加载失败</span>
    </div>
    <div v-else-if="loading && !imageUrl" class="markdownImageLoading" role="status" aria-label="正在加载图片">
      <icon-loader-2 class="isLoading" :size="18" />
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
import { IconLoader2, IconPhotoOff, IconZoomIn } from "@tabler/icons-vue";
import { uiImageViewer } from "@omnistudio-next/ui";
import type { ImageNodeRendererProps } from "vue-stream-markdown";
import useWorkspaceFiles from "@/lib/workspaceFiles";

const props = defineProps<{ image: ImageNodeRendererProps; directory: string }>();

const imageUrl = ref("");
const loading = ref(false);
const failed = ref(false);
const viewerVisible = ref(false);
const lastLoadedKey = ref("");

let cleanupRelease: (() => void) | undefined;

const rawUrl = computed(() => props.image.node.url?.trim().replace(/^<|>$/g, "") ?? "");
const alt = computed(() => String(props.image.node.alt ?? ""));
const title = computed(() => String(props.image.node.title ?? ""));

const isExternal = computed(() => /^(?:[a-z][a-z\d+.-]*:|\/\/|data:|blob:)/i.test(rawUrl.value));

function handleImgError() {
  failed.value = true;
}

watch(
  () => [props.directory, rawUrl.value] as const,
  async ([directory, url], _prev, onCleanup) => {
    if (!url) {
      imageUrl.value = "";
      return;
    }

    if (isExternal.value) {
      imageUrl.value = url;
      failed.value = false;
      loading.value = false;
      return;
    }

    if (!directory) {
      imageUrl.value = "";
      return;
    }

    const rawPath = url.split(/[?#]/, 1)[0]!;
    const path = decodeURIComponent(rawPath).replaceAll("\\", "/");
    const key = `${directory}:${path}`;

    if (lastLoadedKey.value === key && imageUrl.value) {
      return;
    }

    let cancelled = false;
    let release = () => {};

    onCleanup(() => {
      cancelled = true;
      release();
    });

    loading.value = true;
    failed.value = false;

    try {
      const preview = useWorkspaceFiles(directory).acquireUrl(path);
      release = preview.release;
      cleanupRelease = preview.release;
      const resolvedUrl = await preview.url;
      if (!cancelled) {
        imageUrl.value = resolvedUrl;
        lastLoadedKey.value = key;
      }
    } catch {
      if (!cancelled) {
        failed.value = true;
      }
    } finally {
      if (!cancelled) {
        loading.value = false;
      }
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
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
    padding: 12px 16px;
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

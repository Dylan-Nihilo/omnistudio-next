<template>
  <div class="thumbnailItem">
    <button v-if="attachment.mimeType.startsWith('image/')" class="thumbnailButton" type="button" :title="attachment.name" :aria-label="`预览 ${attachment.name}`" :disabled="!thumbnailUrl" @click="imagePreviewVisible = true">
      <uiImage class="thumbnailImage" :src="thumbnailUrl" fit="cover" :alt="attachment.name"><template #error><icon-photo :size="20" /></template></uiImage>
    </button>
    <button v-else class="thumbnailButton" type="button" :title="attachment.name" :aria-label="`预览 ${attachment.name}`" :disabled="!thumbnailUrl" @click="videoPreviewVisible = true">
      <video v-if="thumbnailUrl" :src="thumbnailUrl" preload="metadata" muted playsinline aria-hidden="true" />
      <icon-video class="videoIcon" :size="16" />
    </button>
    <uiIconButton v-if="removable" class="removeAttachment" size="small" :icon="IconX" :label="`移除 ${attachment.name}`" title="移除附件" @click="emit('remove')" />
    <uiImageViewer v-model="imagePreviewVisible" :urls="thumbnailUrl ? [thumbnailUrl] : []" :title="attachment.name" />
    <uiDialog v-model="videoPreviewVisible" :title="attachment.name" width="min(800px, 90vw)" destroyOnClose><uiMediaPlayer v-if="videoPreviewVisible" :src="thumbnailUrl" kind="video" :label="attachment.name" /></uiDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { uiDialog, uiIconButton, uiImage, uiImageViewer, uiMediaPlayer } from "@toonflow/ui";
import { IconPhoto, IconVideo, IconX } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { AgentAttachment } from "./types";

const props = defineProps<{ attachment: AgentAttachment; directory?: string; removable?: boolean }>();
const emit = defineEmits<{ remove: [] }>();
const imagePreviewVisible = ref(false);
const videoPreviewVisible = ref(false);
const thumbnailUrl = ref("");

watch(() => [props.directory, props.attachment.file, props.attachment.path, props.attachment.mimeType] as const, async ([directory, file, path, mimeType], _previous, onCleanup) => {
  videoPreviewVisible.value = false;
  imagePreviewVisible.value = false;
  thumbnailUrl.value = "";
  let cancelled = false;
  let release = () => {};
  onCleanup(() => { cancelled = true; release(); });
  try {
    if (file) {
      const url = URL.createObjectURL(file);
      release = () => URL.revokeObjectURL(url);
      thumbnailUrl.value = url;
    } else if (directory) {
      const preview = useWorkspaceFiles(directory).acquireUrl(path, mimeType);
      release = preview.release;
      const url = await preview.url;
      if (!cancelled) thumbnailUrl.value = url;
    }
  } catch {
    if (!cancelled) thumbnailUrl.value = "";
  }
}, { immediate: true });
</script>

<style scoped lang="scss">
.thumbnailItem {
  position: relative;
  flex-shrink: 0;
  width: 38px;
  height: 38px;

  .thumbnailButton,
  .thumbnailImage {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--uiBorderDefault);
    border-radius: 10px;
    background: transparent;
    color: var(--uiTextMuted);
    cursor: pointer;

    .uiImage,
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }


    .videoIcon {
      position: absolute;
      right: 3px;
      bottom: 3px;
      color: white;
      filter: drop-shadow(0 1px 2px rgb(0 0 0 / 80%));
    }
  }

  .removeAttachment {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 22px;
    height: 22px;
    margin: 0;
    padding: 0;
    opacity: 0;
    pointer-events: none;
  }

  &:hover .removeAttachment,
  &:focus-within .removeAttachment {
    opacity: 1;
    pointer-events: auto;
  }

}

.videoPreview {
  display: block;
  width: 100%;
  max-height: 70vh;
}
</style>

<template>
  <span ref="thumbnailHost" class="productionMediaThumbnail" role="img" :aria-label="label" :title="failed ? '缩略图不可用' : label" :aria-busy="loading">
    <img v-if="thumbnailUrl" :key="thumbnailUrl" :src="thumbnailUrl" alt="" loading="lazy" @error="markUnavailable" />
    <span v-else class="thumbnailPlaceholder" aria-hidden="true">
      <icon-music v-if="mediaKind === 'audio'" :size="24" />
      <icon-photo-off v-else-if="failed" :size="24" />
      <icon-movie v-else-if="mediaKind === 'video'" :size="24" />
      <icon-photo v-else :size="24" />
    </span>
    <span v-if="mediaKind === 'video' && thumbnailUrl" class="thumbnailPlay" aria-hidden="true"><icon-player-play :size="15" /></span>
  </span>
</template>

<script lang="ts">
import { createTimelineThumbnailGenerator } from "@/pages/videoEditor/editorThumbnails";

let sharedGenerator: ReturnType<typeof createTimelineThumbnailGenerator> | undefined;
let thumbnailUsers = 0;

function acquireThumbnailGenerator() {
  thumbnailUsers++;
  return sharedGenerator ??= createTimelineThumbnailGenerator();
}

function releaseThumbnailGenerator() {
  if (--thumbnailUsers) return;
  sharedGenerator?.dispose();
  sharedGenerator = undefined;
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { IconMovie, IconMusic, IconPhoto, IconPhotoOff, IconPlayerPlay } from "@tabler/icons-vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";

const props = defineProps<{ directory: string; filePath: string; mimeType: string; label: string }>();
const thumbnailHost = ref<HTMLElement>();
const thumbnailUrl = ref("");
const visible = ref(false);
const loading = ref(false);
const failed = ref(false);
const generator = acquireThumbnailGenerator();
let observer: IntersectionObserver | undefined;
const mediaKind = computed(() => props.mimeType.startsWith("video/") ? "video" : props.mimeType.startsWith("audio/") ? "audio" : "image");

onMounted(() => {
  if (!thumbnailHost.value) return;
  observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    visible.value = true;
    observer?.disconnect();
  }, { rootMargin: "120px 0px" });
  observer.observe(thumbnailHost.value);
});

watch(() => [visible.value, props.directory, props.filePath, props.mimeType] as const, async ([isVisible, directory, filePath, mimeType], _previous, onCleanup) => {
  thumbnailUrl.value = "";
  failed.value = false;
  loading.value = false;
  if (!isVisible || !directory || !filePath || mimeType.startsWith("audio/")) return;
  const controller = new AbortController();
  let release: (() => void) | undefined;
  onCleanup(() => { controller.abort(); release?.(); });
  loading.value = true;
  try {
    const preview = useWorkspaceFiles(directory).acquireUrl(filePath, mimeType);
    release = preview.release;
    const url = await preview.url;
    if (controller.signal.aborted) return;
    const frame = mimeType.startsWith("video/") ? await generator.getFrame(url, 0, controller.signal) : url;
    if (!controller.signal.aborted) thumbnailUrl.value = frame;
  } catch {
    if (!controller.signal.aborted) failed.value = true;
  } finally {
    if (mimeType.startsWith("video/")) { release?.(); release = undefined; }
    if (!controller.signal.aborted) loading.value = false;
  }
}, { immediate: true });

function markUnavailable(event: Event) {
  if (!(event.target instanceof HTMLImageElement) || event.target.src !== thumbnailUrl.value) return;
  thumbnailUrl.value = "";
  failed.value = true;
  loading.value = false;
}
onBeforeUnmount(() => { observer?.disconnect(); releaseThumbnailGenerator(); });
</script>

<style scoped lang="scss">
.productionMediaThumbnail {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: inherit;
  color: var(--uiTextMuted);
  background: var(--uiBackgroundSubtle);

  > img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .thumbnailPlaceholder { display: grid; width: 100%; height: 100%; place-items: center; }
  .thumbnailPlay { position: absolute; right: 7px; bottom: 7px; display: grid; width: 25px; height: 25px; place-items: center; border: 1px solid #ffffff38; border-radius: 50%; color: #fff; background: #0009; }
}
</style>

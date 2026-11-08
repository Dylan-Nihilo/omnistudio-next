<template>
  <span class="editorFilmstrip" aria-hidden="true">
    <span v-for="frame in frames" :key="frame.index" class="filmstripFrame" :style="{ left: `${frame.index * frameWidth}px`, width: `${frameWidth}px` }">
      <img :src="frame.url" alt="" draggable="false" />
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import type { createTimelineThumbnailGenerator } from "./editorThumbnails";

const props = defineProps<{
  source?: string;
  kind: "video" | "image";
  inPoint: number;
  outPoint: number;
  speed: number;
  start: number;
  zoom: number;
  frameRate: number;
  viewportLeft: number;
  viewportWidth: number;
  generator: ReturnType<typeof createTimelineThumbnailGenerator>;
}>();
const frameWidth = 64;
const frames = shallowRef<{ index: number; url: string }[]>([]);
const visibleFrames = computed(() => {
  const width = (props.outPoint - props.inPoint) / props.speed * props.zoom;
  const left = props.start * props.zoom;
  const first = Math.max(0, Math.floor((props.viewportLeft - left) / frameWidth) - 1);
  const last = Math.min(Math.ceil(width / frameWidth) - 1, Math.ceil((props.viewportLeft + props.viewportWidth - left) / frameWidth));
  return { first, last };
});

watch(() => [props.source, props.kind, props.inPoint, props.outPoint, props.speed, props.zoom, props.frameRate, props.generator, visibleFrames.value.first, visibleFrames.value.last], (_value, _previous, onCleanup) => {
  const controller = new AbortController();
  const source = props.source;
  const kind = props.kind;
  const { first, last } = visibleFrames.value;
  const inPoint = props.inPoint;
  const outPoint = props.outPoint;
  const speed = props.speed;
  const zoom = props.zoom;
  const frameRate = props.frameRate;
  const generator = props.generator;
  frames.value = [];
  const timer = setTimeout(async () => {
    if (!source || first > last) return;
    if (kind === "image") {
      frames.value = Array.from({ length: last - first + 1 }, (_, offset) => ({ index: first + offset, url: source }));
      return;
    }
    try {
      for (let index = first; index <= last; index++) {
        controller.signal.throwIfAborted();
        const time = Math.min(outPoint - 0.001, inPoint + index * frameWidth / zoom * speed);
        const sampleTime = Math.max(inPoint, Math.floor(time * frameRate) / frameRate);
        const url = await generator.getFrame(source, sampleTime, controller.signal);
        if (controller.signal.aborted) return;
        frames.value = [...frames.value, { index, url }];
      }
    } catch {
      // ACT: 缩略图失败保留片段名称，播放和导出继续使用原始媒体。
    }
  }, 140);
  onCleanup(() => { clearTimeout(timer); controller.abort(); });
}, { immediate: true });

onBeforeUnmount(() => { frames.value = []; });
</script>

<style scoped lang="scss">
.editorFilmstrip {
  position: absolute;
  inset: 19px 0 0;
  overflow: hidden;
  pointer-events: none;
  .filmstripFrame {
    position: absolute;
    top: 0;
    height: 100%;
    overflow: hidden;
    border-right: 1px solid rgb(0 0 0 / 16%);
    background: #17221b;
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
  }
}
</style>

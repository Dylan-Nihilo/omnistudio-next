<template>
  <span class="editorFilmstrip" aria-hidden="true">
    <span v-for="frame in frames" :key="frame.index" class="filmstripFrame" :style="frameStyle(frame)">
      <img v-if="frame.spriteIndex === undefined" :src="frame.url" alt="" draggable="false" />
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
  thumbnailSprite?: { url: string; width: number; height: number; columns: number; rows: number; count: number; step: number; padding: number; margin: number };
  viewportLeft: number;
  viewportWidth: number;
  generator: ReturnType<typeof createTimelineThumbnailGenerator>;
}>();
const frameWidth = 64;
const frames = shallowRef<{ index: number; url: string; spriteIndex?: number }[]>([]);
const visibleFrames = computed(() => {
  const width = (props.outPoint - props.inPoint) / props.speed * props.zoom;
  const left = props.start * props.zoom;
  const first = Math.max(0, Math.floor((props.viewportLeft - left) / frameWidth) - 1);
  const last = Math.min(Math.ceil(width / frameWidth) - 1, Math.ceil((props.viewportLeft + props.viewportWidth - left) / frameWidth));
  return { first, last };
});

function frameStyle(frame: { index: number; url: string; spriteIndex?: number }) {
  const style: Record<string, string> = { left: `${frame.index * frameWidth}px`, width: `${frameWidth}px` };
  const sprite = props.thumbnailSprite;
  if (frame.spriteIndex === undefined || !sprite) return style;
  const column = frame.spriteIndex % sprite.columns;
  const row = Math.floor(frame.spriteIndex / sprite.columns);
  const scale = frameWidth / sprite.width;
  const imageWidth = sprite.columns * sprite.width + (sprite.columns - 1) * sprite.padding + sprite.margin * 2;
  const imageHeight = sprite.rows * sprite.height + (sprite.rows - 1) * sprite.padding + sprite.margin * 2;
  style.backgroundImage = `url("${sprite.url}")`;
  style.backgroundSize = `${imageWidth * scale}px ${imageHeight * scale}px`;
  style.backgroundPosition = `-${(sprite.margin + column * (sprite.width + sprite.padding)) * scale}px -${(sprite.margin + row * (sprite.height + sprite.padding)) * scale}px`;
  return style;
}

watch(() => [props.source, props.kind, props.inPoint, props.outPoint, props.speed, props.zoom, props.frameRate, props.generator, props.thumbnailSprite, visibleFrames.value.first, visibleFrames.value.last], (_value, _previous, onCleanup) => {
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
  const thumbnailSprite = props.thumbnailSprite;
  frames.value = [];
  const timer = setTimeout(async () => {
    if (!source || first > last) return;
    if (kind === "image") {
      frames.value = Array.from({ length: last - first + 1 }, (_, offset) => ({ index: first + offset, url: source }));
      return;
    }
    if (thumbnailSprite) {
      frames.value = Array.from({ length: last - first + 1 }, (_, offset) => {
        const index = first + offset;
        const time = Math.min(outPoint - 0.001, inPoint + index * frameWidth / zoom * speed);
        const sampleTime = Math.max(inPoint, Math.floor(time * frameRate) / frameRate);
        return { index, url: thumbnailSprite.url, spriteIndex: Math.min(thumbnailSprite.count - 1, Math.floor(sampleTime / thumbnailSprite.step)) };
      });
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
    background-repeat: no-repeat;
    img { display: block; width: 100%; height: 100%; object-fit: cover; }
  }
}
</style>

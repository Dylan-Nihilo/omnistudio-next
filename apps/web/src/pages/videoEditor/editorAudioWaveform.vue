<template>
  <canvas ref="canvasElement" class="editorAudioWaveform" :style="canvasStyle" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  peaks: number[];
  duration: number;
  inPoint: number;
  outPoint: number;
  speed: number;
  start: number;
  zoom: number;
  viewportLeft: number;
  viewportWidth: number;
}>();
const canvasElement = ref<HTMLCanvasElement>();
const clipDuration = computed(() => (props.outPoint - props.inPoint) / props.speed);
const visibleBounds = computed(() => {
  const clipLeft = props.start * props.zoom;
  const left = Math.max(0, props.viewportLeft - clipLeft);
  const right = Math.min(clipDuration.value * props.zoom, props.viewportLeft + props.viewportWidth - clipLeft);
  return { left, width: Math.max(0, right - left), start: left / props.zoom, duration: Math.max(0, right - left) / props.zoom };
});
const canvasStyle = computed(() => ({ left: `${visibleBounds.value.left}px`, width: `${visibleBounds.value.width}px` }));
let resizeObserver: ResizeObserver | undefined;

function drawWaveform() {
  const canvas = canvasElement.value;
  const bounds = visibleBounds.value;
  const width = canvas?.getBoundingClientRect().width ?? 0;
  const height = canvas?.getBoundingClientRect().height ?? 0;
  if (!canvas || !bounds.width || !width || !height || !props.duration || !props.peaks.length) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(239, 211, 145, .78)";
  const barCount = Math.ceil(width / 2.5);
  const barWidth = Math.max(1, width / barCount * .6);
  for (let index = 0; index < barCount; index++) {
    const x = (index + .5) * width / barCount;
    const localTime = bounds.start + (index + .5) / barCount * bounds.duration;
    const sourceTime = Math.min(props.outPoint, props.inPoint + localTime * props.speed);
    const peakIndex = Math.min(props.peaks.length - 1, Math.floor(sourceTime / props.duration * props.peaks.length));
    const amplitude = Math.min(1, Math.max(0, props.peaks[peakIndex] ?? 0));
    const barHeight = Math.max(1, amplitude * (height - 6));
    context.fillRect(x, (height - barHeight) / 2, barWidth, barHeight);
  }
}

watch(() => [props.peaks, props.duration, props.inPoint, props.outPoint, props.speed, props.start, props.zoom, props.viewportLeft, props.viewportWidth], drawWaveform, { flush: "post" });
onMounted(() => {
  if (!canvasElement.value) return;
  resizeObserver = new ResizeObserver(drawWaveform);
  resizeObserver.observe(canvasElement.value);
  drawWaveform();
});
onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style scoped lang="scss">
.editorAudioWaveform {
  position: absolute;
  top: 0;
  z-index: 0;
  height: 100%;
  pointer-events: none;
}
</style>

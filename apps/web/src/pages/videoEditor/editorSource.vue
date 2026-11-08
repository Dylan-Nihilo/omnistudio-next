<template>
  <section class="sourceMonitor" tabindex="0" aria-label="素材源监视器，I 标记入点，O 标记出点" @keydown="onKeydown">
    <header class="sourceHeader"><span class="sourceLabel">源素材 <small>{{ mediaLabel }}</small></span><strong :title="asset?.name">{{ asset?.name }}</strong></header>
    <div class="sourceStage">
      <video v-if="asset?.kind === 'video' && url" :key="url" ref="mediaElement" :src="url" playsinline preload="metadata" @loadedmetadata="onLoaded" @timeupdate="syncTime" @ended="stopPlayback" @error="mediaFailed"></video>
      <img v-else-if="asset?.kind === 'image' && url" :key="url" :src="url" :alt="asset.name" @error="mediaFailed" />
      <template v-else-if="asset?.kind === 'audio' && url"><audio :key="url" ref="mediaElement" :src="url" preload="metadata" @loadedmetadata="onLoaded" @timeupdate="syncTime" @ended="stopPlayback" @error="mediaFailed"></audio><div class="audioSource"><icon-music :size="34" /><span>音频素材</span></div></template>
      <p v-if="!url" class="sourceUnavailable" role="status">素材缺失，请重新链接</p>
      <p v-else-if="sourceError" class="sourceUnavailable" role="alert">{{ sourceError }}</p>
    </div>
    <div class="sourceTransport">
      <button type="button" :disabled="!canUse" :aria-label="isPlaying ? '暂停源素材' : '播放源素材选区'" @click="togglePlayback"><icon-player-pause v-if="isPlaying" :size="18" /><icon-player-play v-else :size="18" /></button>
      <button type="button" :disabled="!canUse" aria-label="源素材上一帧" title="上一帧 ←" @click="stepFrame(-1)"><icon-player-track-prev :size="15" /></button>
      <button type="button" :disabled="!canUse" aria-label="源素材下一帧" title="下一帧 →" @click="stepFrame(1)"><icon-player-track-next :size="15" /></button>
      <input type="range" min="0" :max="sourceDuration" :step="1 / fps" :value="currentTime" :disabled="!canUse" aria-label="源素材播放位置" @input="seekFromRange" />
      <output>{{ formatTimecode(currentTime) }}</output>
    </div>
    <div class="sourceSelection">
      <div class="selectionBar" aria-hidden="true"><span :style="{ left: `${inPoint / sourceDuration * 100}%`, width: `${(outPoint - inPoint) / sourceDuration * 100}%` }"></span></div>
      <div class="pointFields">
        <label>入点 <input type="number" min="0" :max="outPoint - minimumDuration" :step="1 / fps" :value="roundNumber(inPoint)" :disabled="!canUse" aria-label="源素材入点秒数" @input="changePoint('in', $event)" @change="validatePoint('in', $event)" /></label>
        <label>出点 <input type="number" :min="inPoint + minimumDuration" :max="sourceDuration" :step="1 / fps" :value="roundNumber(outPoint)" :disabled="!canUse" aria-label="源素材出点秒数" @input="changePoint('out', $event)" @change="validatePoint('out', $event)" /></label>
        <span class="selectionDuration">选区 <strong>{{ formatTimecode(outPoint - inPoint) }}</strong></span>
      </div>
      <div class="markActions">
        <button type="button" :disabled="!canUse" title="I" @click="markIn">标记入点 <kbd>I</kbd></button><button type="button" :disabled="!canUse" title="O · 包含当前帧" @click="markOut">标记出点 <kbd>O</kbd></button>
        <button type="button" :disabled="!canUse" aria-label="源素材跳转入点" @click="seekTo(inPoint)">到入点</button><button type="button" :disabled="!canUse" aria-label="源素材跳转出点前一帧" @click="seekTo(Math.max(inPoint, outPoint - minimumDuration))">到出点</button><button type="button" :disabled="!canUse" @click="clearSelection">清除</button>
      </div>
    </div>
    <footer class="sourceFooter"><span>点击监视器后使用 I / O · ← / → · 空格</span><button class="insertButton" type="button" :disabled="!canInsert" @click="insertSelection">加入选区</button></footer>
    <p v-if="selectionError" class="selectionError" role="alert">{{ selectionError }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { IconMusic, IconPlayerPause, IconPlayerPlay, IconPlayerTrackNext, IconPlayerTrackPrev } from "@tabler/icons-vue";
import type { EditorAsset } from "./editorModel";

const props = defineProps<{ asset?: EditorAsset; url?: string; frameRate: number; disabled?: boolean }>();
const emit = defineEmits<{ insert: [selection: { asset: EditorAsset; inPoint: number; outPoint: number }] }>();
const mediaElement = ref<HTMLMediaElement>();
const currentTime = ref(0);
const inPoint = ref(0);
const outPoint = ref(5);
const isPlaying = ref(false);
const sourceError = ref("");
const selectionError = ref("");
const fps = computed(() => Number.isFinite(props.frameRate) && props.frameRate > 0 ? props.frameRate : 30);
const sourceDuration = computed(() => props.asset?.kind === "image" ? 5 : Math.max(0, Math.floor((props.asset?.duration ?? 0) * fps.value + .000001) / fps.value));
const minimumDuration = computed(() => Math.min(1 / fps.value, sourceDuration.value));
const mediaLabel = computed(() => props.asset?.kind === "audio" ? "音频" : props.asset?.kind === "image" ? "图片" : "视频");
const canUse = computed(() => !!props.asset && !!props.url && !props.disabled && !sourceError.value && sourceDuration.value > 0);
const canInsert = computed(() => canUse.value && !selectionError.value && outPoint.value - inPoint.value >= minimumDuration.value - .000001);
let animationFrame: number | undefined;
let playbackTimestamp = 0;
let sourceVersion = 0;

watch([() => props.asset?.id, () => props.asset?.path, () => props.url, () => props.asset?.duration, () => props.frameRate], () => {
  sourceVersion++;
  stopPlayback();
  currentTime.value = 0;
  inPoint.value = 0;
  outPoint.value = sourceDuration.value;
  sourceError.value = "";
  selectionError.value = "";
}, { immediate: true });
watch(() => props.disabled, disabled => { if (disabled) stopPlayback(); });
onBeforeUnmount(() => { sourceVersion++; stopPlayback(); });

function roundNumber(value: number): number { return Math.round(value * 1000000) / 1000000; }
function frameTime(value: number): number { return Math.max(0, Math.min(sourceDuration.value, Math.round(value * fps.value) / fps.value)); }
function formatTimecode(value: number): string {
  const frames = Math.max(0, Math.round(value * fps.value));
  const seconds = Math.floor(frames / fps.value);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frames % fps.value].map(part => String(part).padStart(2, "0")).join(":");
}
function stopPlayback() {
  isPlaying.value = false;
  if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
  mediaElement.value?.pause();
}
function setMediaTime(value: number) {
  const media = mediaElement.value;
  if (!media || media.readyState < 1) return;
  media.currentTime = Math.min(value, Math.max(0, media.duration - .000001));
}
function seekTo(value: number) {
  stopPlayback();
  if (!canUse.value) return;
  currentTime.value = frameTime(value);
  setMediaTime(currentTime.value);
}
function seekFromRange(event: Event) { seekTo(Number((event.currentTarget as HTMLInputElement).value)); }
function stepFrame(direction: number) { seekTo(currentTime.value + direction / fps.value); }
function onLoaded() { setMediaTime(currentTime.value); }
function syncTime() {
  const media = mediaElement.value;
  if (!media || !Number.isFinite(media.currentTime)) return;
  currentTime.value = Math.max(0, Math.min(sourceDuration.value, media.currentTime));
}
function playbackFrame(timestamp: number) {
  if (!isPlaying.value) return;
  if (props.asset?.kind === "image") currentTime.value = Math.min(outPoint.value, currentTime.value + (timestamp - playbackTimestamp) / 1000);
  else syncTime();
  playbackTimestamp = timestamp;
  if (currentTime.value >= outPoint.value - .000001) {
    stopPlayback();
    currentTime.value = outPoint.value;
    setMediaTime(outPoint.value);
    return;
  }
  animationFrame = requestAnimationFrame(playbackFrame);
}
async function togglePlayback() {
  if (isPlaying.value) { stopPlayback(); return; }
  if (!canUse.value) return;
  selectionError.value = "";
  if (currentTime.value < inPoint.value || currentTime.value >= outPoint.value - .000001) seekTo(inPoint.value);
  const version = sourceVersion;
  const media = mediaElement.value;
  try {
    if (props.asset?.kind !== "image") {
      if (!media) return;
      await media.play();
    }
    if (version !== sourceVersion || !canUse.value) { media?.pause(); return; }
    isPlaying.value = true;
    playbackTimestamp = performance.now();
    animationFrame = requestAnimationFrame(playbackFrame);
  } catch { selectionError.value = "无法播放素材，请确认媒体格式受浏览器支持后重试。"; }
}
function markIn() {
  if (!canUse.value) return;
  const point = frameTime(currentTime.value);
  if (outPoint.value - point < minimumDuration.value - .000001) { selectionError.value = "入点须至少早于出点一帧。"; return; }
  inPoint.value = point;
  selectionError.value = "";
}
function markOut() {
  if (!canUse.value) return;
  const point = Math.min(sourceDuration.value, frameTime(currentTime.value) + minimumDuration.value);
  if (point - inPoint.value < minimumDuration.value - .000001) { selectionError.value = "出点须至少晚于入点一帧。"; return; }
  outPoint.value = point;
  selectionError.value = "";
}
function changePoint(edge: "in" | "out", event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const value = input.value.trim() ? Number(input.value) : NaN;
  const point = frameTime(value);
  if (!canUse.value || !Number.isFinite(value) || value < 0 || value > sourceDuration.value || (edge === "in" ? outPoint.value - point : point - inPoint.value) < minimumDuration.value - .000001) {
    selectionError.value = "入出点须位于素材范围内，选区至少保留一帧。";
    return;
  }
  stopPlayback();
  if (edge === "in") inPoint.value = point;
  else outPoint.value = point;
  input.value = String(roundNumber(point));
  selectionError.value = "";
}
function validatePoint(edge: "in" | "out", event: Event) {
  changePoint(edge, event);
  if (!selectionError.value) return;
  const input = event.currentTarget as HTMLInputElement;
  input.value = String(roundNumber(edge === "in" ? inPoint.value : outPoint.value));
}
function clearSelection() {
  if (!canUse.value) return;
  stopPlayback();
  inPoint.value = 0;
  outPoint.value = sourceDuration.value;
  selectionError.value = "";
}
function insertSelection() {
  if (!props.asset || !canInsert.value) return;
  stopPlayback();
  emit("insert", { asset: props.asset, inPoint: inPoint.value, outPoint: outPoint.value });
}
function mediaFailed() {
  stopPlayback();
  sourceError.value = "无法读取此素材，请重新链接或转换为浏览器支持的格式。";
}
function onKeydown(event: KeyboardEvent) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing || (event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
  const key = event.key.toLowerCase();
  if (!["i", "o", " ", "arrowleft", "arrowright"].includes(key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (key === "i") markIn();
  else if (key === "o") markOut();
  else if (key === " ") void togglePlayback();
  else stepFrame(key === "arrowleft" ? -1 : 1);
}
</script>

<style lang="scss" scoped>
.sourceMonitor {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  color: #b8c3ba;
  background: #151816;
  outline: none;
  &:focus-visible { box-shadow: inset 0 0 0 1px #7bb18d; }
  button, input { font: inherit; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 27px; padding: 0 7px; border: 1px solid #3c483e; border-radius: 3px; color: #b9c8bd; background: #252e27; font-size: 10px; cursor: pointer; &:hover:not(:disabled) { border-color: #709b7b; color: #e1f0e5; } &:disabled { opacity: .4; cursor: not-allowed; } &:focus-visible { outline: 2px solid #91caa3; outline-offset: 2px; } }
  .sourceHeader { display: flex; flex: 0 0 30px; align-items: center; gap: 10px; min-width: 0; padding: 0 2px; font-size: 11px;
    .sourceLabel { flex: 0 0 auto; color: #c6d6ca; small { margin-left: 5px; color: #7d8c81; font-size: 10px; } }
    strong { min-width: 0; overflow: hidden; color: #87968c; font-size: 10px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
  }
  .sourceStage { position: relative; display: flex; flex: 1 1 0; align-items: center; justify-content: center; min-height: 100px; margin: 4px 0 11px; overflow: hidden; border: 1px solid #303631; background: #080a09;
    video, img { display: block; width: 100%; height: 100%; min-height: 0; object-fit: contain; }
    audio { display: none; }
    .audioSource { display: flex; flex-direction: column; align-items: center; gap: 12px; color: #b5a77f; font-size: 11px; }
    .sourceUnavailable { position: absolute; inset: 0; display: grid; place-content: center; margin: 0; padding: 20px; color: #bba495; background: #111613; text-align: center; font-size: 11px; line-height: 1.6; }
  }
  .sourceTransport { display: flex; flex: 0 0 42px; align-items: center; gap: 5px; min-width: 0; padding: 0 7px; border: 1px solid #303631; border-radius: 4px; background: #202421;
    button { flex: 0 0 26px; width: 26px; padding: 0; border: 0; background: transparent; }
    input { flex: 1; min-width: 30px; accent-color: #79bd92; }
    output { flex: 0 0 auto; color: #aebbb1; font-size: 10px; font-variant-numeric: tabular-nums; }
  }
  .sourceSelection { flex: 0 0 auto; padding: 10px 0 0;
    .selectionBar { position: relative; height: 4px; overflow: hidden; border-radius: 2px; background: #2e3931; span { position: absolute; top: 0; height: 100%; min-width: 1px; background: #7ab68c; } }
    .pointFields { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 10px;
      label { display: flex; align-items: center; gap: 5px; color: #91a296; }
      input { width: 64px; min-width: 0; height: 27px; padding: 3px 4px; border: 1px solid #3a473d; border-radius: 3px; color: #d0dbd3; background: #1c241e; font-size: 10px; font-variant-numeric: tabular-nums; &:focus-visible { outline: 1px solid #91caa3; } }
      .selectionDuration { color: #829489; white-space: nowrap; strong { color: #b9cdbc; font-weight: 500; font-variant-numeric: tabular-nums; } }
    }
    .markActions { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; margin-top: 8px; kbd { color: #7eaa8c; font-family: inherit; font-size: 9px; } }
  }
  .sourceFooter { display: flex; flex: 0 0 auto; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; padding-top: 9px;
    > span { color: #74887a; font-size: 9px; }
    .insertButton { padding: 0 12px; border-color: #5d8c6a; color: #c8ead2; background: #294432; }
  }
  .selectionError { flex: 0 0 auto; margin: 7px 0 0; color: #e2ad95; font-size: 10px; line-height: 1.5; }
}
</style>

<template>
  <section class="sourceMonitor" tabindex="0" :aria-label="`素材源监视器 ${asset?.name || ''}，I 标记入点，O 标记出点`" @keydown="onKeydown">
    <div class="sourceStage" :title="asset?.name">
      <video v-if="asset?.kind === 'video' && url" :key="url" ref="mediaElement" :src="url" playsinline preload="metadata" @loadedmetadata="onLoaded" @timeupdate="syncTime" @ended="stopPlayback" @error="mediaFailed"></video>
      <img v-else-if="asset?.kind === 'image' && url" :key="url" :src="url" :alt="asset.name" @error="mediaFailed" />
      <template v-else-if="asset?.kind === 'audio' && url"><audio :key="url" ref="mediaElement" :src="url" preload="metadata" @loadedmetadata="onLoaded" @timeupdate="syncTime" @ended="stopPlayback" @error="mediaFailed"></audio><div class="audioSource"><icon-music :size="34" /><span>音频素材</span></div></template>
      <p v-if="!url" class="sourceUnavailable" role="status">素材缺失，请重新链接</p>
      <p v-else-if="sourceError" class="sourceUnavailable" role="alert">{{ sourceError }}</p>
      <p v-if="selectionError && !selectionOpen" class="selectionError" role="alert">{{ selectionError }}</p>
    </div>
    <div class="sourceTransport">
      <button type="button" :disabled="!canUse" :aria-label="isPlaying ? '暂停源素材' : '播放源素材选区'" @click="togglePlayback"><icon-player-pause v-if="isPlaying" :size="18" /><icon-player-play v-else :size="18" /></button>
      <button type="button" :disabled="!canUse" aria-label="源素材上一帧" title="上一帧 ←" @click="stepFrame(-1)"><icon-player-track-prev :size="15" /></button>
      <button type="button" :disabled="!canUse" aria-label="源素材下一帧" title="下一帧 →" @click="stepFrame(1)"><icon-player-track-next :size="15" /></button>
      <input type="range" min="0" :max="sourceDuration" :step="1 / fps" :value="currentTime" :disabled="!canUse" aria-label="源素材播放位置" @input="seekFromRange" />
      <output>{{ formatTimecode(currentTime) }}</output>
      <button type="button" :disabled="!canUse" aria-label="标记源素材入点" title="标记入点 I" @click="markIn">I</button><button type="button" :disabled="!canUse" aria-label="标记源素材出点" title="标记出点 O · 包含当前帧" @click="markOut">O</button>
      <button ref="selectionButton" class="selectionButton" type="button" :aria-controls="selectionId" :aria-expanded="selectionOpen" aria-haspopup="dialog" @click="selectionPopover?.togglePopover()">选区</button>
      <button class="insertButton" type="button" :disabled="!canInsert" @click="insertSelection">加入选区</button>
    </div>
    <div :id="selectionId" ref="selectionPopover" class="sourceSelection" popover="auto" role="dialog" aria-label="源素材选区" @toggle="onSelectionToggle" @keydown.stop>
      <header class="selectionHeader"><div><strong>源素材选区 <small>{{ mediaLabel }}</small></strong><span :title="asset?.name">{{ asset?.name }}</span></div><button type="button" aria-label="关闭源素材选区" @click="selectionPopover?.hidePopover()">×</button></header>
      <div class="selectionBar" aria-hidden="true"><span :style="{ left: `${sourceDuration ? inPoint / sourceDuration * 100 : 0}%`, width: `${sourceDuration ? (outPoint - inPoint) / sourceDuration * 100 : 0}%` }"></span></div>
      <div class="pointFields">
        <label>入点 <input type="number" min="0" :max="outPoint - minimumDuration" :step="1 / fps" :value="roundNumber(inPoint)" :disabled="!canUse" aria-label="源素材入点秒数" autofocus @input="changePoint('in', $event)" @change="validatePoint('in', $event)" /></label>
        <label>出点 <input type="number" :min="inPoint + minimumDuration" :max="sourceDuration" :step="1 / fps" :value="roundNumber(outPoint)" :disabled="!canUse" aria-label="源素材出点秒数" @input="changePoint('out', $event)" @change="validatePoint('out', $event)" /></label>
      </div>
      <p class="selectionDuration">选区时长 <strong>{{ formatTimecode(outPoint - inPoint) }}</strong></p>
      <div class="markActions">
        <button type="button" :disabled="!canUse" aria-label="源素材跳转入点" @click="seekTo(inPoint)">到入点</button><button type="button" :disabled="!canUse" aria-label="源素材跳转出点前一帧" @click="seekTo(Math.max(inPoint, outPoint - minimumDuration))">到出点</button><button type="button" :disabled="!canUse" @click="clearSelection">清除</button>
      </div>
      <p v-if="selectionError" class="selectionError" role="alert">{{ selectionError }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { IconMusic, IconPlayerPause, IconPlayerPlay, IconPlayerTrackNext, IconPlayerTrackPrev } from "@tabler/icons-vue";
import type { EditorAsset } from "./editorModel";

const props = defineProps<{ asset?: EditorAsset; url?: string; frameRate: number; disabled?: boolean; active: boolean }>();
const emit = defineEmits<{ insert: [selection: { asset: EditorAsset; inPoint: number; outPoint: number }] }>();
const mediaElement = ref<HTMLMediaElement>();
const selectionId = useId();
const selectionButton = ref<HTMLButtonElement>();
const selectionPopover = ref<HTMLDivElement>();
const selectionOpen = ref(false);
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
const canUse = computed(() => props.active && !!props.asset && !!props.url && !props.disabled && !sourceError.value && sourceDuration.value > 0);
const canInsert = computed(() => canUse.value && !selectionError.value && outPoint.value - inPoint.value >= minimumDuration.value - .000001);
let animationFrame: number | undefined;
let playbackTimestamp = 0;
let playbackVersion = 0;

watch([() => props.asset?.id, () => props.asset?.path, () => props.url, () => props.asset?.duration, () => props.frameRate], () => {
  stopPlayback();
  currentTime.value = 0;
  inPoint.value = 0;
  outPoint.value = sourceDuration.value;
  sourceError.value = "";
  selectionError.value = "";
}, { immediate: true });
watch(() => props.disabled, disabled => { if (disabled) stopPlayback(); });
watch(() => props.active, active => {
  if (active) return;
  stopPlayback();
  selectionPopover.value?.hidePopover();
}, { flush: "sync" });
onBeforeUnmount(stopPlayback);

function roundNumber(value: number): number { return Math.round(value * 1000000) / 1000000; }
function frameTime(value: number): number { return Math.max(0, Math.min(sourceDuration.value, Math.round(value * fps.value) / fps.value)); }
function formatTimecode(value: number): string {
  const frames = Math.max(0, Math.round(value * fps.value));
  const seconds = Math.floor(frames / fps.value);
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60, frames % fps.value].map(part => String(part).padStart(2, "0")).join(":");
}
function stopPlayback() {
  playbackVersion++;
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
  const media = mediaElement.value;
  if (props.asset?.kind !== "image" && !media) return;
  const version = ++playbackVersion;
  isPlaying.value = true;
  try {
    if (props.asset?.kind !== "image") await media!.play();
    if (version !== playbackVersion || !canUse.value) { if (media !== mediaElement.value || !isPlaying.value) media?.pause(); return; }
    playbackTimestamp = performance.now();
    animationFrame = requestAnimationFrame(playbackFrame);
  } catch {
    if (version !== playbackVersion || !canUse.value) return;
    stopPlayback();
    selectionError.value = "无法播放素材，请确认媒体格式受浏览器支持后重试。";
  }
}
function onSelectionToggle(event: Event) {
  const open = (event as ToggleEvent).newState === "open";
  selectionOpen.value = open;
  const focused = document.activeElement;
  if (!open && props.active && (focused === document.body || selectionPopover.value?.contains(focused))) selectionButton.value?.focus();
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
  if (!props.active || selectionOpen.value || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || (event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
  if ((event.target as HTMLElement).closest("button") && [" ", "Enter"].includes(event.key)) { event.stopPropagation(); return; }
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
  padding: 8px 8px 0;
  color: #b8c3ba;
  background: #151816;
  outline: none;
  &, * { box-sizing: border-box; }
  &:focus-visible { box-shadow: inset 0 0 0 1px #7bb18d; }
  button, input { font: inherit; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; min-height: 27px; padding: 0 7px; border: 1px solid #3c483e; border-radius: 3px; color: #b9c8bd; background: #252e27; font-size: 10px; cursor: pointer; &:hover:not(:disabled) { border-color: #709b7b; color: #e1f0e5; } &:disabled { opacity: .4; cursor: not-allowed; } &:focus-visible { outline: 2px solid #91caa3; outline-offset: 2px; } }
  .sourceStage { position: relative; display: flex; flex: 1 1 0; align-items: center; justify-content: center; min-height: 0; margin-bottom: 8px; overflow: hidden; border: 1px solid #303631; background: #080a09;
    video, img { display: block; width: 100%; height: 100%; min-height: 0; object-fit: contain; }
    audio { display: none; }
    .audioSource { display: flex; flex-direction: column; align-items: center; gap: 12px; color: #b5a77f; font-size: 11px; }
    .sourceUnavailable { position: absolute; inset: 0; display: grid; place-content: center; margin: 0; padding: 20px; color: #bba495; background: #111613; text-align: center; font-size: 11px; line-height: 1.6; }
    .selectionError { position: absolute; right: 8px; bottom: 8px; left: 8px; margin: 0; padding: 7px 9px; border: 1px solid #724a3b; border-radius: 4px; background: #3d2923; }
  }
  .sourceTransport { position: relative; display: flex; flex: 0 0 44px; align-items: center; gap: 3px; min-width: 0; padding: 7px 3px 0; border-top: 1px solid #303631; background: #202421;
    button { flex: 0 0 24px; width: 24px; padding: 0; border: 0; background: transparent; }
    input { position: absolute; top: -3px; right: 3px; left: 3px; width: calc(100% - 6px); height: 6px; margin: 0; accent-color: #79bd92; }
    output { flex: 1; min-width: 68px; color: #aebbb1; font-size: 10px; font-variant-numeric: tabular-nums; text-align: center; }
    .selectionButton { flex-basis: 36px; width: 36px; border: 1px solid #3c483e; }
    .insertButton { flex-basis: 60px; width: 60px; border: 1px solid #5d8c6a; color: #c8ead2; background: #294432; }
  }
  .sourceSelection { width: min(320px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 16px; overflow-y: auto; border: 1px solid #465148; border-radius: 7px; color: #b8c3ba; background: #202722; box-shadow: 0 12px 40px rgb(0 0 0 / 45%);
    .selectionHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 15px;
      > div { min-width: 0; }
      strong { display: block; color: #d2dfd6; font-size: 12px; font-weight: 600; small { margin-left: 5px; color: #8da094; font-size: 10px; font-weight: 400; } }
      span { display: block; overflow: hidden; margin-top: 5px; color: #87968c; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
      button { flex: 0 0 27px; padding: 0; font-size: 16px; }
    }
    .selectionBar { position: relative; height: 4px; overflow: hidden; border-radius: 2px; background: #2e3931; span { position: absolute; top: 0; height: 100%; min-width: 1px; background: #7ab68c; } }
    .pointFields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px; font-size: 11px;
      label { display: flex; flex-direction: column; gap: 6px; color: #91a296; }
      input { width: 100%; min-width: 0; height: 30px; padding: 3px 6px; border: 1px solid #3a473d; border-radius: 3px; color: #d0dbd3; background: #1c241e; font-size: 11px; font-variant-numeric: tabular-nums; &:focus-visible { outline: 1px solid #91caa3; } }
    }
    .selectionDuration { display: flex; justify-content: space-between; margin: 12px 0; color: #829489; font-size: 11px; strong { color: #b9cdbc; font-weight: 500; font-variant-numeric: tabular-nums; } }
    .markActions { display: flex; align-items: center; gap: 8px; button { flex: 1; } }
  }
  .selectionError { flex: 0 0 auto; margin: 7px 0 0; color: #e2ad95; font-size: 10px; line-height: 1.5; }
}
</style>

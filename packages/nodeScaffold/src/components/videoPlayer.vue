<template>
  <div class="videoPlayer">
    <video
      ref="video"
      class="videoPreview"
      :class="{ nodrag: fullscreen }"
      :src="src"
      :controls="fullscreen"
      playsinline
      preload="auto"
      draggable="false"
      :aria-label="label"
      @fullscreenchange="fullscreen = !!video?.matches(':fullscreen')"
      @loadedmetadata="readMetadata"
      @loadeddata="ready = true"
      @timeupdate="currentTime = video?.currentTime ?? 0"
      @play="playing = true"
      @pause="playing = false"
      @ended="playing = false"
      @volumechange="readVolume"
      @error="mediaError" />
    <div v-show="!fullscreen" class="playerControls nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <uiIconButton class="playButton" size="small" :icon="playing ? IconPlayerPause : IconPlayerPlay" :disabled="!ready" :label="playing ? '暂停视频' : '播放视频'" :title="playing ? '暂停' : '播放'" @click="togglePlayback" />
      <span class="currentTime">{{ formatTime(currentTime) }}</span>
      <uiSlider class="progressSlider" :modelValue="currentTime" :min="0" :max="duration || 1" :step="0.01" :disabled="!ready || !duration" :formatTooltip="formatTime" aria-label="视频播放进度" @input="seek" />
      <span class="durationLabel">{{ formatTime(duration) }}</span>
      <div class="volumeControl"><uiPopover trigger="hover" placement="top" :width="72" :showAfter="80" :hideAfter="150" :disabled="!ready"><template #reference><uiIconButton size="small" :icon="muted || !volume ? IconVolumeOff : IconVolume" :disabled="!ready" :aria-pressed="muted || !volume" :label="muted || !volume ? '取消静音' : '静音视频'" title="音量 · 点击切换静音" @click="toggleMute" /></template><div class="volumePanel nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop><span class="volumeValue">{{ muted ? 0 : volume }}%</span><uiSlider :modelValue="muted ? 0 : volume" vertical height="80px" :min="0" :max="100" :showTooltip="false" aria-label="视频音量" @input="setVolume" /></div></uiPopover></div>
      <uiDropdown class="captureMenu" v-model:visible="captureMenuVisible" :items="captureOptions" placement="top-end" :disabled="!ready || capturing" @command="value => { if (value === 'current' || value === 'first' || value === 'last') captureFrame(value); }"><template #reference="{ triggerAttrs }"><uiIconButton v-bind="triggerAttrs" size="small" :icon="IconPhotoScan" :loading="capturing" :disabled="!ready || capturing" label="截取视频帧" title="截取视频帧" /></template></uiDropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, onBeforeUnmount, ref, watch } from "vue";
import { useNode, useVueFlow } from "@vue-flow/core";
import { uiIconButton, uiSlider, uiPopover, uiDropdown, useUiFeedback } from "@omnistudio-next/ui";
import { IconPlayerPlay, IconPlayerPause, IconVolume, IconVolumeOff, IconPhotoScan, IconPlayerSkipBack, IconPlayerSkipForward } from "@tabler/icons-vue";
import { useNodeFiles } from "../workspaceFiles";

const feedback = useUiFeedback();
const captureOptions = [{ value: "current", label: "截取当前帧", icon: IconPhotoScan }, { value: "first", label: "截取首帧", icon: IconPlayerSkipBack }, { value: "last", label: "截取尾帧", icon: IconPlayerSkipForward }];
const { src, label = "节点视频" } = defineProps<{ src: string; label?: string }>();
const emit = defineEmits<{ loadedmetadata: [event: Event] }>();
const video = ref<HTMLVideoElement>();
const fullscreen = ref(false);
const ready = ref(false);
const playing = ref(false);
const muted = ref(false);
const volume = ref(100);
let lastVolume = 100;
const currentTime = ref(0);
const duration = ref(0);
const capturing = ref(false);
const captureMenuVisible = ref(false);
const { node } = useNode();
const { addNodes, findNode, getNodes, nodeTypes } = useVueFlow();
const files = useNodeFiles();
const getCanvas = inject<(() => { id: string } | undefined) | undefined>("canvas", undefined);
let captureController: AbortController | undefined;

watch(() => getCanvas?.()?.id, () => captureController?.abort(), { flush: "sync" });
watch(() => src, () => {
  captureController?.abort();
  ready.value = false;
  playing.value = false;
  currentTime.value = 0;
  duration.value = 0;
}, { flush: "sync" });
onBeforeUnmount(() => captureController?.abort());

async function enterFullscreen() {
  if (!video.value) return;
  fullscreen.value = true;
  try {
    await video.value.requestFullscreen();
  } catch {
    fullscreen.value = false;
    feedback.message({ tone: "error", message: "无法进入视频全屏" });
  }
}

defineExpose({ enterFullscreen });

function formatTime(value: number) {
  const seconds = Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function readMetadata(event: Event) {
  const value = video.value?.duration ?? 0;
  duration.value = Number.isFinite(value) ? value : 0;
  emit("loadedmetadata", event);
}

function mediaError() {
  ready.value = false;
  playing.value = false;
  feedback.message({ tone: "error", message: "无法预览该视频" });
}

async function togglePlayback() {
  if (!video.value) return;
  if (playing.value) video.value.pause();
  else {
    try { await video.value.play(); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) feedback.message({ tone: "error", message: "视频播放失败" }); }
  }
}

function seek(value: number | number[]) {
  if (!video.value || !Number.isFinite(value)) return;
  video.value.currentTime = Math.min(duration.value, Math.max(0, Number(value)));
  currentTime.value = video.value.currentTime;
}

function readVolume() {
  if (!video.value) return;
  volume.value = Math.round(video.value.volume * 100);
  muted.value = video.value.muted;
  if (volume.value > 0) lastVolume = volume.value;
}

function setVolume(value: number | number[]) {
  if (!video.value || typeof value !== "number" || !Number.isFinite(value)) return;
  video.value.volume = Math.min(100, Math.max(0, value)) / 100;
  video.value.muted = video.value.volume === 0;
  readVolume();
}

function toggleMute() {
  if (!video.value) return;
  const silent = video.value.muted || video.value.volume === 0;
  if (video.value.volume === 0) video.value.volume = lastVolume / 100;
  video.value.muted = !silent;
  readVolume();
}

function loadFrame(source: HTMLVideoElement, time: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("视频帧读取超时")), 15000);
    function finish(error?: unknown) {
      clearTimeout(timer);
      source.onloadeddata = null;
      source.onseeked = null;
      source.onerror = null;
      signal.removeEventListener("abort", abort);
      error ? reject(error) : resolve();
    }
    function abort() { finish(signal.reason); }
    source.onloadeddata = () => {
      if (time === 0) finish();
      else source.currentTime = time;
    };
    source.onseeked = () => finish();
    source.onerror = () => finish(new Error("无法读取视频帧"));
    signal.addEventListener("abort", abort, { once: true });
    source.src = src;
    source.load();
    if (signal.aborted) abort();
  });
}

async function captureFrame(command: "current" | "first" | "last") {
  if (!video.value || !ready.value || capturing.value) return;
  if (!nodeTypes?.value?.["remote-imageNode"]) return void feedback.message({ tone: "error", message: "请先启用图片节点插件" });
  capturing.value = true;
  const controller = captureController = new AbortController();
  const id = crypto.randomUUID();
  let frameVideo: HTMLVideoElement | undefined;
  let uploadStarted = false;
  let committed = false;
  let workspace: ReturnType<typeof files.getWorkspaceFiles> | undefined;
  try {
    let source = video.value;
    if (command !== "current") {
      frameVideo = document.createElement("video");
      frameVideo.muted = true;
      frameVideo.preload = "auto";
      // 用独立视频解码首尾帧，不改变播放器当前进度；尾帧定位到结束前。
      await loadFrame(frameVideo, command === "first" ? 0 : Math.max(0, duration.value - 0.001), controller.signal);
      source = frameVideo;
    }
    controller.signal.throwIfAborted();
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth;
    canvas.height = source.videoHeight;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("视频帧尚未就绪");
    context.drawImage(source, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("截图生成失败")), "image/png"));
    controller.signal.throwIfAborted();
    const frameLabel = { current: "当前帧", first: "首帧", last: "尾帧" }[command];
    const name = `${node.data.label || label} · ${frameLabel}`;
    if (findNode(node.id) !== node) throw new Error("画布节点已变化，请重新截帧");
    workspace = files.getWorkspaceFiles();
    uploadStarted = true;
    const path = await files.uploadFile(id, new File([blob], "frame.png", { type: "image/png" }));
    controller.signal.throwIfAborted();
    if (findNode(node.id) !== node || !nodeTypes?.value?.["remote-imageNode"]) throw new Error("画布节点已变化，请重新截帧");
    const x = node.computedPosition.x + node.dimensions.width + 40;
    let y = node.computedPosition.y;
    const width = 240 * canvas.width / canvas.height + 18;
    for (const other of [...getNodes.value].sort((a, b) => a.computedPosition.y - b.computedPosition.y)) {
      const position = other.computedPosition;
      if (position.x < x + width && position.x + other.dimensions.width > x && position.y < y + 300 && position.y + other.dimensions.height > y) y = position.y + other.dimensions.height + 24;
    }
    addNodes({ id, type: "remote-imageNode", position: { x, y }, data: { label: name, outputs: { image: { dataType: "IMAGE", value: { url: path, mimeType: "image/png" } } } } });
    committed = true;
    feedback.message({ tone: "success", message: "已截取为图片节点" });
  } catch (error) {
    if (!controller.signal.aborted) feedback.message({ tone: "error", message: error instanceof Error ? error.message : "截帧失败" });
  } finally {
    if (frameVideo) { frameVideo.removeAttribute("src"); frameVideo.load(); }
    if (uploadStarted && !committed) {
      await workspace!.remove(`assets/${id}`, true).catch(error => {
        if (error?.response?.data?.data?.code !== "ENOENT") feedback.message({ tone: "error", message: "截帧中断，临时图片清理失败" });
      });
    }
    capturing.value = false;
    captureController = undefined;
  }
}
</script>

<style scoped lang="scss">
.videoPlayer { position: relative; width: 100%; min-width: 180px; container-type: inline-size; border-radius: var(--uiRadiusControl); overflow: hidden; background: var(--uiBackgroundCanvas); cursor: grab; &:active { cursor: grabbing; } .videoPreview { display: block; width: 100%; max-height: 240px; object-fit: contain; pointer-events: none; &:fullscreen { height: 100%; max-height: none; background: #000; pointer-events: auto; cursor: default; } } .playerControls { display: grid; grid-template-columns: 32px auto minmax(0, 1fr) 32px 32px; grid-template-areas: "progress progress progress progress progress" "play current duration volume capture"; align-items: center; gap: 8px; padding: 12px; background: var(--uiBackgroundSubtle); border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextBody); cursor: default; .playButton { grid-area: play; } .volumeControl { grid-area: volume; } .captureMenu { grid-area: capture; } .currentTime, .durationLabel { white-space: nowrap; font-size: var(--uiFontControl); line-height: 1.5; font-variant-numeric: tabular-nums; } .currentTime { grid-area: current; } .durationLabel { grid-area: duration; color: var(--uiTextMuted); } .progressSlider { grid-area: progress; min-width: 0; width: 100%; } @container (min-width: 420px) { grid-template-columns: 32px auto minmax(32px, 1fr) auto 32px 32px; grid-template-areas: "play current progress duration volume capture"; } } }
.volumePanel { display: flex; flex-direction: column; align-items: center; gap: 12px; .volumeValue { color: var(--uiTextMuted); font-size: var(--uiFontControl); font-variant-numeric: tabular-nums; } }
</style>

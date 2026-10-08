<template>
  <div ref="root" class="uiMediaPlayer">
    <component :is="kind" ref="media" :src="src" :poster="kind === 'video' ? poster : undefined" preload="metadata" :aria-label="label" @play="playing = true" @pause="playing = false" @timeupdate="time = media?.currentTime ?? 0" @loadedmetadata="duration = Number.isFinite(media?.duration) ? media!.duration : 0; emit('loadedmetadata', $event)" @loadeddata="emit('loadeddata', $event)" @ended="playing = false; emit('ended')" @error="emit('error', $event)" />
    <div class="playerControls">
      <uiButton variant="secondary" :disabled="!src" @click="togglePlay">{{ playing ? '暂停' : '播放' }}</uiButton><span class="playerTime">{{ formatTime(time) }} / {{ formatTime(duration) }}</span>
      <uiSlider class="seekSlider" :modelValue="time" :max="duration || 1" :step="0.1" :disabled="!duration" :showTooltip="false" aria-label="播放位置" @input="seek" @change="seek" />
      <uiButton variant="ghost" :disabled="!src" @click="toggleMute">{{ muted ? '取消静音' : '静音' }}</uiButton>
      <uiSlider class="volumeSlider" v-model="volume" :max="1" :step="0.05" :showTooltip="false" aria-label="音量" @input="setVolume" @change="setVolume" />
      <select class="playbackSpeed" aria-label="播放速度" :value="speed" @change="setSpeed"><option v-for="value in [0.5, 1, 1.25, 1.5, 2]" :key="value" :value="value">{{ value }}×</option></select>
      <uiButton v-if="kind === 'video' && fullscreenEnabled" variant="ghost" :disabled="!src" @click="fullscreen">全屏</uiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import uiButton from "./uiButton.vue";
import uiSlider from "./uiSlider.vue";
const props = withDefaults(defineProps<{ src?: string; kind?: "video" | "audio"; poster?: string; label?: string }>(), { kind: "video" });
const emit = defineEmits<{ ended: []; error: [error: unknown]; loadedmetadata: [event: Event]; loadeddata: [event: Event] }>();
const root = ref<HTMLElement>(), media = ref<HTMLMediaElement>();
const playing = ref(false), muted = ref(false), fullscreenEnabled = ref(false);
const time = ref(0), duration = ref(0), volume = ref(1), speed = ref(1);
onMounted(() => { fullscreenEnabled.value = document.fullscreenEnabled; });
watch(() => props.src, () => { media.value?.pause(); time.value = 0; duration.value = 0; playing.value = false; }, { flush: "post" });
function formatTime(value: number) { const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0)); return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"); }
async function togglePlay() { if (!media.value || !props.src) return; try { if (media.value.paused) await media.value.play(); else media.value.pause(); } catch (error) { emit("error", error); } }
function seek(value: number) { if (media.value && Number.isFinite(value)) { media.value.currentTime = value; time.value = value; } }
function toggleMute() { muted.value = !muted.value; if (media.value) media.value.muted = muted.value; }
function setVolume(value: number) { if (media.value) media.value.volume = value; }
function setSpeed(event: Event) { speed.value = Number((event.target as HTMLSelectElement).value); if (media.value) media.value.playbackRate = speed.value; }
async function fullscreen() { try { if (document.fullscreenElement === root.value) await document.exitFullscreen(); else await root.value?.requestFullscreen(); } catch (error) { emit("error", error); } }
onBeforeUnmount(() => { media.value?.pause(); media.value?.removeAttribute("src"); media.value?.load(); });
defineExpose({ play: () => media.value?.play(), pause: () => media.value?.pause(), seek, media });
</script>

<style scoped lang="scss">
.uiMediaPlayer {
  min-width: 0; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); overflow: hidden; background: var(--uiBackgroundCanvas);
  video { display: block; width: 100%; max-height: 60dvh; }
  audio { display: none; }
  .playerControls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px; background: var(--uiBackgroundSubtle); .playerTime { color: var(--uiTextMuted); font-size: var(--uiFontControl); font-variant-numeric: tabular-nums; } .seekSlider { flex: 1; min-width: 100px; } .volumeSlider { width: 72px; } .playbackSpeed { min-height: 32px; padding: 0 6px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl); background: transparent; color: var(--uiTextBody); font-size: var(--uiFontControl); } }
  &:fullscreen { display: flex; flex-direction: column; height: 100%; video { flex: 1; min-height: 0; max-height: none; } }
}
</style>

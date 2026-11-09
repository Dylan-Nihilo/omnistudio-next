<template>
  <section class="audioMixer" aria-label="轨道混音">
    <header class="outputHeader"><strong>输出电平</strong><output>{{ peakLabel }} <small>dBFS</small><small v-if="peakHoldDb > -60" class="peakHoldLabel">峰值 {{ peakHoldLabel }} dBFS</small></output></header>
    <div class="outputMeter" role="meter" aria-label="总输出峰值" :aria-valuenow="meterDb" aria-valuemin="-60" aria-valuemax="0" :aria-valuetext="`${peakLabel} dBFS，保持峰值 ${peakHoldLabel} dBFS`"><i :style="{ width: `${(meterDb + 60) / 60 * 100}%` }"></i><b v-if="peakHoldDb > -60" :style="{ left: `${(peakHoldMeterDb + 60) / 60 * 100}%` }"></b></div>
    <div class="meterScale" aria-hidden="true"><span>−60</span><span>−24</span><span>−12</span><span>0</span></div>
    <p v-if="peakDb >= 0 || peakHoldDb >= 0" class="overloadNotice" role="status">峰值达到 0 dBFS，请降低音量</p>
    <div class="mixerTracks">
      <article v-for="track in audioTracks" :key="track.id" class="mixerTrack">
        <header><strong :title="track.label">{{ track.label }}</strong><output>{{ Math.round((track.volume ?? 1) * 100) }}%</output></header>
        <input type="range" min="0" max="2" step="0.01" :value="track.volume ?? 1" :aria-label="`${track.label}轨道音量`" :disabled="disabled || track.locked" @change="changeVolume(track.id, $event)" />
        <div class="trackActions"><button type="button" :aria-label="`${track.muted ? '取消静音' : '静音'} ${track.label}`" :aria-pressed="track.muted" :disabled="disabled || track.locked" @click="emit('toggle', { id: track.id, field: 'muted' })">静音</button><button type="button" :aria-label="`${track.solo ? '取消独听' : '独听'} ${track.label}`" :aria-pressed="track.solo ?? false" :disabled="disabled || track.locked" @click="emit('toggle', { id: track.id, field: 'solo' })">独听</button></div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { EditorTrack } from "./editorModel";

const props = defineProps<{ tracks: EditorTrack[]; disabled: boolean; peakDb: number; peakHoldDb: number }>();
const emit = defineEmits<{ volume: [value: { id: string; value: number }]; toggle: [value: { id: string; field: "muted" | "solo" }] }>();
const audioTracks = computed(() => props.tracks.filter(track => track.kind !== "text"));
const meterDb = computed(() => Number.isFinite(props.peakDb) ? Math.max(-60, Math.min(0, props.peakDb)) : -60);
const peakHoldMeterDb = computed(() => Number.isFinite(props.peakHoldDb) ? Math.max(-60, Math.min(0, props.peakHoldDb)) : -60);
const peakLabel = computed(() => !Number.isFinite(props.peakDb) || props.peakDb <= -60 ? "−∞" : `${props.peakDb > 0 ? "+" : ""}${props.peakDb.toFixed(1)}`);
const peakHoldLabel = computed(() => !Number.isFinite(props.peakHoldDb) || props.peakHoldDb <= -60 ? "−∞" : `${props.peakHoldDb > 0 ? "+" : ""}${props.peakHoldDb.toFixed(1)}`);

function changeVolume(id: string, event: Event) {
  const value = Number((event.currentTarget as HTMLInputElement).value);
  if (Number.isFinite(value)) emit("volume", { id, value: Math.min(2, Math.max(0, value)) });
}
</script>

<style scoped lang="scss">
.audioMixer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding-top: 14px;
  border-top: 1px solid #354038;
  color: #c3d1c7;
  font-size: 11px;

  .outputHeader {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px;
    strong { font-size: 11px; font-weight: 600; }
    output { color: #b5d7bf; font-variant-numeric: tabular-nums; white-space: nowrap; }
    small { color: #8d9e92; font-size: 9px; }
    .peakHoldLabel { display: block; margin-top: 3px; text-align: right; }
  }
  .outputMeter {
    position: relative;
    height: 7px;
    overflow: hidden;
    border: 1px solid #3b493f;
    border-radius: 2px;
    background: #111a14;
    i { display: block; height: 100%; background: linear-gradient(90deg, #609f76 0%, #9bc46a 68%, #e1bf69 88%, #d77466 100%); }
    b { position: absolute; top: -2px; height: 9px; width: 2px; background: #f2f5ef; transform: translateX(-50%); }
  }
  .meterScale { display: flex; justify-content: space-between; margin-top: -4px; color: #819287; font-size: 9px; font-variant-numeric: tabular-nums; }
  .overloadNotice { margin: 0; color: #e6a18a; font-size: 10px; line-height: 1.5; }
  .mixerTracks {
    display: grid;
    gap: 8px;
    max-height: 340px;
    overflow-y: auto;
    scrollbar-width: thin;
    .mixerTrack {
      min-width: 0;
      padding: 10px;
      border: 1px solid #35433a;
      border-radius: 4px;
      background: #202b23;
      header {
        display: flex;
        justify-content: space-between;
        gap: 6px;
        strong { overflow: hidden; color: #c7d7cc; font-size: 11px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
        output { color: #96b49e; font-size: 10px; font-variant-numeric: tabular-nums; }
      }
      input { display: block; width: 100%; height: 20px; margin: 5px 0; accent-color: #86b495; cursor: pointer; &:disabled { opacity: .4; cursor: default; } &:focus-visible { outline: 2px solid #9bc9aa; outline-offset: 2px; } }
      .trackActions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        button { min-height: 25px; padding: 3px 5px; border: 1px solid #425347; border-radius: 3px; color: #b3c4b9; background: #28372d; font: inherit; font-size: 10px; cursor: pointer; &[aria-pressed="true"] { border-color: #80a98c; color: #e1f0e6; background: #3b5845; } &:hover:not(:disabled) { border-color: #91b29b; } &:focus-visible { outline: 2px solid #9bc9aa; outline-offset: 2px; } &:disabled { opacity: .4; cursor: default; } }
      }
    }
  }
}
</style>

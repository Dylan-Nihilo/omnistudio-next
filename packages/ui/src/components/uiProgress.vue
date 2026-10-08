<template>
  <div class="uiProgress" :class="{ isCircle: type === 'circle', isIndeterminate: indeterminate, isError: status === 'error', isSuccess: status === 'success' }" role="progressbar" :aria-valuenow="indeterminate ? undefined : value" aria-valuemin="0" aria-valuemax="100" :style="{ '--progressValue': value + '%', '--progressWidth': width + 'px', '--progressStroke': strokeWidth + 'px' }">
    <div class="progressTrack"><span class="progressFill" /></div><span v-if="showText && !indeterminate" class="progressText">{{ Math.round(value) }}%</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { finiteNumber } from "../values";
const props = withDefaults(defineProps<{ percentage?: number; indeterminate?: boolean; showText?: boolean; status?: "default" | "success" | "error"; type?: "line" | "circle"; width?: number; strokeWidth?: number }>(), { percentage: 0, indeterminate: false, showText: true, status: "default", type: "line", width: 96, strokeWidth: 6 });
const value = computed(() => Math.min(100, Math.max(0, finiteNumber(props.percentage, 0))));
</script>

<style scoped lang="scss">
.uiProgress {
  --progressColor: var(--uiActionPrimary);
  display: flex; align-items: center; gap: 12px; min-width: 0;
  .progressTrack { flex: 1; height: var(--progressStroke); border-radius: 99px; background: var(--uiStateDisabled); overflow: hidden; .progressFill { display: block; width: var(--progressValue); height: 100%; background: var(--progressColor); } }
  .progressText { color: var(--uiTextBody); font-size: var(--uiFontControl); font-variant-numeric: tabular-nums; }
  &.isError { --progressColor: var(--uiStatusError); }
  &.isSuccess { --progressColor: var(--uiStatusSuccess); }
  &.isIndeterminate .progressFill { width: 35%; animation: uiProgressMove 1.2s ease-in-out infinite; }
  &.isCircle { position: relative; width: var(--progressWidth); height: var(--progressWidth); .progressTrack { flex: none; width: 100%; height: 100%; background: conic-gradient(var(--progressColor) var(--progressValue), var(--uiStateDisabled) 0); border-radius: 50%; mask: radial-gradient(farthest-side, transparent calc(100% - var(--progressStroke)), black 0); .progressFill { display: none; } } .progressText { position: absolute; inset: 0; display: grid; place-items: center; } &.isIndeterminate .progressTrack { background: conic-gradient(var(--progressColor) 25%, var(--uiStateDisabled) 0); animation: uiProgressRotate 1s linear infinite; } }
}
@keyframes uiProgressMove { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
@keyframes uiProgressRotate { to { transform: rotate(360deg); } }
</style>

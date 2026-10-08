<template>
  <div class="uiSlider" :class="[$attrs.class, { isVertical: vertical }]" :style="[$attrs.style as StyleValue, vertical ? { height } : undefined]">
    <input v-bind="{ ...$attrs, class: undefined, style: undefined }" type="range" :value="modelValue" :min="min" :max="max" :step="step" :disabled="disabled" :aria-valuetext="formatTooltip?.(modelValue)" :title="showTooltip ? (formatTooltip?.(modelValue) ?? String(modelValue)) : undefined" :list="marks ? marksId : undefined" @input="publish($event, 'input')" @change="publish($event, 'change')" />
    <datalist v-if="marks" :id="marksId"><option v-for="(label, value) in marks" :key="value" :value="value" :label="label" /></datalist>
  </div>
</template>

<script setup lang="ts">
import type { StyleValue } from "vue";
import { useUiId } from "../id";
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ modelValue: number; min?: number; max?: number; step?: number; disabled?: boolean; vertical?: boolean; height?: string; showTooltip?: boolean; marks?: Record<number, string>; formatTooltip?: (value: number) => string }>(), { min: 0, max: 100, step: 1, disabled: false, vertical: false, height: "160px", showTooltip: true });
const emit = defineEmits<{ "update:modelValue": [value: number]; input: [value: number]; change: [value: number] }>();
const marksId = "uiSlider-" + useUiId();
function publish(event: Event, name: "input" | "change") {
  const element = event.target as HTMLInputElement;
  if (element.disabled || !Number.isFinite(element.valueAsNumber)) return;
  emit("update:modelValue", element.valueAsNumber);
  if (name === "input") emit("input", element.valueAsNumber); else emit("change", element.valueAsNumber);
}
</script>

<style scoped lang="scss">
.uiSlider {
  display: flex; align-items: center; min-height: var(--uiControlMedium); min-width: 0;
  input { width: 100%; margin: 0; accent-color: var(--uiActionPrimary); cursor: pointer; &:disabled { cursor: not-allowed; } }
  &.isVertical { min-height: 0; input { writing-mode: vertical-lr; direction: rtl; width: 20px; height: 100%; } }
}
</style>

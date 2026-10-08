<template>
  <div class="uiNumberInput" :class="[sizeClass, $attrs.class, { isDisabled: disabled, isError: error }]" :style="$attrs.style as StyleValue">
    <button v-if="controls" type="button" :disabled="disabled || readonly || (modelValue != null && modelValue <= lower)" aria-label="减少" @click="stepBy(-1)">−</button>
    <input ref="input" v-bind="{ ...$attrs, class: undefined, style: undefined }" type="number" :value="draft" :min="lower" :max="upper" :step="stepStrictly ? safeStep : 'any'" :disabled="disabled" :readonly="readonly" :aria-invalid="error || undefined" @input="handleInput" @change="commit" @blur="commit" @keydown.up.prevent="stepBy(1)" @keydown.down.prevent="stepBy(-1)" />
    <button v-if="controls" type="button" :disabled="disabled || readonly || (modelValue != null && modelValue >= upper)" aria-label="增加" @click="stepBy(1)">+</button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, watch, type StyleValue } from "vue";
import type { UiSize } from "../theme";
import { finiteNumber } from "../values";
import { uiFieldKey } from "../form";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue?: number | null; min?: number; max?: number; step?: number; precision?: number; stepStrictly?: boolean; controls?: boolean; disabled?: boolean; readonly?: boolean; error?: boolean; size?: UiSize }>(), { min: -Infinity, max: Infinity, step: 1, stepStrictly: false, controls: true, disabled: false, readonly: false, error: false, size: "medium" });
const emit = defineEmits<{ "update:modelValue": [value: number | undefined]; input: [value: number | undefined]; change: [value: number | undefined] }>();
const validateField = inject(uiFieldKey, undefined);
const input = ref<HTMLInputElement>();
const sizeClass = computed(() => "size" + props.size[0]!.toUpperCase() + props.size.slice(1));
const draft = ref(props.modelValue == null ? "" : String(props.modelValue));
let committedValue = props.modelValue ?? undefined;
let editingDraft = false;
const lower = computed(() => finiteNumber(props.min, -Infinity));
const upper = computed(() => Math.max(lower.value, finiteNumber(props.max, Infinity)));
const safeStep = computed(() => props.step > 0 ? finiteNumber(props.step, 1) : 1);
watch(() => props.modelValue, value => { if (!editingDraft) draft.value = value == null ? "" : String(value); if (document.activeElement !== input.value) committedValue = value ?? undefined; });
function normalize(value: number) {
  if (props.stepStrictly) value = Math.round(value / safeStep.value) * safeStep.value;
  if (props.precision != null && Number.isFinite(props.precision)) value = Number(value.toFixed(Math.min(20, Math.max(0, Math.trunc(props.precision)))));
  return Math.min(upper.value, Math.max(lower.value, value));
}
function publish(value: number | undefined) {
  if (props.disabled || props.readonly) return;
  if (value !== props.modelValue) emit("update:modelValue", value);
  emit("input", value);
}
function handleInput(event: Event) {
  const element = event.target as HTMLInputElement;
  editingDraft = true;
  draft.value = element.value;
  if (!element.value && !element.validity.badInput) publish(undefined);
  else if (Number.isFinite(element.valueAsNumber)) publish(normalize(element.valueAsNumber));
}
function commit() {
  if (props.disabled || props.readonly) return;
  editingDraft = false;
  const value = draft.value.trim() ? Number(draft.value) : undefined;
  const normalized = value == null ? undefined : Number.isFinite(value) ? normalize(value) : props.modelValue ?? undefined;
  draft.value = normalized == null ? "" : String(normalized);
  publish(normalized);
  if (normalized !== committedValue) emit("change", normalized);
  committedValue = normalized;
  void nextTick(() => {
    const value = props.modelValue ?? undefined;
    if (value === normalized) return;
    draft.value = value == null ? "" : String(value);
    committedValue = value;
  });
}
function stepBy(direction: number) {
  if (props.disabled || props.readonly) return;
  const candidate = editingDraft ? Number(draft.value) : props.modelValue;
  const base = Number.isFinite(candidate) ? candidate! : 0;
  editingDraft = false;
  const decimals = (value: number) => { const [number, exponent = "0"] = String(value).split("e"); return Math.max(0, (number!.split(".")[1]?.length ?? 0) - Number(exponent)); };
  const precision = Math.min(20, Math.max(decimals(base), decimals(safeStep.value)));
  const value = normalize(Number((base + direction * safeStep.value).toFixed(precision)));
  draft.value = String(value);
  publish(value); if (value !== committedValue) emit("change", value); committedValue = value; validateField?.("change"); input.value?.focus();
}
defineExpose({ focus: () => input.value?.focus(), select: () => input.value?.select(), input });
</script>

<style scoped lang="scss">
.uiNumberInput {
  display: flex; min-width: 0; --controlHeight: var(--uiControlMedium); min-height: var(--controlHeight); border: 1px solid var(--uiBorderControl);
  border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); overflow: hidden;
  &.sizeSmall { --controlHeight: var(--uiControlSmall); }
  &.sizeLarge { --controlHeight: var(--uiControlLarge); }
  &:focus-within { outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; }
  &.isError { border-color: var(--uiStatusError); }
  input { width: 100%; min-width: 0; padding: 0 12px; border: 0; background: transparent; color: var(--uiTextPrimary); font-size: var(--uiFontControl); outline: 0; appearance: textfield; &::-webkit-inner-spin-button, &::-webkit-outer-spin-button { appearance: none; margin: 0; } }
  button { flex-shrink: 0; width: 32px; border: 0; color: var(--uiTextBody); background: transparent; font-size: 18px; cursor: pointer; &:hover:not(:disabled) { background: var(--uiSurfaceHover); } &:disabled { color: var(--uiStateDisabledText); cursor: not-allowed; } }
  &:has(input:disabled) { border-color: var(--uiBorderDefault); background: var(--uiStateDisabled); input { color: var(--uiStateDisabledText); } }
}
</style>

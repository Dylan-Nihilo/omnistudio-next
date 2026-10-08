<template>
  <div class="uiTagInput" :class="{ isDisabled: disabled, isError: error }">
    <uiTag v-for="(value, index) in modelValue" :key="value" :closable="!readonly" :disabled="disabled" :closeLabel="'移除 ' + value" @close="remove(index)">{{ value }}</uiTag>
    <input v-if="!readonly" ref="input" v-bind="$attrs" :value="draft" :disabled="disabled || modelValue.length >= max" :aria-invalid="error || undefined" @input="draft = ($event.target as HTMLInputElement).value" @keydown="handleKeydown" />
  </div>
</template>

<script setup lang="ts">
import { inject, ref } from "vue";
import uiTag from "./uiTag.vue";
import { uiFieldKey } from "../form";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue?: string[]; disabled?: boolean; readonly?: boolean; error?: boolean; max?: number }>(), { modelValue: () => [], disabled: false, readonly: false, error: false, max: Infinity });
const emit = defineEmits<{ "update:modelValue": [value: string[]]; change: [value: string[]] }>();
const validateField = inject(uiFieldKey, undefined);
const input = ref<HTMLInputElement>();
const draft = ref("");
function publish(values: string[]) { emit("update:modelValue", values); emit("change", values); validateField?.("change"); }
function remove(index: number) { if (props.disabled || props.readonly) return; publish(props.modelValue.filter((_value, item) => item !== index)); input.value?.focus(); }
function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || props.disabled || props.readonly) return;
  if (event.key === "Backspace" && !draft.value) remove(props.modelValue.length - 1);
  if (event.key !== "Enter") return;
  event.preventDefault();
  const value = draft.value.trim();
  if (value && !props.modelValue.includes(value) && props.modelValue.length < props.max) publish([...props.modelValue, value]);
  draft.value = "";
}
defineExpose({ focus: () => input.value?.focus() });
</script>

<style scoped lang="scss">
.uiTagInput {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-width: 0; min-height: var(--uiControlMedium); padding: 4px 8px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle);
  &:focus-within { outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; }
  input { flex: 1; min-width: 80px; min-height: 26px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--uiTextPrimary); font-size: var(--uiFontControl); &::placeholder { color: var(--uiTextMuted); } }
  &.isError { border-color: var(--uiStatusError); }
  &.isDisabled { border-color: var(--uiBorderDefault); background: var(--uiStateDisabled); }
}
</style>

<template>
  <label class="uiRadio" :class="{ isDisabled: disabled, isBordered: border }">
    <input v-bind="$attrs" type="radio" :name="name" :checked="modelValue === value" :value="String(value)" :disabled="disabled" @change="select" />
    <span class="radioMark" aria-hidden="true" /><span class="radioLabel"><slot /></span>
  </label>
</template>

<script setup lang="ts">
import { nextTick } from "vue";
import type { UiValue } from "../types";
defineOptions({ inheritAttrs: false });
const props = defineProps<{ value: UiValue; modelValue?: UiValue | null; name?: string; disabled?: boolean; border?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: UiValue]; change: [value: UiValue] }>();
async function select(event: Event) {
  if (props.disabled) return;
  emit("update:modelValue", props.value); emit("change", props.value);
  await nextTick(); (event.target as HTMLInputElement).checked = props.modelValue === props.value;
}
</script>

<style scoped lang="scss">
.uiRadio {
  display: inline-flex; align-items: center; position: relative; gap: 8px; min-height: var(--uiControlMedium); color: var(--uiTextBody); font-size: var(--uiFontControl); cursor: pointer;
  &.isBordered { padding: 8px 12px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl); &:has(input:checked) { border-color: var(--uiActionPrimary); background: var(--uiActionSoft); } }
  input { position: absolute; width: 18px; height: 18px; margin: 0; opacity: 0; }
  .radioMark { width: 18px; height: 18px; flex-shrink: 0; border: 1px solid var(--uiBorderControl); border-radius: 50%; background: var(--uiBackgroundSubtle); }
  input:checked + .radioMark { border: 5px solid var(--uiActionPrimary); }
  input:focus-visible + .radioMark { outline: 2px solid var(--uiBorderFocus); outline-offset: 3px; }
  .radioLabel {
    min-width: 0; overflow-wrap: anywhere;
    &:has(> svg) { display: inline-flex; align-items: center; gap: 6px; }
    :deep(> svg) { display: block; flex-shrink: 0; }
  }
  &.isDisabled { color: var(--uiStateDisabledText); cursor: not-allowed; input + .radioMark { border-color: var(--uiStateDisabledText); } }
}
</style>

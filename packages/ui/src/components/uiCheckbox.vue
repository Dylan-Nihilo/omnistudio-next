<template>
  <label class="uiCheckbox" :class="{ isDisabled: disabled }">
    <input v-bind="$attrs" type="checkbox" :checked="modelValue" :indeterminate="indeterminate" :disabled="disabled" :aria-checked="indeterminate ? 'mixed' : modelValue" @change="handleChange" />
    <span class="checkboxMark" aria-hidden="true"><span v-if="indeterminate">−</span><span v-else-if="modelValue">✓</span></span>
    <span class="checkboxLabel"><slot /></span>
  </label>
</template>

<script setup lang="ts">
import { nextTick } from "vue";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue?: boolean; indeterminate?: boolean; disabled?: boolean }>(), { modelValue: false, indeterminate: false, disabled: false });
const emit = defineEmits<{ "update:modelValue": [value: boolean]; change: [value: boolean] }>();
async function handleChange(event: Event) {
  if (props.disabled) return;
  const input = event.target as HTMLInputElement;
  emit("update:modelValue", input.checked);
  emit("change", input.checked);
  await nextTick();
  input.checked = props.modelValue;
  input.indeterminate = props.indeterminate;
}
</script>

<style scoped lang="scss">
.uiCheckbox {
  position: relative; display: inline-flex; align-items: center; gap: 8px; min-height: 36px;
  font-size: var(--uiFontControl); color: var(--uiTextBody); cursor: pointer;
  input { position: absolute; width: 20px; height: 20px; inset-inline-start: 0; margin: 0; opacity: 0; cursor: inherit; }
  .checkboxMark { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; border: 1px solid var(--uiBorderControl); border-radius: 4px; background: var(--uiBackgroundSubtle); font-size: 15px; }
  input:checked + .checkboxMark, input:indeterminate + .checkboxMark { color: var(--uiTextOnAccent); background: var(--uiActionPrimary); border-color: var(--uiActionPrimary); }
  input:focus-visible + .checkboxMark { outline: 2px solid var(--uiBorderFocus); outline-offset: 3px; }
  .checkboxLabel { min-width: 0; overflow-wrap: anywhere; }
  &.isDisabled {
    color: var(--uiStateDisabledText); cursor: not-allowed;
    input + .checkboxMark { color: var(--uiStateDisabledText); background: var(--uiStateDisabled); border-color: var(--uiBorderDefault); }
  }
}
</style>

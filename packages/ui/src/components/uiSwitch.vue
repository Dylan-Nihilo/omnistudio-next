<template>
  <label class="uiSwitch" :class="{ isDisabled: disabled }">
    <input v-bind="$attrs" type="checkbox" role="switch" :checked="modelValue" :disabled="disabled || loading" :aria-busy="loading || undefined" @change="handleChange" />
    <span class="switchTrack" aria-hidden="true"><span class="switchThumb" /></span>
    <span v-if="$slots.default" class="switchLabel"><slot /></span>
  </label>
</template>

<script setup lang="ts">
import { nextTick } from "vue";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue?: boolean; disabled?: boolean; loading?: boolean }>(), { modelValue: false, disabled: false, loading: false });
const emit = defineEmits<{ "update:modelValue": [value: boolean]; change: [value: boolean] }>();
async function handleChange(event: Event) {
  if (props.disabled || props.loading) return;
  const input = event.target as HTMLInputElement;
  emit("update:modelValue", input.checked);
  emit("change", input.checked);
  await nextTick();
  input.checked = props.modelValue;
}
</script>

<style scoped lang="scss">
.uiSwitch {
  position: relative; display: inline-flex; align-items: center; gap: 12px; min-height: 36px; color: var(--uiTextBody); font-size: var(--uiFontControl); cursor: pointer;
  input { position: absolute; width: 44px; height: 24px; inset-inline-start: 0; margin: 0; opacity: 0; cursor: inherit; }
  .switchTrack { display: block; flex-shrink: 0; width: 44px; height: 24px; padding: 2px; border: 1px solid var(--uiBorderControl); background: var(--uiStateDisabled); border-radius: 99px; transition: background-color var(--uiMotionDuration) var(--uiMotionEase); }
  .switchThumb { display: block; width: 18px; height: 18px; background: var(--uiTextBody); border-radius: 50%; transition: transform var(--uiMotionDuration) var(--uiMotionEase); }
  input:checked + .switchTrack { background: var(--uiActionPrimary); border-color: var(--uiActionPrimary); .switchThumb { background: var(--uiTextOnAccent); transform: translateX(20px); } }
  input:focus-visible + .switchTrack { outline: 2px solid var(--uiBorderFocus); outline-offset: 3px; }
  .switchLabel { min-width: 0; overflow-wrap: anywhere; }
  &.isDisabled {
    color: var(--uiStateDisabledText); cursor: not-allowed;
    input + .switchTrack { background: var(--uiStateDisabled); border-color: var(--uiBorderDefault); .switchThumb { background: var(--uiStateDisabledText); } }
  }
}
</style>

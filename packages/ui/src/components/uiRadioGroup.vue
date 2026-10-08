<template>
  <div ref="group" class="uiRadioGroup" :class="{ isSegmented: variant === 'segmented', isBlock: block }" role="radiogroup">
    <uiRadio v-for="option in options" :key="valueKey(option.value)" :value="option.value" :modelValue="modelValue" :name="groupName" :disabled="disabled || option.disabled" :border="variant === 'bordered'" @update:modelValue="select">
      <component v-if="option.icon" :is="option.icon" :size="16" aria-hidden="true" />{{ option.label }}
    </uiRadio>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useUiId } from "../id";
import uiRadio from "./uiRadio.vue";
import type { UiOption, UiValue } from "../types";
import { valueKey } from "../values";
const props = withDefaults(defineProps<{ modelValue?: UiValue | null; options: UiOption[]; name?: string; disabled?: boolean; variant?: "default" | "bordered" | "segmented"; block?: boolean }>(), { disabled: false, variant: "default", block: false });
const emit = defineEmits<{ "update:modelValue": [value: UiValue]; change: [value: UiValue] }>();
const group = ref<HTMLElement>();
const localId = useUiId();
const groupName = computed(() => props.name || "uiRadio-" + localId);
async function select(value: UiValue) {
  if (props.disabled) return;
  emit("update:modelValue", value);
  emit("change", value);
  await nextTick();
  const inputs = group.value?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
  props.options.forEach((option, index) => {
    if (inputs?.[index]) inputs[index].checked = props.modelValue === option.value;
  });
}
</script>

<style scoped lang="scss">
.uiRadioGroup {
  display: flex; flex-wrap: wrap; gap: 12px; min-width: 0;
  &.isSegmented {
    display: inline-flex; padding: 3px; gap: 3px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle);
    :deep(.uiRadio) { min-height: 30px; padding: 4px 12px; border-radius: max(0px, calc(var(--uiRadiusControl) - 3px)); &:has(input:checked) { color: var(--uiTextOnAccent); background: var(--uiActionPrimary); } &:has(input:focus-visible) { outline: 2px solid var(--uiBorderFocus); outline-offset: 1px; } .radioMark { display: none; } input { width: 100%; height: 100%; inset: 0; } .radioLabel { display: flex; align-items: center; gap: 6px; } }
  }
  &.isBlock { display: flex; :deep(.uiRadio) { flex: 1; justify-content: center; } }
}
</style>

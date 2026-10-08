<template>
  <div class="uiCheckboxGroup" role="group">
    <uiCheckbox v-for="option in options" :key="valueKey(option.value)" :modelValue="modelValue.includes(option.value)" :disabled="disabled || option.disabled || (modelValue.includes(option.value) ? modelValue.length <= min : modelValue.length >= max)" @update:modelValue="value => select(option.value, value)">{{ option.label }}</uiCheckbox>
  </div>
</template>

<script setup lang="ts">
import uiCheckbox from "./uiCheckbox.vue";
import type { UiOption, UiValue } from "../types";
import { valueKey } from "../values";
const props = withDefaults(defineProps<{ modelValue?: UiValue[]; options: UiOption[]; disabled?: boolean; min?: number; max?: number }>(), { modelValue: () => [], disabled: false, min: 0, max: Infinity });
const emit = defineEmits<{ "update:modelValue": [value: UiValue[]]; change: [value: UiValue[]] }>();
function select(value: UiValue, checked: boolean) {
  if (props.disabled || props.options.find(option => option.value === value)?.disabled) return;
  if (checked ? props.modelValue.length >= props.max : props.modelValue.length <= props.min) return;
  const values = checked ? [...new Set([...props.modelValue, value])] : props.modelValue.filter(item => item !== value);
  emit("update:modelValue", values); emit("change", values);
}
</script>

<style scoped lang="scss">
.uiCheckboxGroup { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
</style>

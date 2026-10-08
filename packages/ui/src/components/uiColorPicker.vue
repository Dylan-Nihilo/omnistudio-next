<template>
  <input v-bind="$attrs" class="uiColorPicker" type="color" :value="validColor" :disabled="disabled" @input="publish($event, false)" @change="publish($event, true)" />
</template>

<script setup lang="ts">
import { computed } from "vue";
defineOptions({ inheritAttrs: false });
const props = defineProps<{ modelValue?: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string]; change: [value: string] }>();
const validColor = computed(() => /^#[\da-f]{6}$/i.test(props.modelValue ?? "") ? props.modelValue : "#ff6b35");
function publish(event: Event, changed: boolean) {
  if (props.disabled) return;
  const value = (event.target as HTMLInputElement).value;
  emit("update:modelValue", value); if (changed) emit("change", value);
}
</script>

<style scoped lang="scss">
.uiColorPicker { width: 48px; height: var(--uiControlMedium); padding: 4px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); cursor: pointer; &::-webkit-color-swatch-wrapper { padding: 0; } &::-webkit-color-swatch { border: 0; border-radius: max(0px, calc(var(--uiRadiusControl) - 4px)); } &:disabled { opacity: 0.5; cursor: not-allowed; } }
</style>

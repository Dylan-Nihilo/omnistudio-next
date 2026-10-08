<template>
  <textarea ref="textarea" v-bind="$attrs" class="uiTextarea" :class="{ isError: error, isDisabled: disabled, isAutosized: !!autosize }" :value="modelValue ?? ''" :rows="rows" :disabled="disabled" :readonly="readonly" :aria-invalid="error || undefined" :style="textareaStyle" @input="handleInput" @change="emit('change', ($event.target as HTMLTextAreaElement).value)" @compositionstart="composing = true" @compositionend="handleCompositionEnd" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue?: string | null; rows?: number; disabled?: boolean; readonly?: boolean; error?: boolean; resize?: "none" | "vertical" | "both" | "horizontal"; autosize?: boolean | { minRows?: number; maxRows?: number } }>(), { rows: 4, disabled: false, readonly: false, error: false, resize: "vertical" });
const emit = defineEmits<{ "update:modelValue": [value: string]; input: [value: string]; change: [value: string] }>();
const textarea = ref<HTMLTextAreaElement>();
const composing = ref(false);
let observer: ResizeObserver | undefined;
let frame = 0;
const minRows = computed(() => typeof props.autosize === "object" ? props.autosize.minRows ?? props.rows : props.rows);
const maxRows = computed(() => typeof props.autosize === "object" ? props.autosize.maxRows : undefined);
const textareaStyle = computed(() => ({ resize: props.autosize ? "none" as const : props.resize, minHeight: props.autosize ? "calc(" + minRows.value + " * var(--uiFontBody) * 1.7 + 26px)" : undefined, maxHeight: props.autosize && maxRows.value ? "calc(" + maxRows.value + " * var(--uiFontBody) * 1.7 + 26px)" : undefined }));
function resizeTextarea() {
  if (!props.autosize || !textarea.value || CSS.supports("field-sizing", "content")) return;
  const element = textarea.value, style = getComputedStyle(element);
  const line = parseFloat(style.lineHeight), padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + 2;
  element.style.height = "0px";
  element.style.height = Math.max(minRows.value * line + padding, Math.min((maxRows.value ?? Infinity) * line + padding, element.scrollHeight + 2)) + "px";
}
onMounted(() => {
  if (CSS.supports("field-sizing", "content") || !textarea.value) return;
  observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(resizeTextarea); });
  observer.observe(textarea.value);
  const theme = textarea.value.closest(".uiTheme"); if (theme) observer.observe(theme);
  resizeTextarea();
});
watch([() => props.modelValue, () => props.autosize, () => props.rows], resizeTextarea, { flush: "post" });
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frame); });
let lastValue = props.modelValue ?? "";
watch(() => props.modelValue, value => { lastValue = value ?? ""; });
function publish(event: Event) {
  if (props.disabled || props.readonly) return;
  const value = (event.target as HTMLTextAreaElement).value;
  if (value === lastValue) return;
  lastValue = value;
  emit("update:modelValue", value);
  emit("input", value);
}
function handleInput(event: Event) { if (!composing.value && !(event as InputEvent).isComposing) publish(event); }
function handleCompositionEnd(event: CompositionEvent) { composing.value = false; publish(event); }
function focus() { textarea.value?.focus(); }
function blur() { textarea.value?.blur(); }
function select() { textarea.value?.select(); }
defineExpose({ focus, blur, select, textarea });
</script>

<style scoped lang="scss">
.uiTextarea {
  display: block; width: 100%; padding: 12px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl);
  background: var(--uiBackgroundSubtle); color: var(--uiTextPrimary); font-size: var(--uiFontBody); line-height: 1.7;
  &:focus-visible { border-color: var(--uiBorderFocus); outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; }
  &.isAutosized { field-sizing: content; }
  &::placeholder { color: var(--uiTextMuted); }
  &.isError { border-color: var(--uiStatusError); }
  &.isDisabled { color: var(--uiStateDisabledText); background: var(--uiStateDisabled); border-color: var(--uiBorderDefault); cursor: not-allowed; }
}
</style>

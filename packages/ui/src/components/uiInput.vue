<template>
  <div class="uiInput" :class="[sizeClass, $attrs.class, { isError: error, isDisabled: disabled, isReadonly: readonly }]" :style="$attrs.style as StyleValue">
    <span v-if="$slots.prefix" class="inputPrefix"><slot name="prefix" /></span>
    <input ref="input" v-bind="{ ...$attrs, class: undefined, style: undefined }" :value="modelValue ?? ''" :type="type === 'password' && passwordVisible ? 'text' : type" :disabled="disabled" :readonly="readonly" @input="handleInput" @change="emit('change', ($event.target as HTMLInputElement).value)" @focus="emit('focus', $event)" @blur="emit('blur', $event)" @compositionstart="composing = true" @compositionend="handleCompositionEnd" :aria-invalid="error || undefined" />
    <button v-if="clearable && modelValue !== '' && modelValue != null && !disabled && !readonly" class="clearButton" type="button" aria-label="清空内容" @click="clear">×</button>
    <button v-if="showPassword && type === 'password'" class="passwordButton" type="button" :disabled="disabled" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" @click="passwordVisible = !passwordVisible">
      <svg v-if="!passwordVisible" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>
      <svg v-else viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18M10.6 6.2A10.3 10.3 0 0 1 12 6c6.1 0 9.5 6 9.5 6a17 17 0 0 1-3.1 3.6M6.3 6.4C3.8 8.1 2.5 12 2.5 12s3.4 6 9.5 6a9.8 9.8 0 0 0 3.1-.5" /><path d="M9.9 9.9a2.5 2.5 0 0 0 3.5 3.5" /></svg>
    </button>
    <span v-if="$slots.suffix" class="inputSuffix"><slot name="suffix" /></span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type StyleValue } from "vue";
import type { UiSize } from "../theme";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue?: string | number | null; type?: "text" | "search" | "password" | "email" | "url" | "tel"; disabled?: boolean; readonly?: boolean; clearable?: boolean; error?: boolean; size?: UiSize; showPassword?: boolean }>(), { type: "text", disabled: false, readonly: false, clearable: false, error: false, size: "medium", showPassword: false });
const emit = defineEmits<{ "update:modelValue": [value: string]; input: [value: string]; change: [value: string]; focus: [event: FocusEvent]; blur: [event: FocusEvent]; clear: [] }>();
const input = ref<HTMLInputElement>();
const passwordVisible = ref(false);
const sizeClass = computed(() => "size" + props.size[0]!.toUpperCase() + props.size.slice(1));
const composing = ref(false);
let lastValue = String(props.modelValue ?? "");
watch(() => props.modelValue, value => { lastValue = String(value ?? ""); });
function publish(value: string) {
  if (value === lastValue) return;
  lastValue = value;
  emit("update:modelValue", value);
  emit("input", value);
}
function handleInput(event: Event) { if (!composing.value && !(event as InputEvent).isComposing && !props.disabled && !props.readonly) publish((event.target as HTMLInputElement).value); }
function handleCompositionEnd(event: CompositionEvent) { composing.value = false; handleInput(event); }
function focus() { input.value?.focus(); }
function blur() { input.value?.blur(); }
function select() { input.value?.select(); }
function clear() { if (props.disabled || props.readonly) return; publish(""); emit("change", ""); emit("clear"); focus(); }
defineExpose({ focus, blur, select, clear, input });
</script>

<style scoped lang="scss">
.uiInput {
  display: flex; align-items: center; gap: 8px; --inputHeight: var(--uiControlMedium); min-height: var(--inputHeight);
  padding: 0 12px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl);
  background: var(--uiBackgroundSubtle); transition: border-color var(--uiMotionDuration) var(--uiMotionEase);
  &.sizeSmall { --inputHeight: var(--uiControlSmall); }
  &.sizeLarge { --inputHeight: var(--uiControlLarge); }
  &:focus-within { border-color: var(--uiBorderFocus); outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; }
  &.isError { border-color: var(--uiStatusError); }
  &.isDisabled { background: var(--uiStateDisabled); border-color: var(--uiBorderDefault); cursor: not-allowed; }
  input {
    min-width: 0; width: 100%; min-height: calc(var(--inputHeight) - 2px); padding: 0; border: 0; outline: 0;
    font-size: var(--uiFontControl); line-height: 1.5; color: var(--uiTextPrimary); background: transparent;
    &::placeholder { color: var(--uiTextMuted); }
    &:disabled { color: var(--uiStateDisabledText); cursor: not-allowed; }
  }
  .clearButton { flex-shrink: 0; width: 24px; height: 24px; padding: 0; border: 0; color: var(--uiTextBody); background: transparent; font-size: 20px; cursor: pointer; }
  .passwordButton { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px; color: var(--uiTextMuted); background: transparent; cursor: pointer; transition: color var(--uiMotionDuration) var(--uiMotionEase), background-color var(--uiMotionDuration) var(--uiMotionEase); &:hover:not(:disabled) { color: var(--uiTextPrimary); background: var(--uiSurfaceHover); } &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: 1px; } &:disabled { cursor: not-allowed; opacity: .55; } svg { display: block; width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; } }
  .inputPrefix, .inputSuffix { display: inline-flex; flex-shrink: 0; color: var(--uiTextMuted); }
}
</style>

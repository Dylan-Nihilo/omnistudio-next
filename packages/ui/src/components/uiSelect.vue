<template>
  <div class="uiSelectRoot" :class="[$attrs.class, { isInline: inline }]" :style="$attrs.style as StyleValue">
  <uiPopover ref="popover" v-model:visible="visible" trigger="manual" role="listbox" :block="!inline" matchWidth :disabled="disabled" @hide="query = ''">
    <template #reference="{ panelId, open, toggle }">
      <div class="uiSelect" :class="[sizeClass, { isDisabled: disabled, isError: error }]">
        <input ref="input" v-bind="{ ...$attrs, class: undefined, style: undefined }" role="combobox" aria-autocomplete="list" :aria-expanded="visible" :aria-controls="panelId" :aria-activedescendant="activeIndex >= 0 && visible ? panelId + '-option-' + activeIndex : undefined" :aria-invalid="error || undefined" :aria-busy="loading || undefined" :value="visible && filterable ? query : selectedLabel" :placeholder="placeholder" :readonly="!filterable" :disabled="disabled" @click="open" @input="search" @compositionend="search" @keydown="handleKeydown" />
        <button v-if="clearable && hasValue" type="button" class="clearButton" :disabled="disabled" aria-label="清空选择" @click.stop="clear">×</button>
        <button type="button" class="selectArrow" tabindex="-1" :disabled="disabled" aria-label="展开选项" @click="toggle">⌄</button>
      </div>
    </template>
    <template #default>
      <div v-if="loading" class="selectLoading" role="status"><span class="loadingIndicator" aria-hidden="true" /></div>
      <template v-for="(option, index) in filteredOptions" :key="valueKey(option.value)">
        <div v-if="option.group && (index === 0 || option.group !== filteredOptions[index - 1]?.group)" class="optionGroup" role="presentation">{{ option.group }}</div>
        <div :id="popover?.panel?.id + '-option-' + index" class="selectOption" :class="{ isActive: index === activeIndex, isSelected: isSelected(option.value), isDisabled: option.disabled }" role="option" :aria-selected="isSelected(option.value)" :aria-disabled="option.disabled || undefined" @pointermove="!option.disabled && (activeIndex = index)" @mousedown.prevent @click="choose(option)">
          <span>{{ option.label }}</span><span v-if="isSelected(option.value)" aria-hidden="true">✓</span>
        </div>
      </template>
      <button v-if="canCreate" class="createOption" type="button" @mousedown.prevent @click="create">{{ query.trim() }}</button>
      <span v-if="!loading && !filteredOptions.length && !canCreate && noDataText" class="noOptions">{{ noDataText }}</span>
    </template>
  </uiPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, ref, watch, type StyleValue } from "vue";
import uiPopover from "./uiPopover.vue";
import type { UiSize } from "../theme";
import type { UiOption, UiValue } from "../types";
import { valueKey } from "../values";
import { uiFieldKey } from "../form";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ modelValue?: UiValue | UiValue[] | null; options: UiOption[]; multiple?: boolean; disabled?: boolean; error?: boolean; loading?: boolean; clearable?: boolean; filterable?: boolean; allowCreate?: boolean; placeholder?: string; noDataText?: string; size?: UiSize; inline?: boolean }>(), { multiple: false, disabled: false, error: false, loading: false, clearable: false, filterable: false, allowCreate: false, placeholder: "", size: "medium", inline: false });
const emit = defineEmits<{ "update:modelValue": [value: UiValue | UiValue[] | undefined]; change: [value: UiValue | UiValue[] | undefined]; visibleChange: [value: boolean]; create: [value: string] }>();
const popover = ref<InstanceType<typeof uiPopover>>();
const validateField = inject(uiFieldKey, undefined);
const input = ref<HTMLInputElement>();
const visible = ref(false);
const sizeClass = computed(() => "size" + props.size[0]!.toUpperCase() + props.size.slice(1));
const query = ref("");
const activeIndex = ref(-1);
const values = computed(() => Array.isArray(props.modelValue) ? props.modelValue : props.modelValue == null ? [] : [props.modelValue]);
const hasValue = computed(() => values.value.some(value => value !== "" || props.options.some(option => option.value === "")));
const selectedLabel = computed(() => values.value.map(value => props.options.find(option => option.value === value)?.label ?? String(value)).join("、"));
const filteredOptions = computed(() => props.options.filter(option => !props.filterable || option.label.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())));
const canCreate = computed(() => props.allowCreate && props.filterable && !!query.value.trim() && !props.options.some(option => option.label === query.value.trim() || option.value === query.value.trim()));
watch([visible, filteredOptions], () => {
  activeIndex.value = filteredOptions.value.findIndex(option => !option.disabled && values.value.includes(option.value));
  if (activeIndex.value < 0) activeIndex.value = filteredOptions.value.findIndex(option => !option.disabled);
});
watch(visible, value => emit("visibleChange", value));
function isSelected(value: UiValue) { return values.value.includes(value); }
function publish(value: UiValue | UiValue[] | undefined) { emit("update:modelValue", value); emit("change", value); validateField?.("change"); }
function choose(option: UiOption) {
  if (props.disabled || option.disabled) return;
  publish(props.multiple ? isSelected(option.value) ? values.value.filter(value => value !== option.value) : [...values.value, option.value] : option.value);
  if (!props.multiple) visible.value = false;
  query.value = ""; input.value?.focus();
}
function clear() { if (props.disabled) return; publish(props.multiple ? [] : undefined); query.value = ""; input.value?.focus(); }
function create() { if (!canCreate.value) return; const value = query.value.trim(); emit("create", value); choose({ label: value, value }); }
function search(event: Event) {
  if ((event as InputEvent).isComposing) return;
  query.value = (event.target as HTMLInputElement).value; visible.value = true;
}
async function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || props.disabled) return;
  if (event.key === "Escape") { if (visible.value) { event.preventDefault(); event.stopPropagation(); visible.value = false; } return; }
  if (event.key === "Tab") { visible.value = false; return; }
  if (event.key === "Enter") { event.preventDefault(); if (!visible.value) visible.value = true; else if (filteredOptions.value[activeIndex.value]) choose(filteredOptions.value[activeIndex.value]!); else create(); return; }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  if (props.filterable && !visible.value && ["Home", "End"].includes(event.key)) return;
  event.preventDefault(); const wasOpen = visible.value; visible.value = true; await nextTick();
  const indices = filteredOptions.value.flatMap((option, index) => option.disabled ? [] : [index]);
  if (!wasOpen && ["ArrowDown", "ArrowUp"].includes(event.key)) { activeIndex.value = indices.find(index => isSelected(filteredOptions.value[index]!.value)) ?? (event.key === "ArrowDown" ? indices[0] : indices.at(-1)) ?? -1; return; }
  const current = indices.indexOf(activeIndex.value);
  activeIndex.value = event.key === "Home" ? indices[0] ?? -1 : event.key === "End" ? indices.at(-1) ?? -1 : indices[(current + (event.key === "ArrowDown" ? 1 : -1) + indices.length) % indices.length] ?? -1;
  popover.value?.panel?.querySelector("#" + CSS.escape(popover.value.panel.id + "-option-" + activeIndex.value))?.scrollIntoView({ block: "nearest" });
}
defineExpose({ focus: () => input.value?.focus(), blur: () => input.value?.blur(), open: () => { if (!props.disabled) visible.value = true; }, close: () => { visible.value = false; } });
</script>

<style scoped lang="scss">
.uiSelectRoot { min-width: 0; width: 100%; &.isInline { width: auto; :deep(.uiPopover), :deep(.popoverReference) { display: flex; width: 100%; } } }
.uiSelect {
  display: flex; align-items: center; width: 100%; min-width: 0; --controlHeight: var(--uiControlMedium); min-height: var(--controlHeight); padding: 0 10px 0 12px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle);
  &.sizeSmall { --controlHeight: var(--uiControlSmall); }
  &.sizeLarge { --controlHeight: var(--uiControlLarge); }
  &:focus-within { outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; }
  &.isError { border-color: var(--uiStatusError); }
  input { width: 100%; min-width: 0; min-height: calc(var(--controlHeight) - 2px); padding: 0; border: 0; outline: 0; color: var(--uiTextPrimary); background: transparent; font-size: var(--uiFontControl); &::placeholder { color: var(--uiTextMuted); } &[readonly] { cursor: pointer; } }
  button { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 24px; height: 28px; padding: 0; border: 0; border-radius: calc(var(--uiRadiusControl) / 2); appearance: none; background: transparent; color: var(--uiTextBody); font-size: 18px; line-height: 1; cursor: pointer; }
  &:has(input:disabled) { background: var(--uiStateDisabled); border-color: var(--uiBorderDefault); input, button { color: var(--uiStateDisabledText); cursor: not-allowed; } }
}
.selectOption {
  display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 10px; border-radius: var(--uiRadiusControl); cursor: pointer; font-size: var(--uiFontControl);
  span:first-child { min-width: 0; overflow-wrap: anywhere; }
  &.isActive:not(.isDisabled) { background: var(--uiSurfaceHover); }
  &.isSelected { background: var(--uiActionSoft); color: var(--uiTextPrimary); }
  &.isDisabled { color: var(--uiStateDisabledText); cursor: not-allowed; }
}
.optionGroup, .noOptions { padding: 8px 10px; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
.createOption { width: 100%; padding: 8px 10px; border: 0; border-radius: var(--uiRadiusControl); background: var(--uiActionSoft); color: var(--uiTextPrimary); text-align: left; cursor: pointer; }
.selectLoading { padding: 8px; .loadingIndicator { display: block; width: 16px; height: 16px; border: 2px solid var(--uiTextMuted); border-right-color: transparent; border-radius: 50%; animation: uiSelectSpin 700ms linear infinite; } }
@keyframes uiSelectSpin { to { transform: rotate(360deg); } }
</style>

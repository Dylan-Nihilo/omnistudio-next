<template>
  <div class="uiTabs">
    <div class="tabList" role="tablist" :aria-label="label" @keydown="handleKeydown">
      <button v-for="(option, index) in options" :id="tabId(index)" :key="valueKey(option.value)" :ref="element => tabs[index] = element as HTMLButtonElement | null" type="button" role="tab" :aria-selected="modelValue === option.value" :aria-controls="$slots.default ? panelId : undefined" :disabled="option.disabled" :tabindex="modelValue === option.value || (!hasSelection && index === firstEnabled) ? 0 : -1" @click="select(option.value)">{{ option.label }}</button>
    </div>
    <div v-if="$slots.default" :id="panelId" class="tabPanel" role="tabpanel" :aria-labelledby="activeIndex >= 0 ? tabId(activeIndex) : undefined" tabindex="0"><slot :value="modelValue" /></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUiId } from "../id";
import type { UiOption, UiValue } from "../types";
import { valueKey } from "../values";
const props = defineProps<{ modelValue?: UiValue; options: UiOption[]; label?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: UiValue]; change: [value: UiValue] }>();
const id = useUiId();
const panelId = "uiTabs-" + id + "-panel";
const tabs: (HTMLButtonElement | null)[] = [];
const activeIndex = computed(() => props.options.findIndex(option => option.value === props.modelValue));
const firstEnabled = computed(() => props.options.findIndex(option => !option.disabled));
const hasSelection = computed(() => activeIndex.value >= 0 && !props.options[activeIndex.value]?.disabled);
function tabId(index: number) { return "uiTabs-" + id + "-" + index; }
function select(value: UiValue) { if (props.options.find(option => option.value === value)?.disabled) return; emit("update:modelValue", value); emit("change", value); }
function handleKeydown(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const indices = props.options.flatMap((option, index) => option.disabled ? [] : [index]);
  const focused = tabs.indexOf(event.target as HTMLButtonElement);
  const index = event.key === "Home" ? indices[0] : event.key === "End" ? indices.at(-1) : indices[(indices.indexOf(focused) + (event.key === "ArrowRight" ? 1 : -1) + indices.length) % indices.length];
  if (index == null) return; tabs[index]?.focus(); select(props.options[index]!.value);
}
</script>

<style scoped lang="scss">
.uiTabs {
  min-width: 0;
  .tabList { display: flex; gap: 8px; overflow: auto; padding: 4px; border-bottom: 1px solid var(--uiBorderDefault); button { flex-shrink: 0; min-height: var(--uiControlMedium); padding: 8px 16px; border: 0; border-radius: var(--uiRadiusControl); color: var(--uiTextMuted); background: transparent; font: inherit; cursor: pointer; &[aria-selected="true"] { color: var(--uiTextPrimary); background: var(--uiActionSoft); } &:hover:not(:disabled) { background: var(--uiSurfaceHover); } &:disabled { color: var(--uiStateDisabledText); cursor: not-allowed; } } }
  .tabPanel { min-width: 0; padding-top: 20px; }
}
</style>

<template>
  <span class="uiTag" :class="toneClass"><span class="tagLabel"><slot /></span><button v-if="closable" type="button" :disabled="disabled" :aria-label="closeLabel" @click="emit('close')">×</button></span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UiTone } from "../types";
const props = withDefaults(defineProps<{ tone?: UiTone; closable?: boolean; disabled?: boolean; closeLabel?: string }>(), { tone: "neutral", closable: false, disabled: false, closeLabel: "移除" });
const emit = defineEmits<{ close: [] }>();
const toneClass = computed(() => "tone" + props.tone[0]!.toUpperCase() + props.tone.slice(1));
</script>

<style scoped lang="scss">
.uiTag {
  display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 26px; padding: 2px 8px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); color: var(--uiTextBody); background: var(--uiBackgroundSubtle); font-size: var(--uiFontControl);
  .tagLabel { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { width: 20px; height: 20px; padding: 0; border: 0; background: transparent; color: inherit; font-size: 16px; cursor: pointer; &:disabled { cursor: not-allowed; opacity: 0.5; } }
  &.toneSuccess { color: var(--uiStatusSuccess); background: var(--uiStatusSuccessSoft); }
  &.toneWarning { color: var(--uiStatusWarning); background: var(--uiStatusWarningSoft); }
  &.toneError { color: var(--uiStatusError); background: var(--uiStatusErrorSoft); }
}
</style>

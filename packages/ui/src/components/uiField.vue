<template>
  <div class="uiField">
    <label v-if="label" class="fieldLabel" :for="controlId">{{ label }}<span v-if="required" class="requiredMark" aria-hidden="true"> *</span></label>
    <slot :id="controlId" :describedBy="descriptionId" :invalid="!!error" :required="!!required" />
    <p v-if="error || help" :id="descriptionId" class="fieldMessage" :class="{ isError: error }" :role="error ? 'alert' : undefined">{{ error || help }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUiId } from "../id";
const props = defineProps<{ id?: string; label?: string; required?: boolean; error?: string; help?: string }>();
const localId = useUiId();
const controlId = computed(() => props.id || "uiField-" + localId);
const descriptionId = computed(() => props.error || props.help ? controlId.value + "-description" : undefined);
</script>

<style scoped lang="scss">
.uiField {
  display: flex; flex-direction: column; gap: 8px; min-width: 0;
  .fieldLabel { font-size: var(--uiFontControl); font-weight: 500; color: var(--uiTextBody); }
  .requiredMark { color: var(--uiStatusError); }
  .fieldMessage { margin: 0; font-size: var(--uiFontControl); color: var(--uiTextMuted); overflow-wrap: anywhere; &.isError { color: var(--uiStatusError); } }
}
</style>

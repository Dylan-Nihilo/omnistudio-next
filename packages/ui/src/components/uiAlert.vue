<template>
  <div class="uiAlert" :class="toneClass" :role="tone === 'error' ? 'alert' : 'status'">
    <div class="alertContent"><strong v-if="title">{{ title }}</strong><slot /></div><button v-if="closable" type="button" aria-label="关闭提示" @click="emit('close')">×</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UiTone } from "../types";
const props = withDefaults(defineProps<{ title?: string; tone?: UiTone; closable?: boolean }>(), { tone: "neutral", closable: false });
const emit = defineEmits<{ close: [] }>();
const toneClass = computed(() => "tone" + props.tone[0]!.toUpperCase() + props.tone.slice(1));
</script>

<style scoped lang="scss">
.uiAlert {
  display: flex; align-items: flex-start; gap: 16px; padding: 12px 16px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); color: var(--uiTextBody); background: var(--uiBackgroundSubtle);
  .alertContent { flex: 1; min-width: 0; overflow-wrap: anywhere; strong { display: block; font-weight: 500; } }
  button { flex-shrink: 0; width: 24px; height: 24px; padding: 0; border: 0; background: transparent; color: inherit; font-size: 20px; cursor: pointer; }
  &.toneSuccess { color: var(--uiStatusSuccess); background: var(--uiStatusSuccessSoft); }
  &.toneWarning { color: var(--uiStatusWarning); background: var(--uiStatusWarningSoft); }
  &.toneError { color: var(--uiStatusError); background: var(--uiStatusErrorSoft); }
}
</style>

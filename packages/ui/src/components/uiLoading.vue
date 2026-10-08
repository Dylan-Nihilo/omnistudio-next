<template>
  <div class="uiLoading" :aria-busy="loading || undefined">
    <div :inert="loading || undefined"><slot /></div>
    <div v-if="loading" class="loadingCover"><span class="loadingIndicator" aria-hidden="true" /><span v-if="label" role="status">{{ label }}</span></div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ loading: boolean; label?: string }>();
</script>

<style scoped lang="scss">
.uiLoading {
  position: relative;
  .loadingCover { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--uiTextBody); background: color-mix(in srgb, var(--uiBackgroundBase) 80%, transparent); border-radius: inherit; }
  .loadingIndicator { width: 22px; height: 22px; border: 2px solid var(--uiTextMuted); border-right-color: transparent; border-radius: 50%; animation: uiLoadingRotate 700ms linear infinite; }
}
@keyframes uiLoadingRotate { to { transform: rotate(360deg); } }
</style>

<template>
  <section class="uiEmpty"><h3 v-if="title">{{ title }}</h3><p v-if="description">{{ description }}</p><slot /></section>
</template>

<script setup lang="ts">
defineProps<{ title?: string; description?: string }>();
</script>

<style scoped lang="scss">
.uiEmpty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 32px 20px; text-align: center; h3 { margin: 0; font-size: var(--uiFontTitle); font-weight: 500; color: var(--uiTextPrimary); } p { margin: 0; max-width: 60ch; color: var(--uiTextMuted); overflow-wrap: anywhere; font-size: var(--uiFontBody); } }
</style>

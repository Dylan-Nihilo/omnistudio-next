<template>
  <section class="uiCard"><header v-if="title || $slots.header || $slots.actions" class="cardHeader"><slot name="header"><h3 v-if="title">{{ title }}</h3></slot><div v-if="$slots.actions" class="cardActions"><slot name="actions" /></div></header><div class="cardContent"><slot /></div></section>
</template>

<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<style scoped lang="scss">
.uiCard {
  min-width: 0; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised);
  .cardHeader { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--uiBorderDefault); h3 { margin: 0; font-size: var(--uiFontTitle); font-weight: 500; overflow-wrap: anywhere; } .cardActions { margin-inline-start: auto; } }
  .cardContent { min-width: 0; padding: 20px; }
}
</style>

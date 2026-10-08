<template>
  <div class="uiSkeleton" aria-hidden="true" :class="{ isAnimated: animated }"><span v-for="index in rows" :key="index" class="skeletonLine" /></div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ rows?: number; animated?: boolean }>(), { rows: 3, animated: true });
</script>

<style scoped lang="scss">
.uiSkeleton {
  display: flex; flex-direction: column; gap: 12px;
  .skeletonLine { display: block; height: 16px; border-radius: 4px; background: var(--uiStateDisabled); &:first-child { width: 40%; } &:last-child { width: 65%; } }
  &.isAnimated .skeletonLine { animation: uiSkeletonPulse 1.5s ease-in-out infinite; }
}
@keyframes uiSkeletonPulse { 50% { opacity: 0.45; } }
</style>

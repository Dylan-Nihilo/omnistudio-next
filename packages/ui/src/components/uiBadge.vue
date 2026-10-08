<template>
  <span class="uiBadge">
    <slot /><span v-if="!hidden" class="badgeValue" :class="{ isDot: dot }" :aria-label="label">{{ dot ? '' : displayValue }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
const props = withDefaults(defineProps<{ value?: string | number; max?: number; dot?: boolean; hidden?: boolean; label?: string }>(), { max: 99, dot: false, hidden: false });
const displayValue = computed(() => typeof props.value === "number" && props.value > props.max ? props.max + "+" : props.value);
</script>

<style scoped lang="scss">
.uiBadge {
  position: relative; display: inline-flex;
  .badgeValue { position: absolute; top: -6px; inset-inline-end: -8px; display: flex; align-items: center; justify-content: center; min-width: 18px; min-height: 18px; padding: 0 4px; border: 2px solid var(--uiBackgroundBase); border-radius: 99px; color: var(--uiTextOnAccent); background: var(--uiActionPrimary); font-size: 11px; &.isDot { width: 10px; min-width: 10px; height: 10px; min-height: 10px; padding: 0; } }
}
</style>

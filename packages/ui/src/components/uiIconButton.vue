<template>
  <uiButton v-bind="$attrs" class="uiIconButton" :icon="icon" :size="size" :variant="variant" :aria-label="label">
    <template v-if="$slots.default" #default><slot /></template>
  </uiButton>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import uiButton from "./uiButton.vue";
import type { UiSize, UiVariant } from "../theme";
defineOptions({ inheritAttrs: false });
withDefaults(defineProps<{ label: string; icon?: Component; size?: UiSize; variant?: UiVariant }>(), { size: "medium", variant: "ghost" });
</script>

<style scoped lang="scss">
.uiIconButton {
  flex-shrink: 0; width: var(--uiControlMedium); padding: 0;
  &.sizeSmall { width: var(--uiControlSmall); padding: 0; }
  &.sizeLarge { width: var(--uiControlLarge); padding: 0; }
}
</style>

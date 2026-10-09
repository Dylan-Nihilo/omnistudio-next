<template>
  <component
    :is="tag"
    class="uiButton"
    :class="[sizeClass, variantClass, { isLoading: loading, isDisabled: isDisabled }]"
    :type="tag === 'button' ? htmlType : undefined"
    :disabled="tag === 'button' ? isDisabled : undefined"
    :href="tag === 'a' && !isDisabled ? href : undefined"
    :aria-disabled="isDisabled || undefined"
    :aria-busy="loading || undefined"
    :tabindex="tag === 'a' && isDisabled ? -1 : undefined"
    @click="handleClick">
    <span v-if="loading" class="loadingIndicator" aria-hidden="true" />
    <component v-else-if="icon" :is="icon" class="buttonIcon" :size="16" aria-hidden="true" />
    <span v-if="$slots.default" class="buttonLabel"><slot /></span>
  </component>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";
import type { UiSize, UiVariant } from "../theme";

const props = withDefaults(defineProps<{
  variant?: UiVariant; size?: UiSize; disabled?: boolean; loading?: boolean;
  htmlType?: "button" | "submit" | "reset"; tag?: "button" | "a"; href?: string; icon?: Component;
}>(), { variant: "primary", size: "medium", htmlType: "button", tag: "button", disabled: false, loading: false });
const emit = defineEmits<{ click: [event: MouseEvent] }>();
const isDisabled = computed(() => props.disabled || props.loading);
const sizeClass = computed(() => "size" + props.size.charAt(0).toUpperCase() + props.size.slice(1));
const variantClass = computed(() => "variant" + props.variant.charAt(0).toUpperCase() + props.variant.slice(1));
function handleClick(event: MouseEvent) {
  if (isDisabled.value) { event.preventDefault(); event.stopPropagation(); return; }
  emit("click", event);
}
</script>

<style scoped lang="scss">
.uiButton {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--uiSpace8);
  min-width: 0;
  max-width: 100%;
  min-height: var(--uiControlMedium);
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: var(--uiRadiusControl);
  font-size: var(--uiFontControl);
  font-weight: 500;
  line-height: 1.4;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--uiMotionDuration) var(--uiMotionEase), border-color var(--uiMotionDuration) var(--uiMotionEase), color var(--uiMotionDuration) var(--uiMotionEase);

  &.sizeSmall { min-height: var(--uiControlSmall); padding-inline: 12px; }
  &.sizeLarge { min-height: var(--uiControlLarge); padding-inline: 20px; }
  &.variantPrimary { color: var(--uiTextOnAccent); background: var(--uiActionPrimary); }
  &.variantPrimary:hover:not(.isDisabled) { background: var(--uiActionHover); }
  &.variantPrimary:active:not(.isDisabled) { background: var(--uiActionPressed); color: var(--uiTextOnPressedAccent); }
  &.variantSecondary { color: var(--uiTextPrimary); background: var(--uiBackgroundSubtle); border-color: var(--uiBorderControl); }
  &.variantGhost { color: var(--uiTextBody); background: transparent; }
  &.variantSecondary:hover:not(.isDisabled), &.variantGhost:hover:not(.isDisabled) { background: var(--uiSurfaceHover); }
  &.variantDanger { color: var(--uiStatusError); background: var(--uiStatusErrorSoft); }
  &.variantDanger:hover:not(.isDisabled) { border-color: var(--uiStatusError); }
  &.isDisabled { cursor: not-allowed; }
  &.isDisabled:not(.isLoading), &:disabled:not(.isLoading) { color: var(--uiStateDisabledText); background: var(--uiStateDisabled); border-color: transparent; }
  &.isLoading { cursor: wait; opacity: 1; }

  .loadingIndicator {
    width: 14px; height: 14px; border: 1.5px solid currentColor;
    border-right-color: transparent; border-radius: 50%; animation: uiSpin 700ms linear infinite;
  }
  .buttonIcon { display: block; flex-shrink: 0; }
  .buttonLabel {
    min-width: 0; overflow: hidden; text-overflow: ellipsis;
    &:has(> svg) { display: inline-flex; align-items: center; gap: inherit; }
    :deep(> svg) { display: block; flex-shrink: 0; }
    :deep(> span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  }
}
@keyframes uiSpin { to { transform: rotate(360deg); } }
</style>

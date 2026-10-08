<template>
  <dialog ref="dialog" class="uiTour" role="dialog" :aria-labelledby="titleId" @wheel.stop @gesturestart.stop @gesturechange.stop @gestureend.stop @cancel.prevent="close" @close="visible = false; emit('close')">
    <div v-if="spotlight" class="tourSpotlight" :style="spotlight" aria-hidden="true" />
    <div v-else class="tourShade" aria-hidden="true" />
    <section ref="card" class="tourCard" :style="cardStyle">
      <header><h2 :id="titleId">{{ step?.title }}</h2><uiButton variant="ghost" aria-label="关闭引导" @click="close">×</uiButton></header>
      <p v-if="step?.description">{{ step.description }}</p>
      <footer><span>{{ currentIndex + 1 }} / {{ steps.length }}</span><uiButton variant="secondary" :disabled="currentIndex <= 0" @click="current = currentIndex - 1">上一步</uiButton><uiButton @click="next">{{ currentIndex >= steps.length - 1 ? finishText : '下一步' }}</uiButton></footer>
    </section>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useUiId } from "../id";
import { autoUpdate, computePosition, flip, offset, shift } from "@floating-ui/dom";
import type { CSSProperties } from "vue";
import uiButton from "./uiButton.vue";
import type { UiTourStep } from "../types";
const props = withDefaults(defineProps<{ steps: UiTourStep[]; finishText?: string }>(), { finishText: "开始使用" });
const visible = defineModel<boolean>({ default: false });
const current = defineModel<number>("current", { default: 0 });
const emit = defineEmits<{ close: []; complete: []; change: [index: number] }>();
const dialog = ref<HTMLDialogElement>(), card = ref<HTMLElement>();
const spotlight = ref<CSSProperties>(), cardStyle = ref<CSSProperties>();
const titleId = "uiTour-" + useUiId();
const currentIndex = computed(() => Math.min(Math.max(0, current.value), Math.max(0, props.steps.length - 1)));
const step = computed(() => props.steps[currentIndex.value]);
watch([dialog, card, visible, step], async ([element, panel, opened, activeStep], _previous, onCleanup) => {
  if (!element || !panel) return;
  if (!opened || !activeStep) { if (element.open) element.close(); if (!activeStep) visible.value = false; return; }
  if (!element.open) element.showModal();
  const target = typeof activeStep.target === "function" ? activeStep.target() : activeStep.target;
  let cancelled = false;
  let cleanup: (() => void) | undefined;
  onCleanup(() => { cancelled = true; cleanup?.(); });
  if (!target) { spotlight.value = undefined; cardStyle.value = { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }; return; }
  target.scrollIntoView({ block: "nearest", inline: "nearest" }); await nextTick();
  if (cancelled) return;
  cleanup = autoUpdate(target, panel, async () => {
    const bounds = target.getBoundingClientRect();
    spotlight.value = { left: bounds.left - 4 + "px", top: bounds.top - 4 + "px", width: bounds.width + 8 + "px", height: bounds.height + 8 + "px" };
    const { x, y } = await computePosition(target, panel, { placement: "bottom-start", strategy: "fixed", middleware: [offset(12), flip({ padding: 12 }), shift({ padding: 12 })] });
    if (!cancelled) cardStyle.value = { left: x + "px", top: y + "px" };
  });
}, { flush: "post" });
watch(currentIndex, value => emit("change", value));
function close() { visible.value = false; }
function next() { if (currentIndex.value >= props.steps.length - 1) { visible.value = false; emit("complete"); } else current.value = currentIndex.value + 1; }
onBeforeUnmount(() => dialog.value?.close());
</script>

<style lang="scss">
html:has(dialog.uiTour:modal) { overflow: hidden; }
</style>

<style scoped lang="scss">
.uiTour {
  width: 100vw; height: 100dvh; max-width: none; max-height: none; padding: 0; margin: 0; border: 0; background: transparent; color: var(--uiTextPrimary); font: inherit; overflow: hidden;
  &::backdrop { background: transparent; }
  .tourSpotlight { position: fixed; border: 2px solid var(--uiBorderFocus); border-radius: var(--uiRadiusControl); box-shadow: 0 0 0 100vmax color-mix(in srgb, var(--uiOverlayScrim) 72%, transparent); }
  .tourShade { position: fixed; inset: 0; background: color-mix(in srgb, var(--uiOverlayScrim) 72%, transparent); }
  .tourCard { position: fixed; width: min(380px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 20px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); box-shadow: var(--uiShadowDialog); overflow: auto; header { display: flex; align-items: flex-start; gap: 12px; h2 { flex: 1; margin: 0; font-size: var(--uiFontTitle); overflow-wrap: anywhere; } } p { margin: 12px 0 20px; color: var(--uiTextBody); overflow-wrap: anywhere; } footer { display: flex; align-items: center; gap: 8px; span { flex: 1; color: var(--uiTextMuted); font-size: var(--uiFontControl); } } }
}
</style>

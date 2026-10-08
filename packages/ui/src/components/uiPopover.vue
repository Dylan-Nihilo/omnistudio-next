<template>
  <span class="uiPopover" :class="{ isBlock: block }" @keydown.esc="handleEscape">
    <span ref="reference" class="popoverReference" @pointerdown="pointerOpen = !!panel?.matches(':popover-open')" @click="handleClick" @contextmenu="handleContextMenu" @pointerenter="enter" @pointerleave="leave" @focusin="enter" @focusout="handleFocusOut">
      <slot name="reference" :toggle="toggle" :open="open" :close="close" :visible="visible" :panelId="panelId" :triggerAttrs="{ 'aria-controls': panelId, 'aria-expanded': visible, 'aria-haspopup': role === 'tooltip' ? undefined : role }" />
    </span>
    <div ref="panel" v-bind="$attrs" :id="panelId" class="popoverPanel" :popover="trigger === 'manual' || trigger === 'contextmenu' ? 'manual' : 'auto'" :role="role" :aria-labelledby="title ? panelId + 'Title' : ($attrs['aria-labelledby'] as string | undefined)" :aria-label="($attrs['aria-label'] as string | undefined) ?? (!title && role !== 'tooltip' ? popupLabel : undefined)" :style="panelStyle" @toggle="handleToggle" @pointerenter="enter" @pointerleave="leave" @focusout="handleFocusOut" @wheel.stop @gesturestart.stop @gesturechange.stop @gestureend.stop>
      <h3 v-if="title" :id="panelId + 'Title'" class="popoverTitle">{{ title }}</h3><slot :close="close" />
    </div>
  </span>
</template>

<script lang="ts">
const openPopoverPanels: HTMLElement[] = [];
</script>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import { useUiId } from "../id";
import { autoUpdate, computePosition, flip, offset, shift, size, type VirtualElement } from "@floating-ui/dom";
import type { CSSProperties } from "vue";
import type { UiPlacement } from "../types";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ trigger?: "click" | "hover" | "manual" | "contextmenu"; placement?: UiPlacement; offset?: number; width?: number | string; matchWidth?: boolean; disabled?: boolean; block?: boolean; role?: "dialog" | "menu" | "listbox" | "tooltip"; showAfter?: number; hideAfter?: number; anchor?: HTMLElement | VirtualElement; title?: string }>(), { trigger: "click", placement: "bottom-start", offset: 8, matchWidth: false, disabled: false, block: false, role: "dialog", showAfter: 0, hideAfter: 120 });
const visible = defineModel<boolean>("visible", { default: false });
const emit = defineEmits<{ show: []; hide: [] }>();
const reference = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const panelId = "uiPopover-" + useUiId();
const panelStyle = ref<CSSProperties>({});
const pointerOpen = ref(false);
const popupLabel = ref("");
let timer: ReturnType<typeof setTimeout> | undefined;
let previousFocus: HTMLElement | null = null;
let restoringFocus = false;
const target = computed(() => props.anchor ?? reference.value);
watch([target, panel, visible, () => props.disabled, () => props.placement, () => props.width, () => props.trigger], ([anchor, element, opened], _previous, onCleanup) => {
  if (!element || !anchor) return;
  if (!opened || props.disabled) {
    clearTimeout(timer);
    restoringFocus = true;
    if (element.matches(":popover-open")) element.hidePopover();
    queueMicrotask(() => { restoringFocus = false; });
    if (props.disabled) visible.value = false;
    return;
  }
  previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const control = reference.value?.querySelector<HTMLElement>("button,input,[tabindex]");
  popupLabel.value = control?.getAttribute("aria-label") || control?.getAttribute("placeholder") || control?.textContent?.trim() || (props.role === "menu" ? "菜单" : props.role === "listbox" ? "选项" : "弹出内容");
  if (!element.matches(":popover-open")) element.showPopover();
  openPopoverPanels.push(element);
  const dismissOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || openPopoverPanels.findLast(item => item.matches(":popover-open")) !== element) return;
    const modal = document.activeElement?.closest("dialog:modal");
    if (modal && !modal.contains(element)) return;
    // WebKit otherwise dismisses the auto popover and cancels its parent dialog in the same keypress.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.isComposing && event.keyCode !== 229) close();
  };
  window.addEventListener("keydown", dismissOnEscape, true);
  const dismissOutside = (event: PointerEvent) => {
    const node = event.target;
    if (!(node instanceof Node) || element.contains(node) || reference.value?.contains(node) || anchor instanceof HTMLElement && anchor.contains(node)) return;
    close();
  };
  const manual = props.trigger === "manual" || props.trigger === "contextmenu";
  if (manual) document.addEventListener("pointerdown", dismissOutside, true);
  let cancelled = false;
  const cleanup = autoUpdate(anchor, element, async () => {
    const { x, y } = await computePosition(anchor, element, {
      placement: props.placement, strategy: "fixed",
      middleware: [offset(props.offset), flip({ padding: 8 }), shift({ padding: 8 }), size({ padding: 8, apply({ availableHeight, rects, elements }) {
        elements.floating.style.maxHeight = Math.max(0, availableHeight) + "px";
        if (props.matchWidth) elements.floating.style.width = rects.reference.width + "px";
      } })],
    });
    if (cancelled || !visible.value) return;
    panelStyle.value = { left: x + "px", top: y + "px", width: props.matchWidth ? element.style.width : typeof props.width === "number" ? props.width + "px" : props.width };
  });
  onCleanup(() => {
    cancelled = true;
    cleanup();
    window.removeEventListener("keydown", dismissOnEscape, true);
    const index = openPopoverPanels.indexOf(element);
    if (index >= 0) openPopoverPanels.splice(index, 1);
    if (manual) document.removeEventListener("pointerdown", dismissOutside, true);
  });
}, { flush: "post" });
function open() { clearTimeout(timer); if (!props.disabled) visible.value = true; }
function close() { clearTimeout(timer); visible.value = false; }
function handleEscape(event: KeyboardEvent) {
  if (!visible.value) return;
  event.stopPropagation();
  if (event.isComposing || event.keyCode === 229) { event.preventDefault(); return; }
  close();
}
function toggle(event?: MouseEvent) { if (props.disabled) return; visible.value = event && event.detail > 0 ? !pointerOpen.value : !visible.value; }
function handleClick(event: MouseEvent) { if (props.trigger === "click") toggle(event); }
function handleContextMenu(event: MouseEvent) { if (props.trigger !== "contextmenu") return; event.preventDefault(); open(); }
function enter() { if (props.trigger !== "hover" || restoringFocus) return; clearTimeout(timer); timer = setTimeout(open, props.showAfter); }
function leave() { if (props.trigger !== "hover") return; clearTimeout(timer); timer = setTimeout(close, props.hideAfter); }
function handleFocusOut(event: FocusEvent) { if (panel.value?.contains(event.relatedTarget as Node) || reference.value?.contains(event.relatedTarget as Node)) return; leave(); }
async function handleToggle(event: ToggleEvent) {
  const opened = event.newState === "open";
  if (panel.value?.matches(":popover-open") !== opened) return;
  visible.value = opened;
  if (opened) { await nextTick(); emit("show"); }
  else { clearTimeout(timer); restoringFocus = true; if (panel.value?.contains(document.activeElement)) previousFocus?.focus(); restoringFocus = false; emit("hide"); }
}
onDeactivated(close);
onBeforeUnmount(() => { clearTimeout(timer); if (panel.value?.matches(":popover-open")) panel.value.hidePopover(); });
defineExpose({ open, close, toggle, panel, reference });
</script>

<style scoped lang="scss">
.uiPopover {
  display: inline-flex; min-width: 0;
  .popoverReference { display: inline-flex; min-width: 0; max-width: 100%; }
  &.isBlock { display: flex; width: 100%; .popoverReference { display: flex; width: 100%; } }
}
.popoverPanel {
  position: fixed; inset: auto; margin: 0; max-width: calc(100vw - 16px); padding: 12px;
  border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl);
  color: var(--uiTextPrimary); background: var(--uiSurfaceRaised); font: inherit;
  box-shadow: var(--uiShadowPopover); overflow: auto; overscroll-behavior: contain;
  .popoverTitle { margin: 0 0 12px; font-size: var(--uiFontTitle); font-weight: 500; overflow-wrap: anywhere; }
}
</style>

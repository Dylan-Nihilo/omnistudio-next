<template>
  <dialog
    ref="dialog"
    class="uiDialog"
    :class="{ isFullscreen: fullscreenModel }"
    role="dialog"
    :style="{ width: fullscreenModel ? '100dvw' : typeof width === 'number' ? width + 'px' : width }"
    :aria-labelledby="titleId"
    @cancel.prevent.stop="handleCancel"
    @close="handleClosed"
    @pointerdown="handlePointerDown"
    @click.self="handleBackdropClick"
    @keydown.esc.stop="handleEscape"
    @focusout="handleFocusOut"
    @wheel.stop
    @gesturestart.stop
    @gesturechange.stop
    @gestureend.stop>
    <slot name="header" :titleId="titleId"><header class="dialogHeader">
      <h2 :id="titleId" class="dialogTitle">{{ title }}</h2>
      <div class="dialogHeaderActions">
        <uiButton
          v-if="showFullscreen"
          class="fullscreenButton"
          variant="ghost"
          size="small"
          :aria-label="fullscreenModel ? '退出全屏' : '全屏'"
          :title="fullscreenModel ? '退出全屏' : '全屏'"
          @click="fullscreenModel = !fullscreenModel">
          <svg v-if="!fullscreenModel" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6m0 0v6m0-6-7 7m17-11h-6m0 0V4m0 6 7-7m-7 17v-6m0 0h6m-6 0 7 7M10 4v6m0 0H4m6 0L3 3"/></svg>
        </uiButton>
        <uiButton v-if="showClose" class="closeButton" variant="ghost" size="small" :disabled="closePending" aria-label="关闭弹窗" @click="requestClose">×</uiButton>
      </div>
    </header></slot>
    <div v-if="!destroyOnClose || visible" class="dialogBody"><slot /></div>
    <footer v-if="$slots.footer && (!destroyOnClose || visible)" class="dialogFooter"><slot name="footer" /></footer>
  </dialog>
</template>

<script setup lang="ts">
import { onActivated, onBeforeUnmount, onDeactivated, ref, watch } from "vue";
import { useUiId } from "../id";
import uiButton from "./uiButton.vue";

const props = withDefaults(defineProps<{
  title: string;
  width?: string | number;
  showFullscreen?: boolean;
  showClose?: boolean;
  closeOnClickModal?: boolean;
  closeOnPressEscape?: boolean;
  destroyOnClose?: boolean;
  beforeClose?: (done: () => void) => void | Promise<void>;
}>(), {
  width: 520,
  showFullscreen: false,
  showClose: true,
  closeOnClickModal: true,
  closeOnPressEscape: true,
  destroyOnClose: false,
});
const fullscreenModel = defineModel<boolean>("fullscreen", { default: false });
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ opened: []; close: []; closed: [] }>();
const dialog = ref<HTMLDialogElement>();
const closePending = ref(false);
const titleId = "uiDialog-" + useUiId();
let pointerStartedOutside = false;
let closeRevision = 0;
let inactive = false;
onDeactivated(() => { inactive = true; closeRevision++; closePending.value = false; dialog.value?.close(); });
onActivated(() => { inactive = false; if (visible.value && dialog.value && !dialog.value.open) { dialog.value.showModal(); emit("opened"); } });

watch(visible, () => {
  closeRevision++;
  closePending.value = false;
}, { flush: "sync" });

watch([dialog, visible], ([element, open]) => {
  if (!element || inactive) return;
  if (open && !element.open) {
    element.showModal();
    emit("opened");
  } else if (!open && element.open) {
    element.close();
  }
}, { flush: "post" });

onBeforeUnmount(() => {
  closeRevision++;
  dialog.value?.close();
});

async function requestClose() {
  if (closePending.value || !visible.value) return;
  const revision = ++closeRevision;
  // A delayed decision must not close a later opening of this dialog.
  const done = () => { if (revision === closeRevision) visible.value = false; };
  if (!props.beforeClose) {
    done();
    return;
  }
  closePending.value = true;
  try {
    await props.beforeClose(done);
  } finally {
    if (revision === closeRevision) closePending.value = false;
  }
}

function handleClosed() {
  if (inactive || dialog.value?.open) return;
  visible.value = false;
  emit("close");
  emit("closed");
}

function handleCancel() {
  if (props.closeOnPressEscape) requestClose();
}

function handleEscape(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function handleFocusOut(event: FocusEvent) {
  if (event.relatedTarget instanceof Node && dialog.value?.contains(event.relatedTarget)) return;
  queueMicrotask(() => {
    const element = dialog.value;
    if (!visible.value || !element?.matches(":modal")) return;
    const focused = document.activeElement;
    if (!element.contains(focused) && !focused?.closest("dialog:modal")) element.focus({ preventScroll: true });
  });
}

function isOutside(event: MouseEvent) {
  const bounds = dialog.value!.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
}

function handlePointerDown(event: PointerEvent) {
  pointerStartedOutside = event.target === dialog.value && event.button === 0 && isOutside(event);
}

function handleBackdropClick(event: MouseEvent) {
  if (props.closeOnClickModal && pointerStartedOutside && isOutside(event)) requestClose();
  pointerStartedOutside = false;
}

defineExpose({ close: requestClose });
</script>

<style lang="scss">
html:has(dialog.uiDialog:modal) { overflow: hidden; }
</style>

<style scoped lang="scss">
.uiDialog {
  max-width: calc(100vw - 32px);
  max-height: calc(100dvh - 32px);
  height: fit-content;
  padding: 0;
  border: 1px solid var(--uiBorderDefault);
  border-radius: var(--uiRadiusDialog);
  background: var(--uiSurfaceRaised);
  color: var(--uiTextPrimary);
  font: inherit;
  box-shadow: var(--uiShadowDialog);
  overflow: hidden;

  &[open] { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
  &.isFullscreen { max-width: 100dvw; max-height: 100dvh; height: 100dvh; margin: 0; border-radius: 0; }
  &::backdrop { background: color-mix(in srgb, var(--uiOverlayScrim) 72%, transparent); }

  .dialogHeader {
    display: flex;
    align-items: flex-start;
    gap: var(--uiSpace16);
    padding: var(--uiSpace24) var(--uiSpace24) var(--uiSpace16);
    .dialogTitle { flex: 1; min-width: 0; margin: 0; font-size: var(--uiFontHeading); line-height: 1.6; overflow-wrap: anywhere; }
    .dialogHeaderActions { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .fullscreenButton {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      svg { display: block; }
    }
    .closeButton { flex-shrink: 0; width: 32px; height: 32px; padding: 0; font-size: 24px; line-height: 1; }
  }
  .dialogBody { min-height: 0; padding: 0 var(--uiSpace24); overflow: auto; overscroll-behavior: contain; }
  .dialogFooter {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--uiSpace8);
    padding: var(--uiSpace24);
  }
  &:not(:has(.dialogFooter)) .dialogBody { padding-bottom: var(--uiSpace24); }
}
</style>

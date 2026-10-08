<template>
  <dialog
    ref="dialog"
    class="uiDialog"
    :class="{ isFullscreen: fullscreen }"
    role="dialog"
    :style="{ width: fullscreen ? '100dvw' : typeof width === 'number' ? width + 'px' : width }"
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
      <uiButton v-if="showClose" class="closeButton" variant="ghost" size="small" :disabled="closePending" aria-label="关闭弹窗" @click="requestClose">×</uiButton>
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
  fullscreen?: boolean;
  showClose?: boolean;
  closeOnClickModal?: boolean;
  closeOnPressEscape?: boolean;
  destroyOnClose?: boolean;
  beforeClose?: (done: () => void) => void | Promise<void>;
}>(), {
  width: 520,
  fullscreen: false,
  showClose: true,
  closeOnClickModal: true,
  closeOnPressEscape: true,
  destroyOnClose: false,
});
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

function handleFocusOut() {
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
    .closeButton { flex-shrink: 0; width: 32px; padding: 0; font-size: 24px; }
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

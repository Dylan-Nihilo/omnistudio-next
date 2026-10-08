<template>
  <div ref="root" class="uiFeedbackProvider">
    <slot :feedback="feedback" />
    <teleport :to="hostTarget ?? root ?? 'body'" :disabled="!hostTarget">
      <div ref="messageHost" class="feedbackMessageHost" popover="manual">
        <uiAlert v-for="toast in feedback.toasts.filter(item => item.kind === 'message')" :key="toast.id" :tone="toast.tone" :title="toast.title" :closable="toast.showClose || toast.duration === 0" @close="closeToast(toast.id)" @pointerenter="feedback.pause(toast.id)" @pointerleave="feedback.resume(toast.id)"><uiContentRenderer :content="toast.message" /><span v-if="toast.repeatCount > 1" class="repeatCount" :aria-label="`重复 ${toast.repeatCount} 次`"> ×{{ toast.repeatCount }}</span></uiAlert>
      </div>
      <div ref="notificationHost" class="feedbackNotificationHost" popover="manual">
        <uiAlert v-for="toast in feedback.toasts.filter(item => item.kind === 'notification')" :key="toast.id" :tone="toast.tone" :title="toast.title" closable @close="closeToast(toast.id)" @pointerenter="feedback.pause(toast.id)" @pointerleave="feedback.resume(toast.id)"><uiContentRenderer :content="toast.message" /><span v-if="toast.repeatCount > 1" class="repeatCount" :aria-label="`重复 ${toast.repeatCount} 次`"> ×{{ toast.repeatCount }}</span></uiAlert>
      </div>
      <uiDialog v-if="request" :key="request.id" :modelValue="true" :title="request.title" :width="480" :showClose="!validating" :closeOnClickModal="request.closeOnClickModal ?? false" :closeOnPressEscape="(request.closeOnPressEscape ?? true) && !validating" @update:modelValue="value => !value && finish('close')">
        <div class="boxMessage"><uiContentRenderer :content="request.message" /></div>
        <uiField v-if="request.kind === 'prompt'" class="boxField" :label="request.title" :error="inputError">
          <template #default="{ id, describedBy, invalid }"><uiInput ref="promptInput" :id="id" v-model="inputValue" :type="request.inputType" :disabled="validating" :placeholder="request.inputPlaceholder" :error="invalid" :aria-describedby="describedBy" autofocus @keydown.enter.prevent="!$event.isComposing && confirm()" /></template>
        </uiField>
        <template #footer>
          <uiButton v-if="request.kind !== 'alert'" variant="secondary" :disabled="validating" @click="finish('cancel')">{{ request.cancelButtonText ?? '取消' }}</uiButton>
          <uiButton :variant="request.danger ? 'danger' : 'primary'" :loading="validating" @click="confirm">{{ request.confirmButtonText ?? '确定' }}</uiButton>
        </template>
      </uiDialog>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, watch } from "vue";
import uiAlert from "./uiAlert.vue";
import uiDialog from "./uiDialog.vue";
import uiButton from "./uiButton.vue";
import uiField from "./uiField.vue";
import uiInput from "./uiInput.vue";
import uiContentRenderer from "./uiContentRenderer";
import { createUiFeedback, uiFeedbackKey, type UiFeedback } from "../feedback";
const props = defineProps<{ feedback?: UiFeedback }>();
const feedback = props.feedback ?? createUiFeedback();
provide(uiFeedbackKey, feedback);
const root = ref<HTMLElement>();
const messageHost = ref<HTMLElement>();
const notificationHost = ref<HTMLElement>();
const hostTarget = ref<HTMLElement | null>(null);
const request = computed(() => feedback.box.value);
const promptInput = ref<InstanceType<typeof uiInput>>();
const inputValue = ref("");
const inputError = ref("");
const validating = ref(false);
let revision = 0;
let observer: MutationObserver | undefined;
function chooseHost(origin?: HTMLElement) {
  const modal = origin?.closest<HTMLElement>("dialog:modal");
  hostTarget.value = modal && root.value?.contains(modal) ? modal : null;
  observer?.disconnect();
  if (hostTarget.value) {
    observer = new MutationObserver(() => {
      if (hostTarget.value?.isConnected) return;
      hostTarget.value = null; observer?.disconnect();
      if (request.value) feedback.finish(request.value.id, "close");
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
watch(request, async value => {
  revision++; validating.value = false; inputValue.value = value?.inputValue ?? ""; inputError.value = "";
  if (value?.origin && !value.origin.isConnected) { feedback.finish(value.id, "close"); return; }
  if (value) chooseHost(value.origin);
  await nextTick(); if (value?.kind === "prompt") promptInput.value?.focus();
}, { flush: "post" });
watch([() => feedback.toasts.map(toast => toast.id).join(","), hostTarget], async () => {
  if (!request.value && feedback.toasts.length) chooseHost(feedback.toasts.at(-1)?.origin);
  await nextTick();
  for (const [host, kind] of [[messageHost.value, "message"], [notificationHost.value, "notification"]] as const) {
    if (!host) continue;
    const show = feedback.toasts.some(toast => toast.kind === kind);
    if (show && !host.matches(":popover-open")) host.showPopover();
    else if (!show && host.matches(":popover-open")) host.hidePopover();
  }
}, { flush: "post" });
function closeToast(id: number) { feedback.closeToast(id); }
function finish(action: "confirm" | "cancel" | "close") { if (request.value) feedback.finish(request.value.id, action, inputValue.value); }
async function confirm() {
  if (!request.value || validating.value) return;
  const current = request.value, version = revision;
  validating.value = true; inputError.value = "";
  try {
    if (current.kind === "prompt") {
      const validPattern = !current.inputPattern || new RegExp(current.inputPattern.source, current.inputPattern.flags).test(inputValue.value);
      const result = await current.inputValidator?.(inputValue.value);
      if (!validPattern || result === false || typeof result === "string") {
        inputError.value = typeof result === "string" ? result : current.inputErrorMessage ?? "请输入有效内容";
        promptInput.value?.focus(); return;
      }
    }
    if (version === revision) finish("confirm");
  } catch (error) { if (version === revision) inputError.value = error instanceof Error ? error.message : "校验失败"; }
  finally { if (version === revision) { validating.value = false; await nextTick(); if (inputError.value) promptInput.value?.focus(); } }
}
onBeforeUnmount(() => { revision++; observer?.disconnect(); feedback.clear(); });
defineExpose({ feedback });
</script>

<style scoped lang="scss">
.uiFeedbackProvider { min-width: 0; }
.feedbackMessageHost, .feedbackNotificationHost {
  position: fixed; inset: auto; top: 20px; margin: 0; padding: 0; border: 0; background: transparent; color: var(--uiTextPrimary); font: inherit; overflow: visible;
  &:popover-open { display: flex; flex-direction: column; gap: 12px; }
}
.feedbackMessageHost { left: 50%; transform: translateX(-50%); width: max-content; max-width: min(600px, calc(100vw - 32px)); }
.feedbackNotificationHost { right: 20px; width: min(360px, calc(100vw - 32px)); }
.repeatCount { white-space: nowrap; font-variant-numeric: tabular-nums; }
.boxMessage { overflow-wrap: anywhere; white-space: pre-wrap; }
.boxField { margin-top: 20px; }
</style>

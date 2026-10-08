<template>
  <uiPopover v-model:visible="visible" :width="width" @show="settled = false" @hide="handleHide">
    <template #reference="slotProps"><slot name="reference" v-bind="slotProps" /></template>
    <p class="confirmTitle">{{ title }}</p>
    <div class="confirmActions"><uiButton variant="secondary" size="small" :disabled="pending" @click="cancel">{{ cancelButtonText }}</uiButton><uiButton size="small" :variant="danger ? 'danger' : 'primary'" :loading="pending" @click="confirm">{{ confirmButtonText }}</uiButton></div>
  </uiPopover>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import uiPopover from "./uiPopover.vue";
import uiButton from "./uiButton.vue";
const props = withDefaults(defineProps<{ title: string; width?: number; confirmButtonText?: string; cancelButtonText?: string; danger?: boolean; beforeConfirm?: () => boolean | void | Promise<boolean | void> }>(), { width: 280, confirmButtonText: "确定", cancelButtonText: "取消", danger: false });
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const visible = defineModel<boolean>("visible", { default: false });
const pending = ref(false);
const settled = ref(false);
let revision = 0;
watch(visible, () => { revision++; pending.value = false; }, { flush: "sync" });
async function confirm() {
  if (pending.value) return;
  const current = revision;
  pending.value = true;
  try {
    if (await props.beforeConfirm?.() === false || current !== revision) return;
    settled.value = true; emit("confirm"); visible.value = false;
  } finally { if (current === revision) pending.value = false; }
}
function cancel() { if (pending.value) return; settled.value = true; emit("cancel"); visible.value = false; }
function handleHide() { if (!settled.value) emit("cancel"); }
</script>

<style scoped lang="scss">
.confirmTitle { margin: 0 0 16px; overflow-wrap: anywhere; }
.confirmActions { display: flex; justify-content: flex-end; gap: 8px; }
</style>

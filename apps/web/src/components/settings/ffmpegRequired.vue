<template>
  <uiDialog v-model="visible" title="配置 FFmpeg" :width="680" destroyOnClose>
    <uiAlert class="installationHint" title="安装完成后，请重新发起刚才的操作。" />
    <ffmpeg v-if="visible && auth.isRoot" :downloadOnOpen="true" />
  </uiDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { uiDialog, uiAlert, useUiFeedback } from "@omnistudio-next/ui";
import { useAuthStore } from "@/stores/auth";
import ffmpeg from "./panels/pluginMarket/ffmpeg.vue";
const auth = useAuthStore();
const feedback = useUiFeedback();
const visible = ref(false);
let pending = false;
watch(() => auth.isAuthenticated ? auth.user?.id : undefined, (userId, _previous, onCleanup) => {
  visible.value = false;
  if (!userId) return;
  const events = new EventSource(`/api/ffmpeg/events?accountId=${encodeURIComponent(userId)}`);
  onCleanup(() => events.close());
  events.onmessage = async event => {
    let data: { type?: string };
    try { data = JSON.parse(event.data); } catch { return; }
    if (data?.type !== "required" || pending || visible.value) return;
    if (!auth.isRoot) { feedback.message({ tone: "error", message: "当前操作需要 FFmpeg，请联系 root 管理员配置后重试。" }); return; }
    pending = true;
    try {
      await feedback.confirm("当前操作需要 FFmpeg，但尚未检测到可用版本。是否下载并安装？", "需要 FFmpeg", { confirmButtonText: "下载并安装", cancelButtonText: "暂不下载", closeOnClickModal: false });
      if (events.readyState !== EventSource.CLOSED && auth.user?.id === userId && auth.isRoot) visible.value = true;
    } catch { }
    finally { pending = false; }
  };
}, { immediate: true });
</script>

<style scoped>
.installationHint { margin-bottom: 12px; }
</style>

<template>
  <uiDialog v-model="visible" title="FFmpeg" :width="680" destroyOnClose>
    <uiAlert class="installationHint" title="安装完成后，请重新发起刚才的操作。" />
    <ffmpeg v-if="visible" :downloadOnOpen="true" />
  </uiDialog>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { uiDialog, uiAlert, useUiFeedback } from "@toonflow/ui";
import ffmpeg from "./panels/pluginMarket/ffmpeg.vue";

const feedback = useUiFeedback();
const visible = ref(false);
let pending = false;
const events = new EventSource("/api/ffmpeg/events");
events.onmessage = async event => {
  let data: { type?: string };
  try { data = JSON.parse(event.data); }
  catch { return; }
  if (data?.type !== "required" || pending || visible.value) return;
  pending = true;
  try {
    await feedback.confirm("当前操作需要 FFmpeg，但尚未检测到可用版本。是否下载并安装？", "需要 FFmpeg", {
      confirmButtonText: "下载并安装", cancelButtonText: "暂不下载", closeOnClickModal: false,
    });
    if (events.readyState !== EventSource.CLOSED) visible.value = true;
  } catch {
    // 用户取消后保留当前操作的失败结果，不自动重新生成媒体。
  } finally {
    pending = false;
  }
};
onBeforeUnmount(() => events.close());
</script>

<style scoped>
.installationHint { margin-bottom: 12px; }
</style>

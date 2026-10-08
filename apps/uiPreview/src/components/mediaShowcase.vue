<template>
  <div ref="root" class="uiStack">
    <section data-tour="gallery"><h2>图片</h2><div class="uiRow"><uiImage :src="logo" alt="OmniStudio" :previewSrcList="[logo]" style="width: 224px; height: 80px; background: #101010; border-radius: 8px" /></div></section>
    <section data-tour="player"><h2>媒体</h2><div class="uiStack"><uiRadioGroup v-model="kind" :options="[{ value: 'video', label: '视频' }, { value: 'audio', label: '音频' }]" variant="segmented" aria-label="媒体类型" /><uiInput v-model="source" type="url" aria-label="媒体地址" placeholder="输入媒体地址" clearable /><uiMediaPlayer :src="source || undefined" :kind="kind === 'audio' ? 'audio' : 'video'" label="媒体播放" /></div></section>
    <section><h2>引导</h2><uiButton @click="tourVisible = true">查看引导</uiButton></section>
    <uiTour v-model="tourVisible" :steps="steps" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { uiImage, uiInput, uiMediaPlayer, uiRadioGroup, uiButton, uiTour, type UiValue, type UiTourStep } from "@toonflow/ui";
import logo from "@toonflow/assets/omniStudioLogo.svg";
const root = ref<HTMLElement>(), kind = ref<UiValue>("video"), source = ref(""), tourVisible = ref(false);
const steps: UiTourStep[] = [{ target: () => root.value?.querySelector<HTMLElement>('[data-tour="gallery"]') ?? null, title: "查看图片", description: "点击图片查看原图，可用方向键切换。" }, { target: () => root.value?.querySelector<HTMLElement>('[data-tour="player"]') ?? null, title: "播放媒体", description: "输入媒体地址后，可以播放、定位和调整音量。" }];
</script>

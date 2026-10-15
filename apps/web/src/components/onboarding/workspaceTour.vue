<template>
  <uiTour
    v-model="visible"
    :steps="tourSteps"
    finishText="开始实战"
    @close="handleClose"
    @complete="handleComplete"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { uiTour } from "@omnistudio-next/ui";
import { useOnboardingStore } from "@/stores/onboardingStore";

const onboardingStore = useOnboardingStore();
const visible = computed({
  get: () => onboardingStore.workspaceTourActive,
  set: (value) => {
    if (!value) onboardingStore.completeWorkspaceTour();
  },
});

const steps = [
  {
    target: ".workspaceHeader",
    title: "1. 顶栏导航与双视图",
    description: "左侧显示当前漫剧项目路径；中间切换器可在「可视节点画布」与「纯文本剧本文档」之间无缝切换，右侧随时可呼出全能 AI 导演助手。",
    placement: "bottom" as const,
  },
  {
    target: ".workspaceStage",
    title: "2. 节点流式创作画布",
    description: "这是你的核心视觉工作台。文本分镜、关键帧生图、视频生成与运镜控制都在此以节点流形式运转，支持滚轮缩放、中键平移与自由连线编排。",
    placement: "bottom-start" as const,
  },
  {
    target: "#agentPanel",
    title: "3. 万象全能导演 Agent",
    description: "右侧是专属的 AI 导演助手。你可以不用手动拖拽一个个节点，直接在聊天框输入自然语言指令，Agent 能全自动在画布上搭建剧本、节点和生成管线。",
    placement: "left-start" as const,
  },
  {
    target: "#agentPanel .messageInput",
    title: "4. 提示词驱使 Agent 搭建",
    description: "点击「开始实战」，系统将自动在聊天框填入一条精确到模型、尺寸与运镜的实战指令，一键驱动出片！",
    placement: "left" as const,
  },
];

const tourSteps = computed(() =>
  steps.map((step) => ({
    ...step,
    target: () => document.querySelector<HTMLElement>(step.target) ?? null,
  }))
);

async function handleClose() {
  await onboardingStore.skipAllOnboarding();
}

async function handleComplete() {
  await onboardingStore.completeWorkspaceTour();
}
</script>

<style lang="scss" scoped>
</style>

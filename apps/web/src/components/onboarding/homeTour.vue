<template>
  <uiTour
    v-model="visible"
    :steps="tourSteps"
    finishText="开始创建"
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
  get: () => onboardingStore.homeTourActive,
  set: (value) => {
    if (!value) onboardingStore.completeHomeTour();
  },
});

const steps = [
  {
    target: ".composer .promptInput",
    title: "1. 输入漫剧创意灵感",
    description: "在此写下你的故事或题材灵感，下方可挑选驱动创意的文本大模型。系统会自动为你备好初始提示词。",
  },
  {
    target: ".composerFooter",
    title: "2. 选择创作模型",
    description: "选择文本模型与推理强度，模型设置会随创作请求一并使用。",
  },
  {
    target: ".composer .sendActions",
    title: "3. 开始画布创作",
    description: "点击发送，系统会自动准备独立项目空间和空白画布，并带你进入工作台。",
  },
];

const tourSteps = computed(() =>
  steps.map((step) => ({
    ...step,
    target: () => document.querySelector<HTMLElement>(step.target) ?? null,
  }))
);

function handleClose() {
  onboardingStore.completeHomeTour();
}

function handleComplete() {
  onboardingStore.completeHomeTour();
}
</script>

<style lang="scss" scoped>
</style>

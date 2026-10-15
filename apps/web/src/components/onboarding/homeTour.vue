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
    target: ".composerFooter",
    title: "1. 选择项目工作目录",
    description: "万象点点以工作目录为单元管理画布、分镜与所有生成的素材文件。请首先点击选择或创建一个空文件夹作为你的首个漫剧工作区。",
  },
  {
    target: ".composer .promptInput",
    title: "2. 输入漫剧创意灵感",
    description: "在此写下你的故事或题材灵感，下方可挑选驱动创意的文本大模型。系统会自动为你备好初始提示词。",
  },
  {
    target: ".composer .sendActions",
    title: "3. 开辟漫剧创作空间",
    description: "选定目录后点击发送按钮，系统将自动在本地/云端创建项目文件夹与空白画布，并直接带你进入核心工作台。",
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

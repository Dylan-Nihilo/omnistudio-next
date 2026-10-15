import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { settings, saveSettings } from "@/stores/settings";

export const directorPromptText = `请帮我搭建《雨夜拔刀》漫剧工作流：
1. 创建【01_剧本分镜】文本节点，填入分镜文案：“黑衣刺客雨夜飞掠青瓦，电闪雷鸣撕裂夜空，寒芒出鞘三分，水墨东方电影感”；
2. 创建【02_画面定妆】生图节点，选择模型 gpt-image-2，设置尺寸 16:9（1K 分辨率），与分镜文本连线；
3. 创建【03_动态漫剧】视频生成节点，选择模型 doubao-seedance-2-0，设置 720p 4 秒时长，运镜设为急速推进，与生图节点连线；
4. 自动在画布上完成排版布局并准备出片。`;

export const useOnboardingStore = defineStore("onboarding", () => {
  const homeTourActive = ref(false);
  const workspaceTourActive = ref(false);
  const shouldAutoFillAgent = ref(false);
  const generatedVideoUrl = ref("");
  const showCelebration = ref(false);

  const isCompleted = computed(() => settings.value.onboardingCompleted === true);

  function checkHomeTrigger() {
    if (isCompleted.value) return false;
    homeTourActive.value = true;
    return true;
  }

  function completeHomeTour() {
    homeTourActive.value = false;
  }

  function checkWorkspaceTrigger() {
    if (isCompleted.value) return false;
    workspaceTourActive.value = true;
    return true;
  }

  function completeWorkspaceTour() {
    workspaceTourActive.value = false;
    shouldAutoFillAgent.value = true;
  }

  async function skipAllOnboarding() {
    homeTourActive.value = false;
    workspaceTourActive.value = false;
    shouldAutoFillAgent.value = false;
    showCelebration.value = false;
    await saveSettings(() => ({ onboardingCompleted: true }));
  }

  async function resetOnboarding() {
    await saveSettings(() => ({ onboardingCompleted: false }));
    homeTourActive.value = true;
    workspaceTourActive.value = false;
    shouldAutoFillAgent.value = false;
    showCelebration.value = false;
  }

  function openCelebration(videoUrl?: string) {
    if (videoUrl) generatedVideoUrl.value = videoUrl;
    showCelebration.value = true;
  }

  function closeCelebration() {
    showCelebration.value = false;
  }

  return {
    homeTourActive,
    workspaceTourActive,
    shouldAutoFillAgent,
    generatedVideoUrl,
    showCelebration,
    directorPromptText,
    isCompleted,
    checkHomeTrigger,
    completeHomeTour,
    checkWorkspaceTrigger,
    completeWorkspaceTour,
    skipAllOnboarding,
    resetOnboarding,
    openCelebration,
    closeCelebration,
  };
});

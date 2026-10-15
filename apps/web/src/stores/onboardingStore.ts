import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { settings, saveSettings } from "@/stores/settings";

export type OnboardingThemeKey = "xianxia" | "scifi" | "anime";

export interface OnboardingTheme {
  key: OnboardingThemeKey;
  title: string;
  tag: string;
  subtitle: string;
  prompt: string;
  directorPromptText: string;
}

export const onboardingThemes: Record<OnboardingThemeKey, OnboardingTheme> = {
  xianxia: {
    key: "xianxia",
    title: "古风修仙 · 《雨夜拔刀》",
    tag: "水墨国风",
    subtitle: "黑衣刺客雨夜飞掠青瓦，电闪雷鸣撕裂夜空，寒芒出鞘三分",
    prompt: "黑衣刺客雨夜飞掠青瓦，电闪雷鸣撕裂夜空，寒芒出鞘三分，水墨东方电影感",
    directorPromptText: `请帮我搭建《雨夜拔刀》漫剧工作流：
1. 创建【01_剧本分镜】文本节点，填入分镜文案：“黑衣刺客雨夜飞掠青瓦，电闪雷鸣撕裂夜空，寒芒出鞘三分，水墨东方电影感”；
2. 创建【02_画面定妆】生图节点，选择模型 gpt-image-2，设置尺寸 16:9（1K 分辨率），与分镜文本连线；
3. 创建【03_动态漫剧】视频生成节点，选择模型 doubao-seedance-2-0，设置 720p 4 秒时长，运镜设为急速推进，与生图节点连线；
4. 自动在画布上完成排版布局并准备出片。`,
  },
  scifi: {
    key: "scifi",
    title: "都市科幻 · 《霓虹追凶》",
    tag: "赛博朋克",
    subtitle: "全息霓虹折射雨街水坑，银发仿生侦探扣动扳机，冷暖光影",
    prompt: "赛博朋克雨夜雨街，全息霓虹折射水坑，银发仿生侦探扣动扳机，电影级冷暖光影",
    directorPromptText: `请帮我搭建《霓虹追凶》漫剧工作流：
1. 创建【01_剧本分镜】文本节点，填入分镜文案：“赛博朋克雨夜雨街，全息霓虹折射水坑，银发仿生侦探扣动扳机，电影级冷暖光影”；
2. 创建【02_画面定妆】生图节点，选择模型 gpt-image-2，设置尺寸 16:9（1K 分辨率），与分镜文本连线；
3. 创建【03_动态漫剧】视频生成节点，选择模型 doubao-seedance-2-0，设置 720p 4 秒时长，运镜设为推轨特写，与生图节点连线；
4. 自动在画布上完成排版布局并准备出片。`,
  },
  anime: {
    key: "anime",
    title: "二次元动画 · 《星空之约》",
    tag: "唯美日漫",
    subtitle: "夏夜银河划过璀璨流星，少年少女并肩仰望，微风吹拂发丝",
    prompt: "夏夜星空与划过的璀璨流星，少年少女并肩仰望，唯美微风吹拂发丝，新海诚唯美治愈风",
    directorPromptText: `请帮我搭建《星空之约》漫剧工作流：
1. 创建【01_剧本分镜】文本节点，填入分镜文案：“夏夜星空与划过的璀璨流星，少年少女并肩仰望，唯美微风吹拂发丝，新海诚唯美治愈风”；
2. 创建【02_画面定妆】生图节点，选择模型 gpt-image-2，设置尺寸 16:9（1K 分辨率），与分镜文本连线；
3. 创建【03_动态漫剧】视频生成节点，选择模型 doubao-seedance-2-0，设置 720p 4 秒时长，运镜设为仰角缓升，与生图节点连线；
4. 自动在画布上完成排版布局并准备出片。`,
  },
};

export const useOnboardingStore = defineStore("onboarding", () => {
  const welcomeModalVisible = ref(false);
  const selectedThemeKey = ref<OnboardingThemeKey>("xianxia");
  const homeTourActive = ref(false);
  const workspaceTourActive = ref(false);
  const shouldAutoFillAgent = ref(false);
  const generatedVideoUrl = ref("");
  const showCelebration = ref(false);

  const isCompleted = computed(() => settings.value.onboardingCompleted === true);
  const currentTheme = computed(() => onboardingThemes[selectedThemeKey.value]);
  const directorPromptText = computed(() => currentTheme.value.directorPromptText);

  const homeWelcomed = ref(false);

  function checkHomeTrigger() {
    if (isCompleted.value || homeWelcomed.value) return false;
    homeWelcomed.value = true;
    welcomeModalVisible.value = true;
    return true;
  }

  function startGuidedOnboarding(themeKey?: OnboardingThemeKey) {
    if (themeKey) selectedThemeKey.value = themeKey;
    homeWelcomed.value = true;
    welcomeModalVisible.value = false;
    homeTourActive.value = true;
  }

  function completeHomeTour() {
    homeTourActive.value = false;
    homeWelcomed.value = true;
  }

  function checkWorkspaceTrigger() {
    if (isCompleted.value) return false;
    workspaceTourActive.value = true;
    return true;
  }

  async function completeWorkspaceTour() {
    workspaceTourActive.value = false;
    shouldAutoFillAgent.value = true;
    homeWelcomed.value = true;
    await saveSettings(() => ({ onboardingCompleted: true }));
  }

  async function skipAllOnboarding() {
    homeWelcomed.value = true;
    welcomeModalVisible.value = false;
    homeTourActive.value = false;
    workspaceTourActive.value = false;
    shouldAutoFillAgent.value = false;
    showCelebration.value = false;
    await saveSettings(() => ({ onboardingCompleted: true }));
  }

  async function resetOnboarding() {
    homeWelcomed.value = false;
    await saveSettings(() => ({ onboardingCompleted: false }));
    welcomeModalVisible.value = true;
    homeTourActive.value = false;
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
    welcomeModalVisible,
    selectedThemeKey,
    currentTheme,
    homeTourActive,
    workspaceTourActive,
    shouldAutoFillAgent,
    generatedVideoUrl,
    showCelebration,
    directorPromptText,
    isCompleted,
    checkHomeTrigger,
    startGuidedOnboarding,
    completeHomeTour,
    checkWorkspaceTrigger,
    completeWorkspaceTour,
    skipAllOnboarding,
    resetOnboarding,
    openCelebration,
    closeCelebration,
  };
});

import { computed, ref } from "vue";
import { defineStore } from "pinia";
import axios from "axios";
import { useRouter } from "vue-router";
import { settings, saveSettings } from "@/stores/settings";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";

export type OnboardingThemeKey = "xianxia" | "cyberpunk" | "anime";

export type OnboardingStep =
  | "idle"
  | "welcome"
  | "promptNode"
  | "imageNode"
  | "videoNode"
  | "completed";

export interface OnboardingThemeConfig {
  key: OnboardingThemeKey;
  title: string;
  subtitle: string;
  tag: string;
  promptText: string;
  imagePrompt: string;
  imageModel: [string, string];
  videoPrompt: string;
  videoModel: [string, string];
  videoCameraMotion: string;
  estimatedCredits: { image: number; video: number; total: number };
}

export const onboardingThemes: Record<OnboardingThemeKey, OnboardingThemeConfig> = {
  xianxia: {
    key: "xianxia",
    title: "古风修仙",
    subtitle: "雨夜瓦当飞檐，寒芒拔刀破空",
    tag: "推荐默认",
    promptText: "黑衣刺客雨夜飞掠青瓦，电闪雷鸣撕裂夜空，寒芒出鞘三分，水墨东方电影感。",
    imagePrompt: "写实水墨国风，黑衣剑客，雨夜屋脊，拔刀瞬间，电光，电影级景深，冷峻氛围，极致细节，16:9",
    imageModel: ["openheapImage", "gpt-image-2"],
    videoPrompt: "镜头快速向前推进特写，暴雨倾盆，刀光寒芒流转，雨滴飞溅，水墨写实电影质感，4秒时长。",
    videoModel: ["utoooSeedance", "doubao-seedance-2-0-260128"],
    videoCameraMotion: "急速推进",
    estimatedCredits: { image: 3, video: 18, total: 21 },
  },
  cyberpunk: {
    key: "cyberpunk",
    title: "都市科幻",
    subtitle: "霓虹雨夜天台，义体少女回眸",
    tag: "赛博电影",
    promptText: "霓虹雨夜赛博都市天台，机械义体少女回眸，全息光幕闪烁，赛博朋克电影光影。",
    imagePrompt: "赛博朋克都市天台，雨夜，霓虹反光，机械臂少女回眸，全息投影，微光胶片质感，冷暖对比，16:9",
    imageModel: ["openheapImage", "gpt-image-2"],
    videoPrompt: "镜头慢速环绕半圈，霓虹光晕流转，雨丝在全息光芒中反射，电影级质感，4秒时长。",
    videoModel: ["utoooSeedance", "doubao-seedance-2-0-260128"],
    videoCameraMotion: "慢速环绕",
    estimatedCredits: { image: 3, video: 18, total: 21 },
  },
  anime: {
    key: "anime",
    title: "二次元动画",
    subtitle: "黄昏天台逆光，微风撩动发丝",
    tag: "唯美治愈",
    promptText: "黄昏夕阳下的学院天台，微风吹动校服与发丝，少女伸手触碰落日微光，新海诚唯美画风。",
    imagePrompt: "新海诚画风，黄昏逆光，唯美二次元少女，校服微风发丝飘动，天台，金色落日，清新通透，16:9",
    imageModel: ["openheapImage", "gpt-image-2"],
    videoPrompt: "镜头缓缓向上仰拍摇移，阳光穿透发丝，云彩在风中缓缓流动，4秒唯美画面。",
    videoModel: ["utoooSeedance", "doubao-seedance-2-0-260128"],
    videoCameraMotion: "向上摇移",
    estimatedCredits: { image: 3, video: 18, total: 21 },
  },
};

export const useOnboardingStore = defineStore("onboarding", () => {
  const router = useRouter();
  const workspaceStore = useWorkspaceStore();

  const currentStep = ref<OnboardingStep>("idle");
  const selectedTheme = ref<OnboardingThemeKey>("xianxia");
  const isCreatingSandbox = ref(false);
  const generatedVideoUrl = ref("");

  const isCompleted = computed(() => settings.value.onboardingCompleted === true);
  const activeTheme = computed(() => onboardingThemes[selectedTheme.value]);
  const isGuiding = computed(() => currentStep.value !== "idle" && currentStep.value !== "welcome");

  function checkShouldTrigger() {
    if (isCompleted.value) return false;
    if (currentStep.value !== "idle") return false;
    currentStep.value = "welcome";
    return true;
  }

  async function skipOnboarding() {
    currentStep.value = "idle";
    await saveSettings(() => ({ onboardingCompleted: true }));
  }

  async function restartOnboarding() {
    await saveSettings(() => ({ onboardingCompleted: false }));
    currentStep.value = "welcome";
  }

  async function startSandbox(themeKey: OnboardingThemeKey) {
    if (isCreatingSandbox.value) return;
    selectedTheme.value = themeKey;
    isCreatingSandbox.value = true;

    try {
      const { data } = await axios.get<{ code: number; data?: { absolutePath: string } }>("/api/workspaces/list", { params: { path: "" } });
      const rootPath = data?.data?.absolutePath;
      if (!rootPath) throw new Error("无法读取工作区根目录");

      const files = useWorkspaceFiles(rootPath);
      const targetDirectoryName = `新手导演训练营_${themeKey}`;
      const sandboxPath = `${rootPath}/${targetDirectoryName}`;

      try {
        await files.mkdir(targetDirectoryName);
      } catch {
        // ACT: 目录已存在时复用，避免抛出同名错误阻碍流程
      }

      const theme = onboardingThemes[themeKey];
      const sandboxFiles = useWorkspaceFiles(sandboxPath);

      const promptNodeId = "node_onboarding_prompt";
      const imageNodeId = "node_onboarding_image";
      const videoNodeId = "node_onboarding_video";

      const canvasContent = {
        toonflowCanvas: true,
        nodes: [
          {
            id: promptNodeId,
            type: "remote-textNode",
            initialized: false,
            position: { x: 80, y: 160 },
            data: {
              label: `01_剧本分镜(${theme.title})`,
              handles: [
                { id: "in", type: "target", dataType: ["VIDEO", "IMAGE", "STRING"], label: "输入" },
                { id: "text", type: "source", dataType: "STRING", label: "文本输出" },
              ],
              outputs: {},
              model: JSON.stringify(theme.imageModel),
              promptModel: [[{ type: "Write", text: theme.promptText }]],
            },
          },
          {
            id: imageNodeId,
            type: "remote-imageGenerationNode",
            initialized: false,
            position: { x: 560, y: 160 },
            data: {
              label: `02_关键帧定妆(${theme.title})`,
              prompt: theme.imagePrompt,
              promptModel: [[{ type: "Write", text: theme.imagePrompt }]],
              model: JSON.stringify(theme.imageModel),
              size: "1K",
              ratio: "16:9",
              handles: [
                { id: "in", type: "target", dataType: ["IMAGE", "STRING"], label: "图片、文本输入" },
                { id: "image", type: "source", dataType: "IMAGE", label: "图片输出" },
              ],
              outputs: {},
            },
          },
          {
            id: videoNodeId,
            type: "remote-videoGenerationNode",
            initialized: false,
            position: { x: 1040, y: 160 },
            data: {
              label: `03_动态成片(${theme.title})`,
              prompt: theme.videoPrompt,
              promptModel: [[{ type: "Write", text: theme.videoPrompt }]],
              model: JSON.stringify(theme.videoModel),
              resolution: "720p",
              duration: 4,
              cameraMotion: theme.videoCameraMotion,
              handles: [
                { id: "in", type: "target", dataType: ["IMAGE", "VIDEO", "AUDIO", "STRING"], label: "输入" },
                { id: "video", type: "source", dataType: "VIDEO", label: "视频输出" },
              ],
              outputs: {},
            },
          },
        ],
        edges: [
          {
            id: "edge_prompt_to_image",
            source: promptNodeId,
            sourceHandle: "text",
            target: imageNodeId,
            targetHandle: "in",
          },
          {
            id: "edge_image_to_video",
            source: imageNodeId,
            sourceHandle: "image",
            target: videoNodeId,
            targetHandle: "in",
          },
        ],
        viewport: { x: 40, y: 40, zoom: 0.9 },
      };

      await sandboxFiles.writeJson("画布1.json", canvasContent, false);
      await workspaceStore.openProject(sandboxPath);
      workspaceStore.renameProject(sandboxPath, `新手导演训练营 · ${theme.title}`);

      currentStep.value = "promptNode";
      await router.push("/workspace");
    } finally {
      isCreatingSandbox.value = false;
    }
  }

  function advanceToStep(step: OnboardingStep) {
    currentStep.value = step;
  }

  async function completeOnboarding(finalVideoUrl?: string) {
    if (finalVideoUrl) generatedVideoUrl.value = finalVideoUrl;
    currentStep.value = "completed";
    await saveSettings(() => ({ onboardingCompleted: true }));
  }

  return {
    currentStep,
    selectedTheme,
    activeTheme,
    isCompleted,
    isGuiding,
    isCreatingSandbox,
    generatedVideoUrl,
    checkShouldTrigger,
    skipOnboarding,
    restartOnboarding,
    startSandbox,
    advanceToStep,
    completeOnboarding,
  };
});

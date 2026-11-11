<template>
  <div class="home">
    <header class="homeNavigation" aria-label="主导航">
      <a class="homeBrand" href="#/home" aria-label="万象点点首页"><img :src="logoUrl" alt="万象点点" /></a>
      <nav class="mainNavigation">
        <uiButton class="navigationItem" variant="ghost" :class="{ isSelected: activeSection === 'create' }" :icon="IconLayoutDashboard" @click="focusCreation">无限画布</uiButton>
        <uiButton class="navigationItem" variant="ghost" :class="{ isSelected: activeSection === 'projects' }" :icon="IconMovie" title="跳转到生产项目" @click="focusProjects">生产项目</uiButton>
      </nav>
      <nav class="secondaryNavigation">
        <uiButton class="navigationItem" variant="ghost" :icon="IconUserCircle" aria-label="账户与积分" title="账户与积分" @click="router.push('/account')">账户与积分</uiButton>
        <uiButton class="navigationItem" variant="ghost" :icon="IconUsersGroup" aria-label="团队空间" title="团队空间" @click="router.push('/teams')">团队空间</uiButton>
        <uiButton v-if="auth.isRoot" class="navigationItem" variant="ghost" :icon="IconShieldLock" aria-label="平台管理" title="平台管理" @click="router.push('/admin')">平台管理</uiButton>
        <uiBadge dot :hidden="!hasDesktopUpdate" label="有新版本可用"><uiButton class="navigationItem" variant="ghost" :icon="IconSettings" :aria-label="hasDesktopUpdate ? '设置，有新版本可用' : '设置'" @click="settingsVisible = true">设置</uiButton></uiBadge>
      </nav>
      <div class="accountIdentity">
        <div class="identityHeader">
          <div class="identityUser">
            <span class="identityName" :title="auth.user?.displayName">{{ auth.user?.displayName }}</span>
            <span v-if="auth.isRoot" class="rootBadge">root</span>
          </div>
          <uiIconButton variant="ghost" size="small" :icon="IconLogout" label="退出登录" title="退出登录" class="logoutButton" @click="handleSignOut" />
        </div>
        <span class="identityEmail" :title="auth.user?.email">{{ auth.user?.email }}</span>
      </div>
    </header>
    <main class="homeContent">
      <header class="homeIntro"><h1>下一部漫剧，<span>由你开场。</span></h1><p>从一句话开始，把灵感编排成可交付的漫剧。</p></header>
      <div class="homeOverview">
      <section class="canvasEntry" aria-label="无限画布创作">
        <div class="composer">
          <uiTextarea ref="promptInput" v-model="prompt" class="promptInput" :rows="3" resize="none" :disabled="creating || opening" :placeholder="promptPlaceholder" aria-label="创作描述" />
          <div class="composerFooter">
            <div class="sendActions">
              <modelPopover v-model="selectedModel" v-model:reasoningEffort="reasoningEffort" class="modelSelect" :disabled="creating || opening" />
              <uiIconButton :icon="IconArrowUp" label="发送" variant="primary" :loading="creating" :disabled="creating || opening" @click="createProject()" />
            </div>
          </div>
        </div>
      </section>
      <section class="canvasLibrary" aria-labelledby="canvasLibraryTitle">
          <header class="canvasLibraryHeader"><h2 id="canvasLibraryTitle">我的画布</h2></header>
          <div class="canvasCards">
            <button type="button" class="canvasCard newCanvasCard" :disabled="creating || opening" @click="() => createProject(false)"><span class="newCanvasMark">＋</span><strong>新建画布</strong><small>从空白画布开始编排</small></button>
            <button v-for="canvasProject in canvasProjects" :key="canvasProject.directory" type="button" class="canvasCard" :class="{ selected: canvasProject.directory === project?.directory }" :disabled="creating || opening" @click="openCanvas(canvasProject)"><span class="canvasCardMark">◈</span><strong>{{ canvasProject.name }}</strong><small>最近打开 {{ formatLastOpenedAt(canvasProject.lastOpenedAt) }}</small></button>
            <p v-if="!canvasProjects.length" class="canvasCardsEmpty">还没有已保存的画布，点击“新建画布”开始。</p>
          </div>
      </section>
      <section class="demoCollection" aria-labelledby="demoCollectionTitle">
        <header class="demoHeader"><h2 id="demoCollectionTitle">精选漫剧</h2><span>打开 Demo 继续编辑，或观看已生成的成片。</span></header>
        <div v-if="demos.length" class="demoItems">
          <article v-for="demo in demos" :key="demo.id" class="demoCard">
            <uiButton class="demoPreview" variant="ghost" :disabled="creating || opening" :aria-label="`观看成片：${demo.title}`" @click="previewDemo(demo)">
              <img class="demoCover" :src="demo.coverUrl" :alt="`${demo.title}：${demo.description}`" />
              <span class="demoPlay"><icon-player-play :size="14" aria-hidden="true" />观看成片</span>
            </uiButton>
            <div class="demoContent">
              <div class="demoCaption">
                <h3 :title="demo.title">{{ demo.title }}</h3>
                <uiButton class="demoOpen" variant="ghost" size="small" :icon="IconArrowUpRight" :loading="opening" :disabled="creating || opening" @click="openDemo(demo)">打开画布</uiButton>
              </div>
              <span class="demoMeta">{{ demo.meta }}</span>
            </div>
          </article>
        </div>
        <p v-else class="demoEmpty">暂无精选漫剧，后续可从生产项目完成的成片中挑选展示。</p>
      </section>
      </div>
    </main>
    <uiDialog v-model="demoPreviewVisible" :title="`${selectedDemo?.title ?? ''} · 第一集`" width="min(1080px, 94vw)" showFullscreen destroyOnClose>
      <uiMediaPlayer v-if="demoVideoUrl" :src="demoVideoUrl" kind="video" :label="`${selectedDemo?.title ?? ''}第一集完整成片`" />
    </uiDialog>
    <settings v-model="settingsVisible" />
    <homeTour />
    <onboardingWelcome @selectTheme="handleSelectTheme" />
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { uiButton, uiIconButton, uiBadge, uiTextarea, uiDialog, uiMediaPlayer, useUiFeedback, isUiCancelledError } from "@omnistudio-next/ui";
import {
  IconSettings, IconUserCircle, IconUsersGroup, IconShieldLock,
  IconArrowUp, IconArrowUpRight, IconLayoutDashboard,
  IconMovie,
  IconPlayerPlay,
  IconLogout,
} from "@tabler/icons-vue";
import logoUrl from "@omnistudio-next/assets/omniStudioNextLogo.svg";
import { useWorkspaceStore } from "@/stores/workspace";
import { useAuthStore } from "@/stores/auth";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";
import settings from "@/components/settings/index.vue";
import modelPopover from "@/components/modelPopover.vue";
import homeTour from "@/components/onboarding/homeTour.vue";
import onboardingWelcome from "@/components/onboarding/onboardingWelcome.vue";
import { useOnboardingStore, type OnboardingTheme } from "@/stores/onboardingStore";

const onboardingStore = useOnboardingStore();
const feedback = useUiFeedback();
const activeSection = ref("create");
const settingsVisible = ref(false);
const router = useRouter();
const creating = ref(false);
const opening = ref(false);
const promptInput = ref<InstanceType<typeof uiTextarea>>();
const prompt = ref("");
const selectedModel = ref("");
const reasoningEffort = ref("");
const workspaceStore = useWorkspaceStore();
const auth = useAuthStore();
const { project, projectList } = storeToRefs(workspaceStore);
const canvasProjects = computed(() => projectList.value.slice(0, 6));
type Demo = { id: string; title: string; description: string; meta: string; coverUrl: string; videoUrl: string };
const demos = ref<Demo[]>([]);
const selectedDemo = ref<Demo>();
const demoPreviewVisible = ref(false);
const demoVideoUrl = computed(() => selectedDemo.value?.videoUrl ?? "");

async function handleSignOut() {
  try {
    const accountName = auth.user?.displayName || auth.user?.email || "当前账户";
    await feedback.confirm(`确定退出当前账户「${accountName}」？`, "退出登录", {
      danger: true,
      confirmButtonText: "退出登录",
      cancelButtonText: "取消",
    });
    await auth.signOut();
  } catch (error) {
    if (!isUiCancelledError(error)) throw error;
  }
}

onMounted(async () => {
  onboardingStore.checkHomeTrigger();
  void workspaceStore.refreshProjectList().catch(error => showError(error instanceof Error ? error.message : "项目列表读取失败"));
  try {
    const { data } = await axios.get<{ code: number; data: Demo[]; message?: string }>("/api/demos/get");
    if (data.code !== 200) throw new Error(data.message || "Demo 读取失败");
    demos.value = data.data;
  } catch (error) { showError(error instanceof Error ? error.message : "Demo 读取失败"); }
});

const placeholderPhrases = ["描述你想创作的内容，让灵感从这里开始…", "把一个故事灵感，变成一段精彩的短片…", "把这段文字拆解成连贯的分镜画面…"];
const promptPlaceholder = ref(placeholderPhrases[0]);
onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let phraseIndex = 0;
  const timer = window.setInterval(() => {
    if (!prompt.value) {
      phraseIndex = (phraseIndex + 1) % placeholderPhrases.length;
      promptPlaceholder.value = placeholderPhrases[phraseIndex] ?? placeholderPhrases[0] ?? "";
    }
  }, 2600);
  window.addEventListener("beforeunload", () => window.clearInterval(timer), { once: true });
});

function previewDemo(demo: Demo) {
  selectedDemo.value = demo;
  demoPreviewVisible.value = true;
}

async function openDemo(demo: Demo) {
  if (creating.value || opening.value) return;
  opening.value = true;
  try {
    const { data } = await axios.post<{ code: number; data: { directory: string; name: string }; message?: string }>("/api/demos/open", { id: demo.id });
    if (data.code !== 200) throw new Error(data.message || "Demo 打开失败");
    await workspaceStore.openProject(data.data.directory);
    await workspaceStore.renameProject(data.data.directory, data.data.name);
    await router.push("/workspace");
  } catch (error) {
    showError(axios.isAxiosError<{ message?: string }>(error) ? error.response?.data.message || "Demo 打开失败" : error instanceof Error ? error.message : "Demo 打开失败");
  } finally { opening.value = false; }
}
watch(() => auth.user?.id, userId => {
  if (userId) workspaceStore.sanitizeProjectList(userId);
}, { immediate: true });

function handleSelectTheme(_theme: OnboardingTheme) { return; }

async function createProject(fromPrompt = true) {
  if (creating.value || opening.value) return;
  creating.value = true;
  try {
    const { data } = await axios.post<{ code: number; data: { directory: string; name: string }; message?: string }>("/api/workspaces/projects/create", {});
    if (data.code !== 200) throw new Error(data.message || "创建项目失败");
    await workspaceStore.openProject(data.data.directory);
    if (fromPrompt && prompt.value.trim()) workspaceStore.pendingAgentMessage = { directory: workspaceStore.project!.directory, prompt: prompt.value.trim(), model: selectedModel.value, reasoningEffort: reasoningEffort.value };
    onboardingStore.completeHomeTour();
    await router.push("/workspace");
  } catch (err) {
    showError(axios.isAxiosError<{ message?: string }>(err)
      ? err.response?.data.message || "创建项目失败，请重试"
      : err instanceof Error ? err.message : "创建项目失败，请重试");
  } finally {
    creating.value = false;
  }
}
function formatLastOpenedAt(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}
function showError(message: string) { feedback.message({ tone: "error", message }); }
async function openCanvas(canvasProject: { directory: string }) {
  if (creating.value || opening.value) return;
  opening.value = true;
  try {
    await workspaceStore.openProject(canvasProject.directory);
    await router.push("/workspace");
  } catch (error) {
    showError(axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "无法打开画布" : error instanceof Error ? error.message : "无法打开画布");
  } finally { opening.value = false; }
}
function focusCreation() { activeSection.value = "create"; document.querySelector(".canvasEntry")?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); promptInput.value?.textarea?.focus(); }
function focusProjects() { activeSection.value = "projects"; void router.push("/productionProjects"); }
</script>

<style lang="scss" scoped>
.home {
  min-height: 100dvh; color: var(--uiTextPrimary); background: var(--uiBackgroundBase);
  .homeNavigation {
    display: flex; flex-wrap: wrap; align-items: center; gap: 12px 40px; min-height: 88px;
    max-width: 1536px; margin-inline: auto; padding: 12px 64px;
    .homeBrand { display: block; flex-shrink: 0; width: 164px; img { display: block; width: 100%; height: auto; } }
    .mainNavigation, .secondaryNavigation { display: flex; align-items: center; gap: 8px; }
    .mainNavigation {
      .navigationItem { min-height: 40px; padding-inline: 10px; border-radius: 0; background: transparent; color: var(--uiTextMuted); &.isSelected { color: var(--uiTextPrimary); box-shadow: inset 0 -2px var(--uiActionPrimary); } }
    }
    .secondaryNavigation { margin-left: auto; gap: 4px; .navigationItem { padding-inline: 10px; color: var(--uiTextMuted); } }
    .accountIdentity {
      display: flex; flex-direction: column; gap: 4px; width: 180px; min-width: 0;
      .identityHeader {
        display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0;
        .identityUser {
          display: flex; align-items: center; gap: 6px; min-width: 0;
          .identityName { font-size: var(--uiFontControl); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .rootBadge { flex-shrink: 0; width: fit-content; padding: 1px 5px; border: 1px solid var(--uiBorderDefault); border-radius: 4px; color: var(--uiActionPrimary); font-size: 11px; }
        }
        .logoutButton {
          flex-shrink: 0; color: var(--uiTextMuted);
          &:hover { color: var(--uiStatusError); background: var(--uiStatusErrorSoft); }
        }
      }
      .identityEmail { display: block; width: 100%; color: var(--uiTextMuted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4; }
    }
  }
  .homeContent {
    display: flex; flex-direction: column; gap: 32px; max-width: 1536px; min-width: 0; margin-inline: auto; padding: 32px 64px 56px;
    .homeIntro { text-align: center; h1 { margin: 0; font-family: "Songti SC", "STSong", "Noto Serif CJK SC", "SimSun", serif; font-size: clamp(42px, 3.8vw, 56px); line-height: 1.25; font-weight: 500; letter-spacing: -2px; br { display: none; } span { color: var(--uiActionPrimary); } } p { margin: 10px 0 0; color: var(--uiTextMuted); font-size: 13px; } }
    .homeOverview {
      display: grid; gap: 38px; align-items: start;
      .canvasEntry { width: min(100%, 920px); margin-inline: auto; }
      .canvasEntry > h2 { margin: 0 0 16px; color: var(--uiTextMuted); font-size: 18px; font-weight: 500; text-align: center; }
      .composer { padding: 17px 18px 13px; border: 1px solid var(--uiBorderDefault); border-radius: 16px; background: color-mix(in srgb, var(--uiSurfaceRaised) 76%, var(--uiBackgroundBase)); transition: border-color var(--uiMotionDuration) var(--uiMotionEase); &:focus-within { border-color: var(--uiBorderFocus); } .promptInput { min-height: 128px; padding: 0; border: 0; border-radius: 0; background: transparent; font-size: 15px; outline: none; } .composerFooter { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--uiBorderDefault); .sendActions { display: flex; align-items: center; gap: 10px; margin-left: auto; .modelSelect { width: 280px; max-width: 100%; flex: 0 1 280px; } :deep(.uiIconButton) { width: 38px; height: 38px; border-radius: 50%; } } }
      }
      .canvasLibrary {
        width: min(100%, 920px); min-width: 0; margin-inline: auto;
        .canvasLibraryHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; h2 { margin: 0; font-size: 20px; font-weight: 500; letter-spacing: .5px; } .canvasLibraryActions { display: flex; gap: 8px; } }
        .canvasCards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .canvasCard { display: grid; align-content: center; justify-items: start; gap: 7px; min-width: 0; min-height: 132px; padding: 18px; border: 1px solid var(--uiBorderDefault); border-radius: 12px; color: var(--uiTextPrimary); background: var(--uiSurfaceRaised); text-align: left; cursor: pointer; transition: border-color var(--uiMotionDuration) var(--uiMotionEase), transform var(--uiMotionDuration) var(--uiMotionEase); &:hover, &:focus-visible, &.selected { border-color: var(--uiActionPrimary); transform: translateY(-1px); } strong, small { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } small { color: var(--uiTextMuted); font-size: 10px; } }
        .newCanvasCard { justify-items: center; text-align: center; border-style: dashed; background: color-mix(in srgb, var(--uiActionPrimary) 5%, var(--uiSurfaceRaised)); .newCanvasMark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; color: var(--uiTextOnAccent); background: var(--uiActionPrimary); font-size: 22px; line-height: 1; } }
        .canvasCardMark { color: var(--uiActionPrimary); font-size: 22px; }
        .canvasCardsEmpty { grid-column: 1 / -1; margin: 0; padding: 28px; border: 1px dashed var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 12px; text-align: center; }
      }
      .demoCollection {
        display: flex; flex-direction: column; gap: 20px; width: min(100%, 1320px); margin-inline: auto; min-width: 0;
        .demoHeader { display: flex; align-items: baseline; gap: 12px; min-height: 30px; h2 { display: flex; align-items: center; gap: 16px; margin: 0; font-size: 20px; font-weight: 500; letter-spacing: 0.5px; &::after { content: ""; width: 80px; height: 1px; background: var(--uiBorderDefault); } } span { color: var(--uiTextMuted); font-size: 11px; } }
        .demoItems {
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 32px 24px;
          .demoCard {
            min-width: 0; max-width: 300px;
            .demoPreview {
              position: relative; display: block; width: 100%; min-height: 0; padding: 0; border: 1px solid var(--uiBorderDefault); border-radius: 3px; background: var(--uiBackgroundSubtle); overflow: hidden;
              :deep(.buttonLabel) { display: block; width: 100%; }
              .demoCover { display: block; width: 100%; aspect-ratio: 16 / 9; object-fit: cover; transition: transform 300ms ease; }
              .demoPlay { position: absolute; left: 12px; bottom: 12px; display: flex; align-items: center; gap: 6px; padding: 7px 10px; border: 1px solid rgb(255 255 255 / 24%); border-radius: 3px; color: #f3f0e8; background: rgb(20 19 17 / 85%); font-size: 11px; svg { flex-shrink: 0; } }
              &:hover, &:focus-visible { .demoCover { transform: scale(1.025); } .demoPlay { background: var(--uiActionPrimary); color: var(--uiTextOnAccent); border-color: transparent; } }
            }
            .demoContent {
              margin-top: 16px;
              .demoCaption { display: flex; align-items: center; justify-content: space-between; gap: 12px; h3 { min-width: 0; max-width: 100%; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: "Songti SC", "STSong", "Noto Serif CJK SC", "SimSun", serif; font-size: 26px; font-weight: 600; letter-spacing: 1px; } .demoOpen { flex-shrink: 0; padding-inline: 0; color: var(--uiTextMuted); font-size: 12px; :deep(.buttonIcon) { order: 1; } } }
              .demoMeta { display: block; margin-top: 6px; color: var(--uiTextMuted); font-size: 11px; line-height: 1.5; letter-spacing: 0.2px; }
            }
          }
        }
        .demoEmpty { margin: 0; padding: 28px 20px; border: 1px dashed var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 12px; text-align: center; }
      }
    }
  }
  @media (max-width: 1200px) {
    .homeNavigation { padding-inline: 40px; gap: 24px; .secondaryNavigation .navigationItem { padding-inline: 8px; } }
    .homeContent { padding-inline: 40px; .homeIntro h1 { font-size: 48px; } .homeOverview { gap: 32px; } }
  }
  @media (max-width: 1000px) {
    .homeNavigation { .secondaryNavigation { .navigationItem { width: 36px; padding-inline: 0; :deep(.buttonLabel) { display: none; } } } }
  }
  @media (max-width: 900px) {
    .homeContent {
      .homeOverview {
        .canvasLibrary { width: 100%; max-width: none; }
        .canvasCards, .demoItems { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    }
  }
  @media (max-width: 600px) {
    .homeNavigation {
      flex-wrap: wrap; gap: 8px 16px; min-height: 0; padding: 12px 20px;
      .homeBrand { width: 132px; }
      .mainNavigation { order: 3; width: 100%; .navigationItem { min-height: 36px; font-size: 12px; } }
      .secondaryNavigation { gap: 2px; .navigationItem { width: 30px; min-height: 32px; } }
    }
    .homeContent {
      gap: 28px; padding: 24px 20px 40px;
      .homeIntro h1 { font-size: 42px; line-height: 1.2; letter-spacing: -1px; br { display: block; } span { display: inline-block; margin-left: 40px; } }
      .homeOverview {
        gap: 28px;
        .composer .composerFooter .sendActions { width: 100%; .modelSelect { width: auto; flex: 1 1 auto; } }
        .canvasLibrary { .canvasCards { grid-template-columns: minmax(0, 1fr); } }
        .demoCollection { gap: 16px; .demoHeader { min-height: 0; h2 { font-size: 18px; } } .demoItems { grid-template-columns: minmax(0, 1fr); gap: 24px; .demoCard { display: grid; grid-template-columns: 154px minmax(0, 1fr); align-items: center; gap: 16px; max-width: none; .demoPreview { .demoPlay { left: 6px; bottom: 6px; gap: 4px; padding: 4px 6px; font-size: 10px; } } .demoContent { margin: 0; .demoCaption { align-items: flex-start; flex-direction: column; gap: 4px; h3 { font-size: 23px; } .demoOpen { min-height: 28px; font-size: 11px; } } .demoMeta { margin-top: 4px; font-size: 10px; } } } } }
      }
    }
  }
}
</style>

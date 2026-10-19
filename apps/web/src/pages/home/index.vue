<template>
  <div class="home">
    <header class="homeNavigation" aria-label="主导航">
      <a class="homeBrand" href="#/home" aria-label="万象点点首页"><img :src="logoUrl" alt="万象点点" /></a>
      <nav class="mainNavigation">
        <uiButton class="navigationItem" variant="ghost" :class="{ isSelected: activeSection === 'create' }" :icon="IconFolderPlus" @click="focusCreation">开始创作</uiButton>
        <uiButton class="navigationItem" variant="ghost" :class="{ isSelected: activeSection === 'projects' }" :icon="IconFolder" title="跳转到最近项目" @click="focusProjects">最近项目</uiButton>
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
      <header class="homeIntro"><h1>下一部漫剧，<br /><span>由你开场。</span></h1></header>
      <div class="homeOverview" :class="{ hasDemos: demos.length }">
        <section v-if="demos.length" class="demoCollection" aria-labelledby="demoCollectionTitle">
          <header class="demoHeader"><h2 id="demoCollectionTitle">Demo 合集</h2></header>
          <div class="demoItems">
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
        </section>
        <section class="creationPanel" aria-labelledby="creationTitle">
          <header class="creationHeading"><h2 id="creationTitle" class="creationMode">漫剧创作</h2></header>
          <div class="creationContent">
            <div class="composer">
              <uiTextarea ref="promptInput" v-model="prompt" class="promptInput" :rows="2" resize="none" :disabled="creating || opening" :placeholder="promptPlaceholder" aria-label="创作描述" />
              <div class="composerFooter">
                <workspacePicker ref="promptWorkspacePicker" v-model="workspaceDirectory" :disabled="creating || opening" />
                <div class="sendActions">
                  <modelPopover v-model="selectedModel" v-model:reasoningEffort="reasoningEffort" class="modelSelect" :disabled="creating || opening" />
                  <uiButton v-if="!workspaceDirectory" :icon="IconFolder" :loading="creating" :disabled="creating || opening" @click="promptWorkspacePicker?.chooseDirectory()">选择工作目录</uiButton>
                  <uiIconButton v-else :icon="IconArrowUp" label="发送" variant="primary" :loading="creating" :disabled="creating || opening" @click="createProject()" />
                </div>
              </div>
            </div>
            <p class="workspaceHint" role="status">{{ workspaceDirectory ? '画布与素材会保存在你选择的文件夹里。' : '请先选择一个空文件夹作为工作目录，画布和素材会保存在这里。' }}</p>
          </div>
        </section>
      </div>
      <section ref="projectSection" class="projectList" aria-labelledby="projectListTitle">
        <header class="projectHeader">
          <h2 id="projectListTitle">最近项目</h2>
          <div class="projectToolbar">
            <uiButton variant="ghost" :icon="IconFolderOpen" :disabled="creating || opening" @click="openProject()">导入项目</uiButton>
            <uiButton variant="secondary" :icon="IconFolderPlus" :disabled="creating || opening" @click="createProject(false)">添加项目</uiButton>
            <uiIconButton :icon="sortDescending ? IconSortDescending : IconSortAscending" :label="sortDescending ? '按时间降序' : '按时间升序'" @click="sortDescending = !sortDescending" />
            <uiRadioGroup :modelValue="viewMode" :options="viewOptions" variant="segmented" aria-label="项目视图" @update:modelValue="value => typeof value === 'string' && (viewMode = value)" />
          </div>
        </header>
        <div class="projectItems" :class="{ listView: viewMode === 'list' }">
          <article v-for="(project, index) in sortedProjects" :key="project.directory" class="projectCard">
            <span class="projectNumber" aria-hidden="true">{{ String(index + 1).padStart(2, "0") }}</span>
            <div class="projectActions">
              <uiIconButton size="small" :icon="IconEdit" :disabled="creating || opening" :label="`重命名项目 ${project.name}`" title="重命名" @click="renameProject(project)" />
              <uiIconButton size="small" variant="danger" :icon="IconTrash" :disabled="creating || opening" :label="`移除项目 ${project.name}`" title="从列表移除，不删除文件" @click="removeProject(project)" />
            </div>
            <uiButton class="projectEntry" variant="ghost" :disabled="creating || opening" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)">
              <span class="projectName" :title="project.name">{{ project.name }}</span>
              <span class="projectPath" :title="project.directory">{{ project.directory }}</span>
            </uiButton>
            <div class="projectTime"><span>最近打开</span><time>{{ new Date(project.lastOpenedAt).toLocaleString('zh-CN', { hour12: false }) }}</time></div>
          </article>
        </div>
      </section>
    </main>
    <uiDialog v-model="demoPreviewVisible" :title="`${selectedDemo?.title ?? ''} · 第一集`" width="min(1080px, 94vw)" showFullscreen destroyOnClose>
      <uiMediaPlayer v-if="demoVideoUrl" :src="demoVideoUrl" kind="video" :label="`${selectedDemo?.title ?? ''}第一集完整成片`" />
    </uiDialog>
    <settings v-model="settingsVisible" />
    <workspacePicker ref="relocationPicker" hideTrigger />
    <homeTour />
    <onboardingWelcome @selectTheme="handleSelectTheme" />
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { uiButton, uiIconButton, uiBadge, uiTextarea, uiRadioGroup, uiDialog, uiMediaPlayer, useUiFeedback, isUiCancelledError } from "@omnistudio-next/ui";
import {
  IconSettings, IconUserCircle, IconUsersGroup, IconShieldLock,
  IconArrowUp, IconArrowUpRight, IconLayoutGrid,
  IconList, IconSortDescending,
  IconSortAscending, IconFolder, IconEdit,
  IconTrash, IconFolderPlus, IconFolderOpen, IconPlayerPlay,
  IconLogout,
} from "@tabler/icons-vue";
import modelPopover from "@/components/modelPopover.vue";
import logoUrl from "@omnistudio-next/assets/omniStudioNextLogo.svg";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { useAuthStore } from "@/stores/auth";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import settings from "@/components/settings/index.vue";
import workspacePicker from "./workspacePicker.vue";
import homeTour from "@/components/onboarding/homeTour.vue";
import onboardingWelcome from "@/components/onboarding/onboardingWelcome.vue";
import { useOnboardingStore, type OnboardingTheme } from "@/stores/onboardingStore";

const onboardingStore = useOnboardingStore();
const feedback = useUiFeedback();
const promptInput = ref<InstanceType<typeof uiTextarea>>();
const projectSection = ref<HTMLElement>();
const activeSection = ref("create");
const viewOptions = [{ value: "grid", label: "网格", icon: IconLayoutGrid }, { value: "list", label: "列表", icon: IconList }];
const settingsVisible = ref(false);
const router = useRouter();
const creating = ref(false);
const opening = ref(false);
const promptWorkspacePicker = ref<InstanceType<typeof workspacePicker>>();
const relocationPicker = ref<InstanceType<typeof workspacePicker>>();
const prompt = ref("");
const workspaceStore = useWorkspaceStore();
const auth = useAuthStore();
const { project, projectList } = storeToRefs(workspaceStore);
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
  try {
    const { data } = await axios.get<{ code: number; data: Demo[]; message?: string }>("/api/demos/get");
    if (data.code !== 200) throw new Error(data.message || "Demo 读取失败");
    demos.value = data.data;
  } catch (error) { showError(error instanceof Error ? error.message : "Demo 读取失败"); }
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
    workspaceStore.renameProject(data.data.directory, data.data.name);
    await router.push("/workspace");
  } catch (error) {
    showError(axios.isAxiosError<{ message?: string }>(error) ? error.response?.data.message || "Demo 打开失败" : error instanceof Error ? error.message : "Demo 打开失败");
  } finally { opening.value = false; }
}
const workspaceDirectory = ref(project.value?.directory ?? "");
const placeholderPhrases = [
  "描述你想创作的内容，让灵感从这里开始…",
  "把一个故事灵感，变成一段精彩的短片…",
  "为你的主角设计独特的外形和性格…",
  "创作一段雨夜街头的电影感镜头…",
  "把这段文字拆解成连贯的分镜画面…",
  "为一场奇幻冒险生成场景和角色…",
  "为你的画面配上一段合适的音乐…",
  "写一段温暖的旁白，讲述这个故事…",
  "设计一支富有想象力的产品宣传片…",
  "从一句话开始，搭建你的创作工作流…",
];
const promptPlaceholder = ref(placeholderPhrases[0]!);

onMounted(() => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  let phraseIndex = 0;
  watch(() => !!prompt.value, (hasInput, _previous, onCleanup) => {
    if (hasInput) return;
    let characterCount = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    promptPlaceholder.value = "";

    function typePlaceholder() {
      const phrase = placeholderPhrases[phraseIndex]!;
      characterCount += deleting ? -1 : 1;
      promptPlaceholder.value = phrase.slice(0, characterCount);
      let delay = deleting ? 35 : 85;
      if (characterCount === phrase.length) {
        deleting = true;
        delay = 1800;
      } else if (characterCount === 0) {
        deleting = false;
        phraseIndex = (phraseIndex + 1) % placeholderPhrases.length;
        delay = 300;
      }
      timer = setTimeout(typePlaceholder, delay);
    }

    timer = setTimeout(typePlaceholder, 300);
    onCleanup(() => clearTimeout(timer));
  }, { immediate: true });
});

const selectedModel = ref("");
const reasoningEffort = ref("");
const sortDescending = ref(true);
const viewMode = ref("grid");
const sortedProjects = computed(() => [...projectList.value].sort((left, right) =>
  sortDescending.value ? right.lastOpenedAt - left.lastOpenedAt : left.lastOpenedAt - right.lastOpenedAt
));

async function openProject(project?: Project) {
  if (creating.value || opening.value) return;
  opening.value = true;
  try {
    const directory = project?.directory ?? await relocationPicker.value?.chooseDirectory();
    if (!directory) return;
    try { await workspaceStore.openProject(directory); }
    catch (err) {
      if (!project || !axios.isAxiosError(err) || err.response?.status !== 404) throw err;
      const reselect = await feedback.confirm(`项目“${project.name}”的文件夹不存在，是否重新选择文件夹？`, "工作目录不存在", {
        confirmButtonText: "重新选择", cancelButtonText: "取消",
      }).then(() => true, () => false);
      if (!reselect) return;
      const directory = await relocationPicker.value?.chooseDirectory();
      if (!directory) return;
      await workspaceStore.openProject(directory, project.directory);
    }
    await router.push("/workspace");
  } catch (err) {
    showError(axios.isAxiosError<{ message?: string }>(err)
      ? err.response?.data.message || "无法打开项目，请重试"
      : err instanceof Error ? err.message : "无法打开项目，请重试");
  } finally { opening.value = false; }
}

async function renameProject(project: Project) {
  const result = await feedback.prompt("请输入项目名称", "重命名项目", {
    inputValue: project.name, confirmButtonText: "保存", cancelButtonText: "取消",
    inputValidator: value => !!value?.trim() || "项目名称不能为空",
  }).catch(() => null);
  if (result) workspaceStore.renameProject(project.directory, result.value);
}

async function removeProject(project: Project) {
  const confirmed = await feedback.confirm(
    `确定要从列表中移除项目“${project.name}”吗？\n（仅从最近打开记录中移除，不会删除磁盘上的项目文件夹及内容）`,
    "移除项目",
    {
      danger: true,
      confirmButtonText: "确认移除",
      cancelButtonText: "取消",
    }
  ).then(() => true, () => false);

  if (confirmed) {
    workspaceStore.removeProject(project.directory);
  }
}

function handleSelectTheme(theme: OnboardingTheme) {
  prompt.value = theme.prompt;
}

async function createProject(fromPrompt = true) {
  if (creating.value || opening.value) return;
  creating.value = true;
  try {
    let path = workspaceDirectory.value;
    if (!path) {
      path = await (fromPrompt ? promptWorkspacePicker.value : relocationPicker.value)?.chooseDirectory() ?? "";
      if (!path) return;
    } else if (!fromPrompt) {
      const confirmed = await feedback.confirm("请选择一个空文件夹作为项目目录，画布和素材将保存在其中。", "添加项目", {
        confirmButtonText: "选择空文件夹", cancelButtonText: "取消",
      }).then(() => true, () => false);
      if (!confirmed) return;
      path = await relocationPicker.value?.chooseDirectory() ?? "";
      if (!path) return;
    }
    const { directory, entries } = await useWorkspaceFiles(path).list();
    const systemFiles = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
    const userEntries = entries.filter(entry => !systemFiles.has(entry.name.toLowerCase()) && !entry.name.startsWith("._"));
    const hasCanvas1 = entries.some(entry => entry.name === "画布1.json");
    const isExistingProject = userEntries.some(entry => entry.name.endsWith(".json"))
      || projectList.value.some(p => p.directory === directory)
      || project.value?.directory === directory;

    if (userEntries.length > 0 && !isExistingProject && !onboardingStore.homeTourActive) {
      return feedback.message({ tone: "warning", message: "该文件夹不为空且不包含漫剧项目，请重新选择空文件夹或已有项目目录。" });
    }

    if (!hasCanvas1 && !isExistingProject) {
      await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    }
    await workspaceStore.openProject(directory);
    if (fromPrompt && prompt.value.trim()) {
      workspaceStore.pendingAgentMessage = { directory: workspaceStore.project!.directory, prompt: prompt.value, model: selectedModel.value, reasoningEffort: reasoningEffort.value };
    }
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
function showError(message: string) { feedback.message({ tone: "error", message }); }
function focusCreation() { activeSection.value = "create"; promptInput.value?.textarea?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); promptInput.value?.focus(); }
function focusProjects() { activeSection.value = "projects"; projectSection.value?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
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
    .homeIntro h1 { margin: 0; font-family: "Songti SC", "STSong", "Noto Serif CJK SC", "SimSun", serif; font-size: clamp(42px, 3.8vw, 56px); line-height: 1.25; font-weight: 500; letter-spacing: -2px; br { display: none; } span { color: var(--uiActionPrimary); } }
    .homeOverview {
      display: grid; grid-template-columns: minmax(0, 560px); gap: 48px; align-items: start;
      &.hasDemos { grid-template-columns: minmax(0, 1fr) 360px; }
      .creationPanel {
        min-width: 0;
        .creationHeading {
          margin-bottom: 20px;
          .creationMode { display: flex; align-items: center; gap: 10px; min-height: 30px; margin: 0; color: var(--uiTextMuted); font-size: 12px; font-weight: 400; letter-spacing: 2px; &::before { content: ""; width: 16px; height: 1px; background: var(--uiActionPrimary); } }
        }
        .creationContent {
          min-width: 0;
          .composer {
            padding: 16px 16px 12px; border: 1px solid var(--uiBorderDefault); border-radius: 10px;
            background: color-mix(in srgb, var(--uiSurfaceRaised) 65%, var(--uiBackgroundBase));
            transition: border-color var(--uiMotionDuration) var(--uiMotionEase);
            &:focus-within { border-color: var(--uiBorderFocus); }
            .promptInput { min-height: 54px; padding: 0; border: 0; border-radius: 0; background: transparent; font-size: 14px; outline: none; }
            .composerFooter {
              display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--uiBorderDefault);
              :deep(.workspaceButton) { max-width: min(280px, 100%); padding-inline: 0; color: var(--uiTextMuted); }
              .sendActions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-left: auto; min-width: 0; max-width: 100%; .modelSelect { max-width: 170px; } :deep(.uiIconButton) { width: 36px; height: 36px; border-radius: 50%; } }
            }
          }
          .workspaceHint { margin: 10px 0 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; }
        }
      }
      .demoCollection {
        display: flex; flex-direction: column; gap: 20px; min-width: 0;
        .demoHeader { min-height: 30px; h2 { display: flex; align-items: center; gap: 16px; margin: 0; font-size: 20px; font-weight: 500; letter-spacing: 0.5px; &::after { content: ""; width: 80px; height: 1px; background: var(--uiBorderDefault); } } }
        .demoItems {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 32px 24px;
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
      }
    }
    .projectList {
      min-width: 0; padding-top: 28px; border-top: 1px solid var(--uiBorderDefault); scroll-margin-top: 24px;
      .projectHeader {
        display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px;
        h2 { margin: 0; font-size: 20px; font-weight: 500; letter-spacing: 0.5px; }
        .projectToolbar {
          display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
          :deep(.uiButton) { font-size: 12px; }
          :deep(.uiRadioGroup) { border: 0; background: transparent; .uiRadio { font-size: 12px; &:has(input:checked) { color: var(--uiActionPrimary); background: var(--uiActionSoft); } } }
        }
      }
      .projectItems {
        display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 40px;
        .projectCard {
          display: grid; grid-template-columns: 24px minmax(0, 1fr) 60px; grid-template-rows: auto auto; gap: 8px 16px; align-items: start;
          min-width: 0; padding: 20px 0; border-bottom: 1px solid var(--uiBorderDefault);
          transition: border-color var(--uiMotionDuration) var(--uiMotionEase);
          &:hover, &:focus-within { border-bottom-color: var(--uiBorderControl); .projectNumber { color: var(--uiActionPrimary); } .projectActions { opacity: 1; } }
          .projectNumber { grid-column: 1; grid-row: 1 / 3; padding-top: 5px; color: var(--uiTextMuted); font-size: 11px; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
          .projectActions { grid-column: 3; grid-row: 1 / 3; display: flex; gap: 0; opacity: 0.55; transition: opacity var(--uiMotionDuration) var(--uiMotionEase); :deep(.uiIconButton) { width: 30px; height: 30px; } :deep(.variantDanger) { background: transparent; } }
          .projectEntry {
            grid-column: 2; grid-row: 1; display: block; width: 100%; min-width: 0; min-height: 0; padding: 0; border: 0; border-radius: 0; background: transparent; text-align: left;
            :deep(.buttonLabel) { display: flex; flex-direction: column; align-items: stretch; gap: 5px; width: 100%; }
            .projectName, .projectPath { display: block; width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .projectName { color: var(--uiTextPrimary); font-size: 16px; font-weight: 500; }
            .projectPath { color: var(--uiTextMuted); font-size: 11px; font-weight: 400; }
          }
          .projectTime { grid-column: 2; grid-row: 2; display: flex; flex-wrap: wrap; gap: 8px; color: var(--uiTextMuted); font-size: 10px; time { min-width: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; } }
        }
        &.listView { grid-template-columns: minmax(0, 1fr); .projectCard { grid-template-columns: 32px minmax(0, 1fr) 220px 60px; align-items: center; padding-block: 16px; .projectNumber { grid-row: 1; } .projectActions { grid-column: 4; grid-row: 1; } .projectTime { grid-column: 3; grid-row: 1; justify-content: flex-end; } } }
      }
    }
  }
  @media (max-width: 1200px) {
    .homeNavigation { padding-inline: 40px; gap: 24px; .secondaryNavigation .navigationItem { padding-inline: 8px; } }
    .homeContent { padding-inline: 40px; .homeIntro h1 { font-size: 48px; } .homeOverview { gap: 32px; &.hasDemos { grid-template-columns: minmax(0, 1fr) 320px; } } }
  }
  @media (max-width: 1000px) {
    .homeNavigation { .secondaryNavigation { .navigationItem { width: 36px; padding-inline: 0; :deep(.buttonLabel) { display: none; } } } }
  }
  @media (max-width: 900px) {
    .homeContent {
      .homeOverview {
        &.hasDemos { grid-template-columns: minmax(0, 1fr); }
        .creationPanel { width: 100%; max-width: 560px; }
      }
      .projectList .projectItems { column-gap: 28px; .projectCard { grid-template-columns: 20px minmax(0, 1fr) 30px; gap: 8px 12px; .projectActions { flex-direction: column; } } &.listView .projectCard { grid-template-columns: 24px minmax(0, 1fr) 170px 30px; } }
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
        .creationPanel {
          .creationHeading { margin-bottom: 12px; .creationMode { font-size: 11px; min-height: 20px; } }
          .creationContent { .composer { padding: 16px 16px 12px; .promptInput { min-height: 54px; font-size: 14px; } .composerFooter { margin-top: 8px; .sendActions { gap: 8px; .modelSelect { max-width: 150px; } } } } .workspaceHint { font-size: 10px; } }
        }
        .demoCollection { gap: 16px; .demoHeader { min-height: 0; h2 { font-size: 18px; } } .demoItems { grid-template-columns: minmax(0, 1fr); gap: 24px; .demoCard { display: grid; grid-template-columns: 154px minmax(0, 1fr); align-items: center; gap: 16px; max-width: none; .demoPreview { .demoPlay { left: 6px; bottom: 6px; gap: 4px; padding: 4px 6px; font-size: 10px; } } .demoContent { margin: 0; .demoCaption { align-items: flex-start; flex-direction: column; gap: 4px; h3 { font-size: 23px; } .demoOpen { min-height: 28px; font-size: 11px; } } .demoMeta { margin-top: 4px; font-size: 10px; } } } } }
      }
      .projectList {
        padding-top: 24px;
        .projectHeader { margin-bottom: 8px; gap: 12px; h2 { font-size: 18px; } .projectToolbar { gap: 4px; :deep(.uiButton) { padding-inline: 8px; } } }
        .projectItems { grid-template-columns: minmax(0, 1fr); .projectCard { grid-template-columns: 20px minmax(0, 1fr) 60px; gap: 8px 12px; padding-block: 18px; .projectActions { flex-direction: row; opacity: 1; } .projectEntry .projectName { font-size: 15px; } } &.listView .projectCard { grid-template-columns: 20px minmax(0, 1fr) 60px; .projectNumber { grid-row: 1 / 3; } .projectActions { grid-column: 3; grid-row: 1 / 3; } .projectTime { grid-column: 2; grid-row: 2; justify-content: flex-start; } } }
      }
    }
  }
}
</style>

<template>
  <div class="home">
    <aside class="homeSidebar" aria-label="主导航">
      <a class="homeBrand" href="#/home" aria-label="OmniStudio 首页"><img :src="logoUrl" alt="OmniStudio" /></a>
      <nav class="mainNavigation">
        <uiButton class="navigationItem" variant="ghost" :class="{ isSelected: activeSection === 'create' }" :icon="IconFolderPlus" @click="focusCreation">开始创作</uiButton>
        <uiButton class="navigationItem" variant="ghost" :class="{ isSelected: activeSection === 'projects' }" :icon="IconFolder" @click="focusProjects">我的项目</uiButton>
      </nav>
      <nav class="secondaryNavigation">
        <uiButton class="navigationItem" variant="ghost" :icon="IconUserCircle" @click="router.push('/account')">账户与积分</uiButton>
        <uiBadge dot :hidden="!hasDesktopUpdate" label="有新版本可用"><uiButton class="navigationItem" variant="ghost" :icon="IconSettings" :aria-label="hasDesktopUpdate ? '设置，有新版本可用' : '设置'" @click="settingsVisible = true">设置</uiButton></uiBadge>
        <uiButton class="navigationItem" variant="ghost" :icon="IconBrandGithub" tag="a" href="https://github.com/HBAI-Ltd/Toonflow-app" target="_blank" rel="noopener noreferrer">GitHub</uiButton>
      </nav>
    </aside>
    <main class="homeContent">
      <header class="homeHeader"><span>创作工作台</span></header>
      <section class="creationPanel" aria-labelledby="creationTitle">
        <img class="heroArtwork" :src="heroInk" alt="" aria-hidden="true" />
        <div class="creationContent">
          <span class="creationMode">漫剧创作</span>
          <h1 id="creationTitle">下一部漫剧，<br />由你开场。</h1>
          <img class="titleUnderline" :src="inkUnderline" alt="" aria-hidden="true" />
          <div class="composer">
            <uiTextarea ref="promptInput" v-model="prompt" class="promptInput" :rows="4" resize="none" :disabled="creating || opening" :placeholder="promptPlaceholder" aria-label="创作描述" />
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
          <article v-for="project in sortedProjects" :key="project.directory" class="projectCard">
            <div class="projectCardHeader">
              <icon-folder class="projectIcon" :size="20" aria-hidden="true" />
              <div class="projectActions">
                <uiIconButton size="small" :icon="IconEdit" :disabled="creating || opening" :label="`重命名项目 ${project.name}`" title="重命名" @click="renameProject(project)" />
                <uiIconButton size="small" variant="danger" :icon="IconTrash" :disabled="creating || opening" :label="`移除项目 ${project.name}`" title="从列表移除，不删除文件" @click="workspaceStore.removeProject(project.directory)" />
              </div>
            </div>
            <button class="projectEntry" type="button" :disabled="creating || opening" :aria-label="`打开项目 ${project.name}`" @click="openProject(project)">
              <span class="projectName" :title="project.name">{{ project.name }}</span>
              <span class="projectPath" :title="project.directory">{{ project.directory }}</span>
            </button>
            <div class="projectTime"><span>最近打开</span><time>{{ new Date(project.lastOpenedAt).toLocaleString('zh-CN', { hour12: false }) }}</time></div>
          </article>
        </div>
      </section>
    </main>
    <settings v-model="settingsVisible" />
    <workspacePicker ref="relocationPicker" hideTrigger />
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import { storeToRefs } from "pinia";
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { uiButton, uiIconButton, uiBadge, uiTextarea, uiRadioGroup, useUiFeedback } from "@toonflow/ui";
import {
  IconSettings, IconBrandGithub, IconUserCircle,
  IconArrowUp, IconLayoutGrid,
  IconList, IconSortDescending,
  IconSortAscending, IconFolder, IconEdit,
  IconTrash, IconFolderPlus, IconFolderOpen,
} from "@tabler/icons-vue";
import modelPopover from "@/components/modelPopover.vue";
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
import { useWorkspaceStore, type Project } from "@/stores/workspace";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import settings from "@/components/settings/index.vue";
import heroInk from "@toonflow/assets/illustrations/heroInk.png";
import inkUnderline from "@toonflow/assets/illustrations/inkUnderline.svg";
import workspacePicker from "./workspacePicker.vue";

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
const { project, projectList } = storeToRefs(workspaceStore);
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

async function createProject(fromPrompt = true) {
  if (creating.value || opening.value || (fromPrompt && !workspaceDirectory.value)) return;
  creating.value = true;
  try {
    let path = workspaceDirectory.value;
    if (!fromPrompt) {
      const confirmed = await feedback.confirm("请选择一个空文件夹作为项目目录，画布和素材将保存在其中。", "添加项目", {
        confirmButtonText: "选择空文件夹", cancelButtonText: "取消",
      }).then(() => true, () => false);
      if (!confirmed) return;
      path = await relocationPicker.value?.chooseDirectory() ?? "";
      if (!path) return;
    }
    const { directory, empty } = await useWorkspaceFiles(path).list();
    if (!empty) return feedback.message({ tone: "warning", message: "该文件夹不为空，请重新选择空文件夹；已有项目请使用“导入项目”或点击项目列表打开。" });
    await useWorkspaceFiles(directory).writeJson("画布1.json", { toonflowCanvas: true, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }, true);
    await workspaceStore.openProject(directory);
    if (fromPrompt && prompt.value.trim()) {
      workspaceStore.pendingAgentMessage = { directory: workspaceStore.project!.directory, prompt: prompt.value, model: selectedModel.value, reasoningEffort: reasoningEffort.value };
    }
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
function focusProjects() { activeSection.value = "projects"; projectSection.value?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
</script>

<style lang="scss" scoped>
.home {
  display: grid; grid-template-columns: 208px minmax(0, 1fr); min-height: 100dvh; color: var(--uiTextPrimary); background: var(--uiBackgroundBase);
  .homeSidebar {
    position: sticky; top: 0; display: flex; flex-direction: column; gap: 36px; height: 100dvh; min-width: 0; padding: 20px 16px 28px; border-right: 1px solid var(--uiBorderDefault); background: var(--uiBackgroundSubtle);
    .homeBrand { display: block; margin: 0 4px; img { display: block; width: 100%; height: auto; border-radius: 8px; background: #101010; } }
    .mainNavigation, .secondaryNavigation { display: flex; flex-direction: column; gap: 10px; }
    .secondaryNavigation { margin-top: auto; :deep(.uiBadge) { width: 100%; } }
    .navigationItem { width: 100%; justify-content: flex-start; min-height: 40px; padding-inline: 12px; &.isSelected { color: var(--uiActionPrimary); background: var(--uiActionSoft); } }
  }
  .homeContent {
    display: flex; flex-direction: column; gap: clamp(32px, 4dvh, 56px); min-width: 0; min-height: 100dvh;
    padding: clamp(28px, 4dvh, 48px) clamp(32px, 4vw, 64px) clamp(40px, 5dvh, 64px);
    .homeHeader { flex-shrink: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
    .creationPanel {
      position: relative; isolation: isolate; display: flex; align-items: center; flex: 1; min-height: 480px;
      .heroArtwork { position: absolute; z-index: -1; top: 50%; transform: translateY(-50%); right: -32px; width: min(56%, 682px); height: auto; aspect-ratio: 3 / 2; object-fit: contain; pointer-events: none; }
      .creationContent { width: min(100%, 708px); padding-top: 10px; }
      .creationMode { display: inline-flex; align-items: center; min-height: 30px; padding: 4px 16px; border-radius: 2px; transform: rotate(-2deg); color: var(--uiTextOnAccent); background: var(--uiActionPrimary); font-size: var(--uiFontLabel); font-weight: 600; }
      h1 { position: relative; width: fit-content; margin: 28px 0 4px; font-size: clamp(38px, 4vw, 60px); line-height: 1.27; font-weight: 900; letter-spacing: -1.5px; }
      .titleUnderline { display: block; width: min(340px, 64%); height: auto; margin-bottom: 34px; }
      .composer { padding: 22px 20px 12px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); &:focus-within { border-color: var(--uiBorderFocus); } .promptInput { min-height: 112px; padding: 0; border: 0; background: transparent; font-size: var(--uiFontBody); outline: none; } }
      .composerFooter { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; .sendActions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-left: auto; min-width: 0; .modelSelect { width: 240px; max-width: min(240px, 100%); } } }
      .workspaceHint { margin: 12px 4px 0; max-width: 65ch; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.6; }
    }
    .projectList {
      flex-shrink: 0; min-width: 0; scroll-margin-top: 24px;
      .projectHeader { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; h2 { margin: 0; font-size: var(--uiFontHeading); font-weight: 700; } .projectToolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; } }
      .projectItems {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 24px;
        .projectCard { min-width: 0; padding: 20px 24px 16px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiBackgroundSubtle); transition: border-color var(--uiMotionDuration) var(--uiMotionEase); &:hover, &:focus-within { border-color: var(--uiBorderControl); } .projectCardHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; .projectIcon { color: var(--uiTextMuted); } .projectActions { display: flex; gap: 4px; } } .projectEntry { display: flex; flex-direction: column; gap: 8px; width: 100%; min-width: 0; margin: 0; padding: 0 0 20px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; &:disabled { cursor: wait; opacity: 0.6; } .projectName, .projectPath { display: block; width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .projectName { font-size: var(--uiFontTitle); font-weight: 700; } .projectPath { color: var(--uiTextMuted); font-size: var(--uiFontControl); } } .projectTime { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding-top: 14px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: var(--uiFontControl); time { min-width: 0; overflow-wrap: anywhere; } } }
        &.listView { grid-template-columns: 1fr; .projectCard { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; align-items: center; gap: 24px; .projectCardHeader { margin: 0; } .projectEntry { padding: 0; } .projectTime { max-width: 260px; padding: 0; border: 0; } } }
      }
    }
  }
  @media (max-width: 1200px) { grid-template-columns: 176px minmax(0, 1fr); .homeSidebar { padding-inline: 12px; } .homeContent { padding-inline: 32px; .creationPanel { min-height: 480px; .heroArtwork { width: 62%; right: -20px; opacity: 0.65; } .creationContent { width: min(100%, 640px); } } } }
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr); .homeSidebar { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; border-right: 0; border-bottom: 1px solid var(--uiBorderDefault); .homeBrand { width: 140px; margin: 0; } .mainNavigation, .secondaryNavigation { flex-direction: row; gap: 4px; margin: 0; .navigationItem { width: auto; padding-inline: 8px; } } } .homeContent { padding: 24px 20px 40px; .creationPanel { min-height: 460px; .heroArtwork { width: 78%; opacity: 0.35; } } .projectList .projectItems.listView .projectCard { grid-template-columns: 1fr; gap: 14px; .projectTime { max-width: none; } } } }
}
</style>

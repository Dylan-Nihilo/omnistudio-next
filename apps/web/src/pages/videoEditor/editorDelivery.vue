<template>
  <section class="deliveryPanel" aria-label="成片项目登记">
    <header class="deliveryHeader">
      <div class="deliveryFile">
        <span class="deliveryKicker">导出文件</span>
        <strong :title="result.name">{{ result.name }}</strong>
        <small :title="result.path">{{ result.path }}</small>
      </div>
      <div class="deliveryHeaderActions">
        <a class="deliveryDownload" :href="resultUrl" :download="result.name" :aria-disabled="!resultUrl">下载 MP4</a>
        <button type="button" class="deliveryOpen" :disabled="disabled || busy || projectsLoading || sessionChanged" @click="loadProjects">刷新项目</button>
        <slot name="extraActions" />
      </div>
    </header>

    <div class="deliveryBody">
      <div class="deliveryFields">
        <label class="deliveryField">
          <span>制作项目</span>
          <select v-model="selectedProjectId" :disabled="disabled || projectsLoading || busy || sessionChanged || !projects.length">
            <option value="" disabled>{{ projectsLoading ? "正在读取项目…" : projects.length ? "选择项目" : "没有可提交的项目" }}</option>
            <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.title }} · {{ roleLabels[project.role] }}</option>
          </select>
        </label>
        <label class="deliveryField">
          <span>关联剧集</span>
          <select v-model="selectedEpisodeId" :disabled="disabled || busy || projectLoading || sessionChanged || !selectedProjectId">
            <option value="">不关联剧集</option>
            <option v-for="episode in episodes" :key="episode.id" :value="episode.id">第 {{ episode.episodeNumber }} 集 · {{ episode.title }}</option>
          </select>
        </label>
        <label class="deliveryField deliveryTitleField">
          <span>成片名称</span>
          <input v-model.trim="title" maxlength="200" :disabled="disabled || busy || sessionChanged" placeholder="输入本次成片名称" />
        </label>
      </div>
      <div class="deliveryFooter">
        <p v-if="sessionChanged" class="deliveryError" role="alert">登录账户已切换，请重新打开剪辑台后提交。</p>
        <p v-else-if="errorMessage" class="deliveryError" role="alert">{{ errorMessage }}</p>
        <p v-else-if="successMessage" class="deliverySuccess" role="status">{{ successMessage }}</p>
        <p v-else-if="selectedProjectId && submittedTargets.has(currentTargetKey)" class="deliveryNotice" role="status">此导出已提交到当前项目与剧集，不能重复登记。</p>
        <p v-else class="deliveryHint">登记时会归档此 MP4 与对应剪辑工程快照，并生成待审片版本。</p>
        <button class="deliverySubmit" type="button" :disabled="!canSubmit" @click="submitCut">
          {{ busy ? "正在归档…" : "提交到项目审片" }}
        </button>
      </div>
      <ul v-if="submissions.length" class="deliveryHistory" aria-label="本次导出登记记录">
        <li v-for="submission in submissions" :key="submission.cutId">
          <span><strong>{{ submission.title }}</strong><small>待审片 · {{ submission.projectTitle }} · {{ submission.episodeTitle }}</small></span>
          <button type="button" class="deliveryOpen" :disabled="disabled || sessionChanged" @click="openProjectReview(submission.projectId)">打开审片</button>
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import axios from "axios";
import { useRouter } from "vue-router";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { getSessionSnapshot } from "@/lib/sessionState";

type EditorDeliveryResult = {
  directory: string;
  path: string;
  name: string;
  projectPath: string;
  revision: string;
  sourceReferences: { type: string; id: string; label?: string }[];
};
type ProjectOption = { id: string; title: string; role: "owner" | "producer" | "editor" };
type EpisodeOption = { id: string; episodeNumber: number; title: string };
type ApiResponse<T> = { code: number; data: T; message: string };
type SubmittedCut = { id: string; projectId: string; title: string };
type DeliveryRecord = { cutId: string; projectId: string; projectTitle: string; episodeTitle: string; title: string };

const props = withDefaults(defineProps<{
  result: EditorDeliveryResult;
  initialProjectId?: string;
  initialEpisodeId?: string;
  disabled?: boolean;
}>(), { disabled: false });
const emit = defineEmits<{ submitted: [payload: { projectId: string; cutId: string }] }>();
const router = useRouter();
const initialIdentity = getSessionSnapshot();
const files = useWorkspaceFiles(() => props.result.directory);
const resultUrl = computed(() => sessionChanged.value || !initialIdentity.userId || !props.result.path ? "" : files.mediaUrl(props.result.path));
const projects = ref<ProjectOption[]>([]);
const episodes = ref<EpisodeOption[]>([]);
const selectedProjectId = ref("");
const loadedProjectId = ref("");
const selectedEpisodeId = ref("");
const title = ref("");
const projectsLoading = ref(false);
const projectLoading = ref(false);
const busy = ref(false);
const errorMessage = ref("");
const successMessage = ref("");
const submittedTargets = ref(new Set<string>());
const submissions = ref<DeliveryRecord[]>([]);
const sessionChanged = ref(false);
const roleLabels: Record<ProjectOption["role"], string> = { owner: "所有者", producer: "制片人", editor: "剪辑师" };
let active = true;
let requestVersion = 0;
let projectRequestVersion = 0;
let submitVersion = 0;
let projectController: AbortController | undefined;
let submitController: AbortController | undefined;
const exportKey = computed(() => JSON.stringify([props.result.directory, props.result.path, props.result.revision]));
const currentTargetKey = computed(() => JSON.stringify([exportKey.value, selectedProjectId.value, selectedEpisodeId.value]));
const canSubmit = computed(() => !props.disabled && !busy.value && !projectsLoading.value && !projectLoading.value && !sessionChanged.value
  && !!initialIdentity.userId && !!selectedProjectId.value && loadedProjectId.value === selectedProjectId.value && !!title.value.trim() && /^.+\.mp4$/i.test(props.result.path)
  && /^[\da-f]{64}$/i.test(props.result.revision) && !!props.result.projectPath && !submittedTargets.value.has(currentTargetKey.value));

function errorText(error: unknown) {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data?.message || error.message || "请求失败，请重试";
  return error instanceof Error ? error.message : "请求失败，请重试";
}
function isCurrent(version: number, userId = initialIdentity.userId, revision = initialIdentity.revision) {
  const session = getSessionSnapshot();
  return active && version === requestVersion && session.userId === userId && session.revision === revision && !sessionChanged.value;
}
function requestSignal(controller: AbortController, session: ReturnType<typeof getSessionSnapshot>) {
  return AbortSignal.any([controller.signal, session.signal]);
}

async function loadProjects() {
  const version = ++requestVersion;
  const session = getSessionSnapshot();
  projectsLoading.value = true;
  errorMessage.value = "";
  try {
    const { data } = await axios.get<ApiResponse<ProjectOption[]>>("/api/productionProjects/list", { signal: session.signal });
    if (!isCurrent(version, session.userId, session.revision)) return;
    projects.value = data.data.filter(project => ["owner", "producer", "editor"].includes(project.role));
    const preferred = props.initialProjectId && projects.value.some(project => project.id === props.initialProjectId) ? props.initialProjectId : "";
    const current = projects.value.some(project => project.id === selectedProjectId.value) ? selectedProjectId.value : "";
    const nextProjectId = preferred || (props.initialProjectId ? "" : current || projects.value[0]?.id || "");
    if (nextProjectId && selectedProjectId.value === nextProjectId) void loadProjectEpisodes(nextProjectId);
    selectedProjectId.value = nextProjectId;
    if (props.initialProjectId && !preferred) errorMessage.value = "当前账户在指定项目中没有剪辑提交权限，请手动选择其他制作项目。";
  } catch (error) {
    if (isCurrent(version, session.userId, session.revision)) errorMessage.value = errorText(error);
  } finally {
    if (isCurrent(version, session.userId, session.revision)) projectsLoading.value = false;
  }
}

async function loadProjectEpisodes(projectId: string) {
  projectController?.abort();
  const controller = new AbortController();
  projectController = controller;
  const version = ++projectRequestVersion;
  const session = getSessionSnapshot();
  const requestRevision = session.revision;
  const userId = session.userId;
  loadedProjectId.value = "";
  episodes.value = [];
  selectedEpisodeId.value = "";
  if (!projectId) { projectLoading.value = false; return; }
  projectLoading.value = true;
  try {
    const { data } = await axios.get<ApiResponse<{ episodes: EpisodeOption[] }>>("/api/productionProjects/get", {
      params: { projectId },
      signal: requestSignal(controller, session),
    });
    const latestSession = getSessionSnapshot();
    if (!active || version !== projectRequestVersion || latestSession.userId !== userId || latestSession.revision !== requestRevision || projectId !== selectedProjectId.value || sessionChanged.value) return;
    episodes.value = data.data.episodes;
    selectedEpisodeId.value = episodes.value.some(episode => episode.id === props.initialEpisodeId) ? props.initialEpisodeId! : "";
    loadedProjectId.value = projectId;
  } catch (error) {
    if (active && version === projectRequestVersion && !controller.signal.aborted && !sessionChanged.value) errorMessage.value = errorText(error);
  } finally {
    if (active && version === projectRequestVersion) projectLoading.value = false;
  }
}

async function submitCut() {
  if (!canSubmit.value) return;
  const project = projects.value.find(item => item.id === selectedProjectId.value);
  if (!project) return;
  const version = requestVersion;
  const session = getSessionSnapshot();
  const episode = episodes.value.find(item => item.id === selectedEpisodeId.value);
  const targetKey = currentTargetKey.value;
  const sourceKey = exportKey.value;
  const attempt = ++submitVersion;
  const submitTitle = title.value.trim();
  const controller = new AbortController();
  submitController = controller;
  busy.value = true;
  errorMessage.value = "";
  successMessage.value = "";
  try {
    const { data } = await axios.post<ApiResponse<SubmittedCut>>("/api/productionProjects/cuts/create", {
      projectId: project.id,
      ...(episode ? { episodeId: episode.id } : {}),
      directory: props.result.directory,
      videoPath: props.result.path,
      editorProjectPath: props.result.projectPath,
      editorRevision: props.result.revision,
      title: submitTitle,
      sourceReferences: props.result.sourceReferences,
    }, { signal: requestSignal(controller, session) });
    if (!isCurrent(version, session.userId, session.revision) || attempt !== submitVersion || sourceKey !== exportKey.value) return;
    if (!data.data?.id || data.data.projectId !== project.id) throw new Error("服务端没有返回有效的成片登记编号");
    submittedTargets.value = new Set(submittedTargets.value).add(targetKey);
    const record = { cutId: data.data.id, projectId: project.id, projectTitle: project.title, episodeTitle: episode ? `第 ${episode.episodeNumber} 集 · ${episode.title}` : "全项目", title: data.data.title || submitTitle };
    submissions.value = [record, ...submissions.value.filter(item => item.cutId !== record.cutId)];
    successMessage.value = `已将「${record.title}」归档至「${project.title}」${episode ? ` · 第 ${episode.episodeNumber} 集` : ""}，等待审片。`;
    emit("submitted", { projectId: project.id, cutId: data.data.id });
  } catch (error) {
    if (isCurrent(version, session.userId, session.revision) && attempt === submitVersion && !controller.signal.aborted) errorMessage.value = errorText(error);
  } finally {
    if (isCurrent(version, session.userId, session.revision) && attempt === submitVersion) busy.value = false;
  }
}

function openProjectReview(projectId: string) {
  if (props.disabled || sessionChanged.value) return;
  void router.push({ path: `/productionProjects/${projectId}`, query: { stage: "review" } });
}

function handleAccountChanged() {
  sessionChanged.value = true;
  requestVersion++;
  projectRequestVersion++;
  submitVersion++;
  projectController?.abort();
  submitController?.abort();
  projects.value = [];
  episodes.value = [];
  selectedProjectId.value = "";
  loadedProjectId.value = "";
  selectedEpisodeId.value = "";
  projectsLoading.value = false;
  projectLoading.value = false;
  busy.value = false;
}

watch(selectedProjectId, projectId => {
  successMessage.value = "";
  if (projects.value.some(project => project.id === projectId)) errorMessage.value = "";
  void loadProjectEpisodes(projectId);
});
watch(selectedEpisodeId, () => { successMessage.value = ""; });
watch(() => [props.initialProjectId, projects.value.length], () => {
  if (!projects.value.length || !props.initialProjectId || !projects.value.some(project => project.id === props.initialProjectId)) return;
  if (selectedProjectId.value !== props.initialProjectId) selectedProjectId.value = props.initialProjectId;
});
watch(exportKey, () => {
  submitVersion++;
  submitController?.abort();
  busy.value = false;
  title.value = props.result.name.replace(/\.[^.]+$/, "");
  successMessage.value = "";
  errorMessage.value = "";
  submittedTargets.value = new Set();
  submissions.value = [];
}, { immediate: true });
watch(() => props.initialEpisodeId, episodeId => {
  if (episodeId && episodes.value.some(episode => episode.id === episodeId)) selectedEpisodeId.value = episodeId;
});
onMounted(() => {
  window.addEventListener("omnistudio-next:account-changed", handleAccountChanged);
  window.addEventListener("omnistudio-next:session-invalid", handleAccountChanged);
  void loadProjects();
});
onBeforeUnmount(() => {
  active = false;
  requestVersion++;
  projectRequestVersion++;
  submitVersion++;
  projectController?.abort();
  submitController?.abort();
  window.removeEventListener("omnistudio-next:account-changed", handleAccountChanged);
  window.removeEventListener("omnistudio-next:session-invalid", handleAccountChanged);
});
</script>

<style scoped lang="scss">
.deliveryPanel {
  flex: 0 0 auto;
  width: min(100%, 1180px);
  margin: 10px auto 0;
  overflow: hidden;
  border: 1px solid #374139;
  border-radius: 5px;
  color: #d8e0da;
  background: #202521;
  font-size: 11px;
  .deliveryHeader, .deliveryBody { padding: 12px 14px; }
  .deliveryHeader { display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid #343d36; }
  .deliveryFile { display: grid; min-width: 0; gap: 4px; .deliveryKicker { color: #8e9a91; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; } strong { overflow: hidden; color: #dfe9e1; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; } small { overflow: hidden; color: #828e85; font: 9px ui-monospace, monospace; text-overflow: ellipsis; white-space: nowrap; } }
  .deliveryHeaderActions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
  .deliveryDownload, .deliverySubmit, .deliveryOpen { display: inline-flex; align-items: center; justify-content: center; min-height: 30px; padding: 0 11px; border: 1px solid #4d8064; border-radius: 4px; color: #e8f3eb; background: #285940; font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; &:hover:not([aria-disabled="true"]):not(:disabled) { background: #326e50; } &:focus-visible { outline: 2px solid #90c9a2; outline-offset: 2px; } }
  .deliveryDownload[aria-disabled="true"] { opacity: .45; pointer-events: none; }
  .deliveryBody { display: grid; gap: 10px; }
  .deliveryFields { display: grid; grid-template-columns: minmax(160px, 1.15fr) minmax(160px, 1fr) minmax(180px, 1fr); gap: 9px; }
  .deliveryField { display: grid; min-width: 0; gap: 5px; color: #8e9a91; font-size: 9px; }
  .deliveryField :is(input, select) { width: 100%; min-width: 0; min-height: 30px; padding: 5px 8px; border: 1px solid #3d493f; border-radius: 4px; outline: 0; color: #dfe7e0; background: #181c19; font: inherit; font-size: 11px; &:focus { border-color: #6eaa87; box-shadow: 0 0 0 2px rgb(112 172 137 / 17%); } &:disabled { color: #748078; background: #202622; cursor: not-allowed; } }
  .deliveryFooter { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 32px; }
  .deliveryFooter p { min-width: 0; margin: 0; color: #87938a; font-size: 10px; line-height: 1.5; }
  .deliveryFooter .deliveryError { color: #e2a18b; }
  .deliveryFooter .deliveryNotice { color: #dcbf84; }
  .deliveryFooter .deliverySuccess { color: #9dd0ac; }
  .deliverySubmit:disabled, .deliveryOpen:disabled { border-color: #3b443e; color: #77847b; background: #303631; cursor: not-allowed; }
  .deliveryHistory { display: grid; gap: 5px; margin: 0; padding: 8px 0 0; border-top: 1px solid #343d36; list-style: none; li { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 5px 0; } li > span { display: grid; min-width: 0; gap: 3px; } strong { overflow: hidden; color: #cbd6cd; font-size: 10px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; } small { color: #818d84; font-size: 9px; } }
  .deliveryOpen { min-height: 25px; padding-inline: 8px; border-color: #465149; color: #bac8bd; background: #2b322d; font-size: 9px; font-weight: 500; }
}
@media (max-width: 720px) {
  .deliveryPanel { .deliveryHeader { align-items: flex-start; flex-direction: column; gap: 10px; } .deliveryHeaderActions { width: 100%; } .deliveryFields { grid-template-columns: 1fr 1fr; } .deliveryTitleField { grid-column: 1 / -1; } }
}
@media (max-width: 450px) { .deliveryPanel { .deliveryFields { grid-template-columns: 1fr; } .deliveryTitleField { grid-column: auto; } .deliveryFooter { align-items: stretch; flex-direction: column; } } }
</style>

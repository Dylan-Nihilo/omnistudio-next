<template>
  <section class="scriptReader" :class="{ isCollapsed: sidebarCollapsed }" aria-label="完整剧本">
    <aside class="scriptReaderSidebar" :class="{ isCollapsed: sidebarCollapsed }">
      <div class="scriptReaderSidebarHeader">
        <div v-if="!sidebarCollapsed"><span class="readerEyebrow">剧集目录</span><strong>分集剧本</strong></div>
        <button type="button" class="readerIconButton" :aria-label="sidebarCollapsed ? '展开剧集目录' : '收起剧集目录'" :title="sidebarCollapsed ? '展开目录' : '收起目录'" @click="sidebarCollapsed = !sidebarCollapsed"><icon-layout-sidebar-left-collapse v-if="!sidebarCollapsed" :size="17" /><icon-layout-sidebar-left-expand v-else :size="17" /></button>
      </div>
      <nav class="scriptReaderNav" aria-label="剧本目录">
        <button type="button" class="scriptReaderNavItem outlineNavItem" :class="{ selected: selectedSection === 'outline' }" :title="sidebarCollapsed ? '剧本大纲' : undefined" @click="scrollToSection('outline')"><span class="readerNavMark">梗</span><span v-if="!sidebarCollapsed" class="readerNavCopy"><strong>剧本大纲</strong><small>故事与创作输入</small></span></button>
        <div v-if="!sidebarCollapsed" class="readerNavDivider">分集</div>
        <button v-for="episode in currentDocument.episodes" :key="episode.episodeNumber" type="button" class="scriptReaderNavItem" :class="{ selected: selectedSection === episodeSectionId(episode.episodeNumber) }" :title="sidebarCollapsed ? `第 ${episode.episodeNumber} 集 ${episode.title}` : undefined" @click="scrollToSection(episodeSectionId(episode.episodeNumber))"><span class="readerNavMark">{{ String(episode.episodeNumber).padStart(2, '0') }}</span><span v-if="!sidebarCollapsed" class="readerNavCopy"><strong>第 {{ episode.episodeNumber }} 集</strong><small>{{ episode.title || '未命名剧集' }}</small></span></button>
      </nav>
      <div v-if="!sidebarCollapsed" class="scriptReaderSidebarFooter"><span>共 {{ currentDocument.episodes.length }} 集</span><span>V{{ viewedRevision }}</span></div>
    </aside>

    <main class="scriptReaderMain">
      <header class="scriptReaderToolbar">
        <div class="readerTitle"><span class="readerEyebrow">{{ viewingRevision ? `历史版本 V${viewingRevision}` : `正文版本 V${revision}` }}</span><h2>{{ viewingRevision ? '历史剧本' : '完整剧本' }}</h2></div>
        <div class="readerToolbarActions">
          <uiTag v-if="!loading && viewedSource === 'derived'" tone="warning">由分镜整理</uiTag>
          <uiTag v-else-if="!loading && viewedSource === 'imported'" tone="neutral">原稿导入</uiTag>
          <uiTag v-else-if="!loading && viewedSource === 'edited'" tone="success">已修订</uiTag>
          <uiTag v-else-if="!loading" tone="neutral">模型生成</uiTag>
          <uiTag v-if="locked && !loading" tone="neutral">生产已锁定</uiTag>
          <uiButton size="small" variant="secondary" :disabled="loading || saving || restoring || dirty || hasAiPending" @click="openHistory">版本历史</uiButton>
          <uiButton size="small" variant="secondary" :disabled="loading || saving || hasAiPending" @click="exportText">导出 TXT</uiButton>
          <template v-if="editing">
            <uiButton v-if="dirty" size="small" variant="secondary" :disabled="saving || hasAiPending" @click="cancelEditing">放弃修改</uiButton>
            <uiButton size="small" :loading="saving" :disabled="saving || !dirty || hasAiPending || !canEdit || locked" @click="saveDocument">保存正文</uiButton>
          </template>
          <uiButton v-if="viewingRevision" size="small" :disabled="loading || saving || restoring" @click="showCurrentVersion">返回当前版本</uiButton>
        </div>
      </header>

      <p v-if="errorMessage" class="scriptReaderError" role="alert">{{ errorMessage }}</p>
      <div v-if="loading" class="scriptReaderState" role="status">正在读取完整剧本…</div>
      <div v-else-if="!currentDocument.episodes.length" class="scriptReaderState">当前版本尚无完整分集正文。</div>
      <div v-else ref="contentElement" class="scriptReaderContent" @scroll="updateSelectedSection">
        <article id="script-outline" :ref="element => setSectionElement('outline', element)" class="scriptDocumentOutline">
          <div class="scriptDocumentSectionHeading"><span>剧本大纲</span><uiTag v-if="dirty" tone="warning">未保存</uiTag></div>
          <p v-if="viewedSource === 'derived'" class="scriptDerivedNote">该项目此前未保存独立正文，此处由已有分镜内容整理。</p>
          <productionScriptField v-if="editing" v-model="draftDocument.outline" :key="`${projectId}:outline`" fieldKey="outline" fieldLabel="剧本大纲" target="outline" :rows="6" :projectId="projectId" :revision="revision" :context="draftDocument" :disabled="saving || restoring || locked || !canEdit" @pendingChange="setAiPending" />
          <p v-else class="scriptDocumentBody">{{ currentDocument.outline || '暂无大纲' }}</p>
          <details v-if="currentDocument.sourceText" class="scriptSourceDetails">
            <summary>创作参考输入</summary>
            <label v-if="editing" class="scriptReaderField"><span>创作参考文本</span><uiTextarea v-model="draftDocument.sourceText" :rows="10" :disabled="saving || locked" resize="vertical" aria-label="创作参考文本" /></label>
            <pre v-else>{{ currentDocument.sourceText }}</pre>
          </details>
        </article>

        <article v-for="episode in currentDocument.episodes" :id="episodeSectionId(episode.episodeNumber)" :key="episode.episodeNumber" :ref="element => setSectionElement(episodeSectionId(episode.episodeNumber), element)" class="scriptDocumentEpisode">
          <div class="scriptDocumentSectionHeading"><span>第 {{ episode.episodeNumber }} 集</span><small>{{ wordCount(episode.body) }} 字</small></div>
          <label v-if="editing" class="scriptReaderField"><span>剧集标题</span><uiInput v-model.trim="episode.title" :disabled="saving || locked" aria-label="剧集标题" /></label>
          <h3 v-else>{{ episode.title || `第 ${episode.episodeNumber} 集` }}</h3>
          <productionScriptField v-if="editing" v-model="episode.body" :key="`${projectId}:episode${episode.episodeNumber}`" :fieldKey="`episode${episode.episodeNumber}`" :fieldLabel="`第 ${episode.episodeNumber} 集正文`" target="episode" :episodeNumber="episode.episodeNumber" :rows="16" :projectId="projectId" :revision="revision" :context="draftDocument" :disabled="saving || restoring || locked || !canEdit" @pendingChange="setAiPending" />
          <pre v-else class="scriptDocumentBody">{{ episode.body || '本集暂无正文。' }}</pre>
        </article>
      </div>
      <footer class="scriptReaderFooter"><span>{{ viewedRevision ? `版本 V${viewedRevision} · ${formatDate(viewedCreatedAt)}` : `当前版本 V${revision} · ${formatDate(viewedCreatedAt)}` }}<template v-if="dirty"> · 有未保存的修改</template></span><span>正文修订独立保存，不自动修改已确认的场景、镜头和视频。</span></footer>
    </main>

    <uiDialog v-model="historyVisible" title="剧本版本历史" width="min(620px, calc(100vw - 32px))" :closeOnClickModal="false">
      <p v-if="historyError" class="scriptReaderError" role="alert">{{ historyError }}</p>
      <div v-if="historyLoading" class="scriptHistoryState">正在读取版本记录…</div>
      <div v-else-if="!historyRecords.length" class="scriptHistoryState">暂无历史版本</div>
      <div v-else class="scriptHistoryList">
        <article v-for="record in historyRecords" :key="record.revision" class="scriptHistoryItem" :class="{ isCurrent: record.revision === revision }">
          <div><strong>版本 V{{ record.revision }}</strong><small>{{ formatDate(record.createdAt) }} · {{ record.episodeCount }} 集 · {{ sourceLabel(record.source) }}<template v-if="record.restoredFromRevision"> · 从 V{{ record.restoredFromRevision }} 恢复</template></small></div>
          <div class="scriptHistoryActions"><uiButton size="small" variant="secondary" :disabled="loading || saving || restoring || dirty || hasAiPending || record.revision === viewedRevision" @click="viewHistoryVersion(record.revision)">查看</uiButton><uiButton v-if="record.revision !== revision && canEdit && !locked" size="small" variant="ghost" :disabled="loading || saving || dirty || hasAiPending || restoring" @click="restoreVersion(record.revision)">恢复为新版本</uiButton></div>
        </article>
      </div>
    </uiDialog>

  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch, type ComponentPublicInstance } from "vue";
import axios from "axios";
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from "@tabler/icons-vue";
import { uiButton, uiDialog, uiInput, uiTag, uiTextarea, useUiFeedback } from "@omnistudio-next/ui";
import { authClient, type ApiResponse } from "@/lib/authApi";
import { usePlatformModelsStore } from "@/stores/platformModels";
import productionScriptField from "./productionScriptField.vue";

type ScriptEpisode = { episodeNumber: number; title: string; body: string };
type ScriptDocument = { outline: string; sourceText: string; episodes: ScriptEpisode[] };
type ScriptSource = "generated" | "imported" | "derived" | "edited";
type ScriptDocumentResponse = { document: ScriptDocument; revision: number; source: ScriptSource; createdAt: string | null; restoredFromRevision?: number | null };
type ScriptHistoryRecord = { id: string; revision: number; createdAt: string; source: ScriptSource; episodeCount: number; restoredFromRevision?: number | null };

const props = defineProps<{ projectId: string; canEdit: boolean; locked: boolean }>();
const emit = defineEmits<{ dirtyChange: [dirty: boolean] }>();
const feedback = useUiFeedback();
const platformModels = usePlatformModelsStore();
const emptyDocument = (): ScriptDocument => ({ outline: "", sourceText: "", episodes: [] });
const response = ref<ScriptDocumentResponse>({ document: emptyDocument(), revision: 0, source: "derived", createdAt: null });
const draftDocument = reactive<ScriptDocument>(emptyDocument());
const loading = ref(false);
const saving = ref(false);
const restoring = ref(false);
const errorMessage = ref("");
const historyError = ref("");
const historyVisible = ref(false);
const historyLoading = ref(false);
const historyRecords = ref<ScriptHistoryRecord[]>([]);
const viewingRevision = ref<number | null>(null);
const historicalResponse = ref<ScriptDocumentResponse | null>(null);
const sidebarCollapsed = ref(false);
const selectedSection = ref("outline");
const contentElement = ref<HTMLElement>();
const sectionElements = new Map<string, HTMLElement>();
let documentRequestId = 0;
let historyRequestId = 0;
let mutationRequestId = 0;
const aiPending = reactive<Record<string, boolean>>({});
const hasAiPending = computed(() => Object.values(aiPending).some(Boolean));
const dirty = computed(() => JSON.stringify(draftDocument) !== JSON.stringify(response.value.document));
const currentDocument = computed(() => historicalResponse.value?.document ?? draftDocument);
const revision = computed(() => response.value.revision);
const viewedRevision = computed(() => viewingRevision.value ?? revision.value);
const viewedSource = computed(() => historicalResponse.value?.source ?? response.value.source);
const viewedCreatedAt = computed(() => historicalResponse.value?.createdAt ?? response.value.createdAt);
const isViewingHistory = computed(() => viewingRevision.value !== null);
const editing = computed(() => props.canEdit && !props.locked && !isViewingHistory.value && !loading.value);

watch([dirty, hasAiPending], () => emit("dirtyChange", dirty.value || hasAiPending.value), { immediate: true });
watch(() => props.projectId, () => { resetDocument(); void loadDocument(); }, { immediate: true });
onBeforeUnmount(() => { documentRequestId++; historyRequestId++; mutationRequestId++; emit("dirtyChange", false); });

void platformModels.load();

function setAiPending(fieldKey: string, pending: boolean) {
  if (pending) aiPending[fieldKey] = true;
  else delete aiPending[fieldKey];
}

function copyDocument(document: ScriptDocument): ScriptDocument {
  return { outline: document.outline ?? "", sourceText: document.sourceText ?? "", episodes: (document.episodes ?? []).map(episode => ({ episodeNumber: episode.episodeNumber, title: episode.title ?? "", body: episode.body ?? "" })) };
}

function resetDocument() {
  documentRequestId++;
  historyRequestId++;
  mutationRequestId++;
  for (const key of Object.keys(aiPending)) delete aiPending[key];
  response.value = { document: emptyDocument(), revision: 0, source: "derived", createdAt: null };
  Object.assign(draftDocument, emptyDocument());
  viewingRevision.value = null;
  historicalResponse.value = null;
  historyRecords.value = [];
  historyVisible.value = false;
  loading.value = false;
  saving.value = false;
  restoring.value = false;
  errorMessage.value = "";
  historyError.value = "";
  selectedSection.value = "outline";
}

async function loadDocument(targetRevision?: number) {
  const requestId = ++documentRequestId;
  loading.value = true;
  errorMessage.value = "";
  try {
    const { data } = await authClient.get<ApiResponse<ScriptDocumentResponse>>("/api/productionProjects/script/document", { params: { projectId: props.projectId, ...(targetRevision ? { revision: targetRevision } : {}) } });
    if (requestId !== documentRequestId || data.data.revision !== (targetRevision ?? data.data.revision)) return;
    const loaded = { ...data.data, document: copyDocument(data.data.document) };
    if (targetRevision) {
      viewingRevision.value = loaded.revision;
      historicalResponse.value = loaded;
    } else {
      response.value = loaded;
      Object.assign(draftDocument, copyDocument(loaded.document));
      viewingRevision.value = null;
      historicalResponse.value = null;
    }
  } catch (error) {
    if (requestId === documentRequestId) errorMessage.value = errorText(error);
  } finally {
    if (requestId === documentRequestId) loading.value = false;
  }
}

async function openHistory() {
  historyVisible.value = true;
  const requestId = ++historyRequestId;
  historyLoading.value = true;
  historyError.value = "";
  try {
    const { data } = await authClient.get<ApiResponse<ScriptHistoryRecord[]>>("/api/productionProjects/script/history", { params: { projectId: props.projectId } });
    if (requestId === historyRequestId) historyRecords.value = data.data;
  } catch (error) {
    if (requestId === historyRequestId) historyError.value = errorText(error);
  } finally {
    if (requestId === historyRequestId) historyLoading.value = false;
  }
}

async function viewHistoryVersion(targetRevision: number) {
  if (dirty.value || hasAiPending.value || loading.value || saving.value || restoring.value) return;
  await loadDocument(targetRevision);
  if (!errorMessage.value) historyVisible.value = false;
}

async function showCurrentVersion() {
  if (dirty.value || hasAiPending.value || loading.value || saving.value || restoring.value) return;
  await loadDocument();
}

async function cancelEditing() {
  if (saving.value || hasAiPending.value) return;
  const projectId = props.projectId;
  if (dirty.value) {
    try { await feedback.confirm("未保存的正文修改将被放弃。", "取消编辑", { danger: true, confirmButtonText: "放弃修改", cancelButtonText: "继续编辑" }); }
    catch { return; }
  }
  if (projectId !== props.projectId || saving.value || hasAiPending.value) return;
  Object.assign(draftDocument, copyDocument(response.value.document));
}

async function saveDocument() {
  if (!dirty.value || hasAiPending.value || !props.canEdit || props.locked || isViewingHistory.value || loading.value || saving.value || restoring.value) return;
  saving.value = true;
  const requestId = ++mutationRequestId;
  errorMessage.value = "";
  try {
    const { data } = await authClient.put<ApiResponse<ScriptDocumentResponse>>("/api/productionProjects/script/documentSave", { projectId: props.projectId, expectedRevision: revision.value, document: copyDocument(draftDocument) });
    if (requestId !== mutationRequestId) return;
    response.value = { ...data.data, document: copyDocument(data.data.document) };
    Object.assign(draftDocument, copyDocument(response.value.document));
    feedback.message({ message: "正文已保存为新版本", tone: "success" });
  } catch (error) {
    if (requestId === mutationRequestId) errorMessage.value = errorText(error);
  } finally {
    if (requestId === mutationRequestId) saving.value = false;
  }
}

async function restoreVersion(targetRevision: number) {
  if (!props.canEdit || props.locked || dirty.value || hasAiPending.value || loading.value || saving.value || restoring.value) return;
  const projectId = props.projectId;
  try {
    await feedback.confirm(`将版本 V${targetRevision} 的正文复制为新的最新版本。现有历史、镜头和视频工程会予以保留。`, "恢复剧本版本", { confirmButtonText: "恢复为新版本", cancelButtonText: "取消" });
  } catch { return; }
  if (projectId !== props.projectId || !props.canEdit || props.locked || dirty.value || hasAiPending.value || loading.value || saving.value || restoring.value) return;
  restoring.value = true;
  const requestId = ++mutationRequestId;
  historyError.value = "";
  try {
    const { data } = await authClient.post<ApiResponse<ScriptDocumentResponse>>("/api/productionProjects/script/restore", { projectId: props.projectId, expectedRevision: revision.value, revision: targetRevision });
    if (requestId !== mutationRequestId) return;
    response.value = { ...data.data, document: copyDocument(data.data.document) };
    Object.assign(draftDocument, copyDocument(response.value.document));
    viewingRevision.value = null;
    historicalResponse.value = null;
    if (requestId === mutationRequestId) await openHistory();
  } catch (error) {
    if (requestId === mutationRequestId) historyError.value = errorText(error);
  } finally {
    if (requestId === mutationRequestId) restoring.value = false;
  }
}

function episodeSectionId(episodeNumber: number) { return `episode-${episodeNumber}`; }

function setSectionElement(id: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) sectionElements.set(id, element);
  else sectionElements.delete(id);
}

function scrollToSection(id: string) {
  selectedSection.value = id;
  sectionElements.get(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function updateSelectedSection() {
  if (!contentElement.value) return;
  const top = contentElement.value.getBoundingClientRect().top + 40;
  const visible = [...sectionElements.entries()].filter(([, element]) => element.getBoundingClientRect().top <= top).at(-1);
  if (visible) selectedSection.value = visible[0];
}

function wordCount(value: string) { return [...value.replace(/\s/g, "")].length; }

function sourceLabel(source: ScriptSource) {
  return source === "derived" ? "由分镜整理" : source === "imported" ? "原稿导入" : source === "edited" ? "编辑修订" : "模型生成";
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "尚无版本记录";
}

function exportText() {
  const document = currentDocument.value;
  const content = [`剧本大纲\n${document.outline}`, document.sourceText ? `创作参考输入\n${document.sourceText}` : "", ...document.episodes.map(episode => `第 ${episode.episodeNumber} 集 ${episode.title}\n\n${episode.body}`)].filter(Boolean).join("\n\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `剧本-V${viewedRevision.value}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorText(error: unknown) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "连接中断，请刷新后重试" : error instanceof Error ? error.message : "操作失败，请重试";
}
</script>

<style scoped lang="scss">
.scriptReader { display: grid; grid-template-columns: 250px minmax(0, 1fr); height: clamp(560px, calc(100dvh - 310px), 850px); border: 1px solid var(--uiBorderDefault); border-radius: 8px; overflow: hidden; background: var(--uiSurfaceRaised); &.isCollapsed { grid-template-columns: 54px minmax(0, 1fr); } }
.scriptReaderSidebar { display: flex; flex-direction: column; min-width: 0; border-right: 1px solid var(--uiBorderDefault); background: color-mix(in srgb, var(--uiBackgroundSubtle) 68%, var(--uiSurfaceRaised)); transition: width .18s ease; &.isCollapsed { width: 54px; .scriptReaderSidebarHeader { justify-content: center; padding: 8px; } .scriptReaderNav { padding: 10px 5px; } .scriptReaderNavItem { justify-content: center; padding: 6px 2px; } } }
.scriptReaderSidebarHeader { display: flex; align-items: center; justify-content: space-between; min-height: 64px; padding: 10px 14px; border-bottom: 1px solid var(--uiBorderDefault); strong { display: block; margin-top: 4px; font-size: 13px; } }
.readerEyebrow { color: var(--uiTextMuted); font-size: 10px; letter-spacing: 0; }
.readerIconButton { display: grid; place-items: center; flex: 0 0 30px; width: 30px; height: 30px; padding: 0; border: 1px solid transparent; border-radius: 5px; color: var(--uiTextMuted); background: transparent; cursor: pointer; &:hover, &:focus-visible { border-color: var(--uiBorderDefault); color: var(--uiTextPrimary); } }
.scriptReaderNav { display: grid; align-content: start; gap: 4px; flex: 1; min-height: 0; padding: 12px 8px; overflow-y: auto; }
.scriptReaderNavItem { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 50px; padding: 7px 9px; border: 0; border-radius: 5px; color: var(--uiTextMuted); background: transparent; text-align: left; cursor: pointer; &:hover { color: var(--uiTextPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 6%, transparent); } &.selected { color: var(--uiTextPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 11%, transparent); box-shadow: inset 2px 0 var(--uiActionPrimary); } }
.readerNavMark { display: grid; place-items: center; flex: 0 0 32px; width: 32px; height: 32px; border: 1px solid var(--uiBorderDefault); border-radius: 4px; color: var(--uiTextMuted); font: 10px ui-monospace, monospace; }
.selected .readerNavMark { border-color: color-mix(in srgb, var(--uiActionPrimary) 45%, var(--uiBorderDefault)); color: var(--uiActionPrimary); }
.readerNavCopy { display: grid; gap: 4px; min-width: 0; strong, small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } strong { color: inherit; font-size: 11px; } small { color: var(--uiTextMuted); font-size: 10px; } }
.readerNavDivider { padding: 12px 10px 5px; color: var(--uiTextMuted); font-size: 10px; }
.scriptReaderSidebarFooter { display: flex; justify-content: space-between; padding: 12px 14px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 10px; font-variant-numeric: tabular-nums; }
.scriptReaderMain { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.scriptReaderToolbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; min-height: 64px; padding: 10px 20px; border-bottom: 1px solid var(--uiBorderDefault); }
.readerTitle { min-width: 0; h2 { margin: 4px 0 0; font-size: 16px; } }
.readerToolbarActions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 7px; }
.scriptReaderContent { flex: 1; min-height: 0; padding: 0 clamp(22px, 5vw, 76px); overflow-y: auto; scroll-behavior: smooth; }
.scriptDocumentOutline, .scriptDocumentEpisode { max-width: 900px; margin: 0 auto; padding: 30px 0; scroll-margin-top: 12px; border-bottom: 1px solid var(--uiBorderDefault); }
.scriptDocumentSectionHeading { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 16px; color: var(--uiActionPrimary); font-size: 12px; font-weight: 650; small { color: var(--uiTextMuted); font-size: 10px; font-weight: 400; } }
.scriptDocumentEpisode h3 { margin: 0 0 18px; font-size: 21px; line-height: 1.4; }
.scriptDocumentBody { margin: 0; color: var(--uiTextPrimary); font-family: inherit; font-size: 13px; line-height: 1.95; white-space: pre-wrap; overflow-wrap: anywhere; }
.scriptDerivedNote { margin: 0 0 14px; color: var(--uiTextMuted); font-size: 11px; line-height: 1.7; }
.scriptReaderField { display: grid; gap: 7px; margin: 12px 0; color: var(--uiTextMuted); font-size: 11px; :deep(textarea) { width: 100%; min-height: 220px; line-height: 1.8; } }
.scriptSourceDetails { margin-top: 24px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); summary { padding: 12px 0; cursor: pointer; font-size: 11px; } pre { max-height: 320px; margin: 0; padding: 12px; overflow: auto; border: 1px solid var(--uiBorderDefault); border-radius: 5px; color: var(--uiTextPrimary); background: var(--uiBackgroundSubtle); font: 11px/1.7 ui-monospace, monospace; white-space: pre-wrap; overflow-wrap: anywhere; } }
.scriptReaderFooter { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 10px 20px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 10px; }
.scriptReaderError { margin: 12px 20px; color: var(--uiStatusError); font-size: 12px; }
.scriptReaderState, .scriptHistoryState { display: grid; place-items: center; min-height: 220px; color: var(--uiTextMuted); font-size: 12px; }
.scriptHistoryList { display: grid; gap: 8px; max-height: min(560px, 62dvh); overflow-y: auto; }
.scriptHistoryItem { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 5px; &.isCurrent { border-color: color-mix(in srgb, var(--uiActionPrimary) 60%, var(--uiBorderDefault)); background: color-mix(in srgb, var(--uiActionPrimary) 5%, transparent); } > div:first-child { display: grid; gap: 5px; min-width: 0; strong { font-size: 12px; } small { color: var(--uiTextMuted); font-size: 10px; line-height: 1.5; } } }
.scriptHistoryActions { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; }
@media (max-width: 760px) { .scriptReader { grid-template-columns: 54px minmax(0, 1fr); min-height: 620px; } .scriptReaderSidebar { width: 54px; } .scriptReaderSidebarHeader { justify-content: center; padding: 8px; } .scriptReaderSidebarHeader > div, .readerNavCopy, .readerNavDivider, .scriptReaderSidebarFooter { display: none; } .scriptReaderNav { padding: 10px 5px; } .scriptReaderNavItem { justify-content: center; padding: 6px 2px; } .scriptReaderToolbar { align-items: flex-start; flex-direction: column; padding: 12px; } .readerToolbarActions { justify-content: flex-start; } .scriptReaderContent { padding: 0 16px; } .scriptDocumentOutline, .scriptDocumentEpisode { padding: 22px 0; } .scriptDocumentEpisode h3 { font-size: 18px; } .scriptHistoryItem { align-items: flex-start; flex-direction: column; } }
</style>

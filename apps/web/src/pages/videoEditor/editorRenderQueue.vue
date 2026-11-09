<template>
  <section class="renderQueue" aria-label="渲染队列">
    <header class="queueHeader">
      <div class="queueTitle">
        <h2>渲染队列</h2>
        <span>{{ jobs.length }} / 50</span>
      </div>
      <div class="queueCounts" aria-label="任务统计">
        <span><i class="queuedDot"></i>排队 {{ counts.queued }}</span>
        <span><i class="runningDot"></i>渲染 {{ counts.running }}</span>
        <span><i class="doneDot"></i>完成 {{ counts.succeeded }}</span>
      </div>
    </header>

    <p v-if="errorMessage" class="queueError" role="alert">
      <span>{{ errorMessage }}</span>
      <button type="button" class="textButton" :disabled="loading || disabled" @click="loadJobs">重试</button>
    </p>
    <p v-else-if="!loading && !jobs.length" class="queueEmpty">当前工程暂无渲染任务</p>
    <p v-if="loading && !jobs.length" class="queueLoading" role="status">正在读取任务…</p>

    <ul v-if="jobs.length" class="jobList">
      <li v-for="job in jobs" :key="job.id" class="jobRow">
        <div class="jobHeading">
          <div class="jobName" :title="job.projectName || job.projectPath">
            <strong>{{ job.projectName || job.projectPath }}</strong>
            <span>{{ formatDate(job.createdAt) }}</span>
          </div>
          <span class="jobStatus" :class="`status${job.status}`">{{ statusLabels[job.status] }}</span>
        </div>

        <template v-if="job.status === 'queued' || job.status === 'running'">
          <div class="jobProgress" :aria-label="`渲染进度 ${Math.round(job.progress)}%`">
            <div class="progressTrack"><span :style="{ width: `${progressValue(job.progress)}%` }"></span></div>
            <span>{{ Math.round(progressValue(job.progress)) }}%</span>
          </div>
        </template>
        <p v-if="job.error && (job.status === 'failed' || job.status === 'interrupted')" class="jobError" :title="job.error">{{ job.error }}</p>

        <div class="jobActions">
          <template v-if="job.status === 'queued' || job.status === 'running'">
            <button type="button" class="textButton cancelButton" :disabled="disabled || isBusy(job.id)" @click="cancelJob(job)">{{ isBusy(job.id) ? "处理中…" : "取消" }}</button>
          </template>
          <template v-else>
            <a v-if="job.status === 'succeeded' && job.outputPath" class="queueAction" :href="disabled ? undefined : files.mediaUrl(job.outputPath)" :download="outputName(job)" :aria-disabled="disabled" :tabindex="disabled ? -1 : 0" @click="disabled && $event.preventDefault()">下载 MP4</a>
            <button
              v-if="job.status === 'succeeded' && job.outputPath && job.revision === revision"
              type="button"
              class="queueAction primaryAction"
              :disabled="disabled"
              @click="emit('useResult', job)"
            >
              用于审片 / 回写
            </button>
            <span v-else-if="job.status === 'succeeded' && job.revision !== revision" class="oldRevision">此结果来自旧版本</span>
            <button v-if="job.status === 'failed' || job.status === 'cancelled' || job.status === 'interrupted'" type="button" class="textButton" :disabled="disabled || isBusy(job.id)" @click="retryJob(job)">{{ isBusy(job.id) ? "处理中…" : "重新渲染" }}</button>
            <button type="button" class="textButton deleteButton" :disabled="disabled || isBusy(job.id)" @click="removeJob(job)">{{ isBusy(job.id) ? "处理中…" : "删除记录" }}</button>
          </template>
        </div>
      </li>
    </ul>

    <footer class="queueFooter">
      离开页面后任务继续运行；服务重启中断的任务可重新渲染。删除记录会清除辅助文件，已导出的 MP4 会保留。
    </footer>
  </section>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { ApiResponse } from "@/lib/authApi";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import type { EditorRenderJob } from "./editorExport";

const props = defineProps<{
  directory: string;
  projectPath: string;
  revision: string;
  refreshKey: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  useResult: [job: EditorRenderJob];
  completed: [job: EditorRenderJob];
}>();

const files = useWorkspaceFiles(() => props.directory);
const jobs = ref<EditorRenderJob[]>([]);
const loading = ref(false);
const errorMessage = ref("");
const busyIds = ref(new Set<string>());
const counts = computed(() => ({
  queued: jobs.value.filter(job => job.status === "queued").length,
  running: jobs.value.filter(job => job.status === "running").length,
  succeeded: jobs.value.filter(job => job.status === "succeeded").length,
}));

const statusLabels: Record<EditorRenderJob["status"], string> = {
  queued: "排队中",
  running: "渲染中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
  interrupted: "已中断",
};

const activeStatuses = new Set<EditorRenderJob["status"]>(["queued", "running"]);
let mounted = false;
let initialized = false;
let generation = 0;
let listController: AbortController | undefined;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let lastStatuses = new Map<string, EditorRenderJob["status"]>();
let refreshPending = false;

function isBusy(id: string) {
  return busyIds.value.has(id);
}

function progressValue(value: number) {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(timestamp) : "时间未知";
}

function outputName(job: EditorRenderJob) {
  return job.outputPath.split("/").pop() || `${job.projectName || "render"}.mp4`;
}

function replaceJob(updated: EditorRenderJob) {
  const completed = initialized && activeStatuses.has(lastStatuses.get(updated.id)!) && updated.status === "succeeded";
  const next = jobs.value.filter(job => job.id !== updated.id);
  jobs.value = [updated, ...next].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 50);
  lastStatuses.set(updated.id, updated.status);
  if (completed) emit("completed", updated);
}

function clearPoll() {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = undefined;
}

function schedulePoll() {
  clearPoll();
  if (!mounted || props.disabled || !props.directory || !props.projectPath) return;
  const hasActiveJob = jobs.value.some(job => activeStatuses.has(job.status));
  pollTimer = setTimeout(() => { void loadJobs(); }, hasActiveJob ? 2000 : 8000);
}

function errorText(error: unknown) {
  if (axios.isAxiosError<ApiResponse<unknown>>(error)) return error.response?.data?.message || error.message || "读取渲染任务失败";
  return error instanceof Error ? error.message : "读取渲染任务失败";
}

async function loadJobs() {
  if (!mounted || props.disabled || !props.directory || !props.projectPath) return;
  if (loading.value) { refreshPending = true; return; }
  clearPoll();
  refreshPending = false;
  const requestGeneration = generation;
  const controller = new AbortController();
  listController = controller;
  loading.value = true;
  try {
    const { data } = await axios.get<ApiResponse<EditorRenderJob[]>>("/api/videoEditor/renders/list", {
      params: { directory: props.directory, projectPath: props.projectPath },
      signal: controller.signal,
    });
    if (requestGeneration !== generation || controller.signal.aborted) return;
    if (!Array.isArray(data.data)) throw new Error(data.message || "渲染任务列表格式无效");
    const incoming = data.data.slice(0, 50);
    if (initialized) {
      for (const job of incoming) {
        if (activeStatuses.has(lastStatuses.get(job.id)!) && job.status === "succeeded") emit("completed", job);
      }
    }
    jobs.value = incoming;
    lastStatuses = new Map(incoming.map(job => [job.id, job.status]));
    initialized = true;
    errorMessage.value = "";
  } catch (error) {
    if (requestGeneration === generation && !controller.signal.aborted) errorMessage.value = errorText(error);
  } finally {
    if (requestGeneration === generation && listController === controller) {
      listController = undefined;
      loading.value = false;
      if (refreshPending) void loadJobs();
      else schedulePoll();
    }
  }
}

async function runAction(job: EditorRenderJob, action: "cancel" | "retry" | "remove") {
  if (props.disabled || isBusy(job.id)) return;
  const actionGeneration = generation;
  busyIds.value = new Set(busyIds.value).add(job.id);
  errorMessage.value = "";
  try {
    if (action === "remove") {
      await axios.delete<ApiResponse<unknown>>("/api/videoEditor/renders/remove", { data: { directory: props.directory, id: job.id } });
      if (actionGeneration !== generation) return;
      jobs.value = jobs.value.filter(item => item.id !== job.id);
      lastStatuses.delete(job.id);
    } else {
      const { data } = await axios.post<ApiResponse<EditorRenderJob>>(`/api/videoEditor/renders/${action}`, { directory: props.directory, id: job.id });
      if (!data.data?.id) throw new Error(data.message || "服务端没有返回有效的渲染任务");
      if (actionGeneration !== generation) return;
      replaceJob(data.data);
    }
  } catch (error) {
    if (actionGeneration === generation) errorMessage.value = errorText(error);
  } finally {
    if (actionGeneration === generation) {
      const next = new Set(busyIds.value);
      next.delete(job.id);
      busyIds.value = next;
      schedulePoll();
    }
  }
}

function cancelJob(job: EditorRenderJob) {
  void runAction(job, "cancel");
}

function retryJob(job: EditorRenderJob) {
  void runAction(job, "retry");
}

function removeJob(job: EditorRenderJob) {
  if (!window.confirm("删除这条任务记录及辅助文件？已导出的 MP4 会保留。")) return;
  void runAction(job, "remove");
}

function resetScope() {
  generation++;
  listController?.abort();
  listController = undefined;
  loading.value = false;
  clearPoll();
  jobs.value = [];
  errorMessage.value = "";
  busyIds.value = new Set();
  lastStatuses.clear();
  initialized = false;
  refreshPending = false;
  if (mounted && !props.disabled) void loadJobs();
}

watch(() => [props.directory, props.projectPath] as const, resetScope, { immediate: true, flush: "sync" });
watch(() => props.refreshKey, () => { void loadJobs(); });
watch(() => props.disabled, disabled => {
  if (disabled) {
    generation++;
    listController?.abort();
    listController = undefined;
    loading.value = false;
    clearPoll();
    busyIds.value = new Set();
  } else {
    void loadJobs();
  }
});

onMounted(() => {
  mounted = true;
  void loadJobs();
});

onBeforeUnmount(() => {
  mounted = false;
  generation++;
  clearPoll();
  listController?.abort();
  listController = undefined;
});
</script>

<style scoped lang="scss">
.renderQueue {
  width: min(100%, 1180px);
  margin: 10px auto 0;
  padding: 10px 12px 8px;
  border: 1px solid #374139;
  border-radius: 5px;
  color: #d8e0da;
  background: #202521;
  font-size: 11px;

  button, a { font: inherit; }
  button { cursor: pointer; }
  button:disabled, a[aria-disabled="true"] { opacity: .45; cursor: not-allowed; pointer-events: none; }
  button:focus-visible, a:focus-visible { outline: 2px solid #90c9a2; outline-offset: 2px; }

  .queueHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 26px; }
  .queueTitle, .queueCounts { display: flex; align-items: center; }
  .queueTitle { gap: 8px; min-width: 0; }
  .queueTitle h2 { margin: 0; color: #dce5de; font-size: 12px; font-weight: 600; }
  .queueTitle > span { color: #87938a; font-size: 10px; }
  .queueCounts { flex-wrap: wrap; justify-content: flex-end; gap: 10px; color: #98a49b; font-size: 10px; }
  .queueCounts span { display: inline-flex; align-items: center; gap: 5px; }
  .queueCounts i { width: 6px; height: 6px; border-radius: 50%; background: #c5a767; }
  .queueCounts .runningDot { background: #7fbc93; }
  .queueCounts .doneDot { background: #7e9ca2; }
  .queueEmpty, .queueLoading { margin: 8px 0 2px; color: #929e95; font-size: 10px; }
  .queueError { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 7px 0; color: #e2a18b; }
  .queueError > span { min-width: 0; overflow-wrap: anywhere; }
  .jobList { display: grid; gap: 0; max-height: 280px; margin: 8px 0 0; padding: 0; overflow-y: auto; list-style: none; }
  .jobRow { display: grid; gap: 5px; min-width: 0; padding: 8px 0; border-top: 1px solid #343d36; }
  .jobHeading, .jobName, .jobActions, .jobProgress { display: flex; align-items: center; }
  .jobHeading { justify-content: space-between; gap: 12px; min-width: 0; }
  .jobName { flex: 1; justify-content: space-between; gap: 12px; min-width: 0; }
  .jobName strong { overflow: hidden; color: #cbd6cd; font-size: 10px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
  .jobName span { flex: 0 0 auto; color: #818d84; font-size: 9px; }
  .jobStatus { flex: 0 0 auto; color: #aebbb1; font-size: 9px; }
  .statusrunning { color: #9dd0ac; }
  .statussucceeded { color: #aac8ce; }
  .statusfailed { color: #e2a18b; }
  .statuscancelled, .statusinterrupted { color: #d4ba83; }
  .jobProgress { gap: 8px; color: #a2afa5; font-size: 9px; }
  .progressTrack { flex: 1; height: 4px; overflow: hidden; border-radius: 4px; background: #343d36; }
  .progressTrack span { display: block; height: 100%; border-radius: inherit; background: #83bf97; transition: width 160ms ease; }
  .jobError { max-height: 42px; margin: 0; overflow: hidden; color: #d79b88; font-size: 9px; line-height: 1.45; overflow-wrap: anywhere; }
  .jobActions { flex-wrap: wrap; justify-content: flex-end; gap: 7px; min-height: 20px; }
  .textButton, .queueAction { display: inline-flex; align-items: center; justify-content: center; min-height: 23px; padding: 3px 7px; border: 1px solid transparent; border-radius: 3px; color: #aebbb1; background: transparent; font-size: 9px; text-decoration: none; }
  .textButton:hover:not(:disabled), .queueAction:hover:not([aria-disabled="true"]) { color: #e2ebe4; background: #303832; }
  .cancelButton, .deleteButton { color: #cfaa8d; }
  .queueAction { border-color: #465149; color: #c2d0c5; background: #2b322d; }
  .primaryAction { border-color: #52725c; color: #c5e3ce; background: #2a3a2e; }
  .oldRevision { color: #c4ad78; font-size: 9px; }
  .queueFooter { margin-top: 7px; padding-top: 7px; border-top: 1px solid #343d36; color: #7f8b82; font-size: 9px; line-height: 1.5; }
}

@media (max-width: 620px) {
  .renderQueue {
    .queueHeader { align-items: flex-start; flex-direction: column; gap: 6px; }
    .queueCounts { justify-content: flex-start; }
    .jobName { align-items: flex-start; flex-direction: column; gap: 2px; }
  }
}
</style>

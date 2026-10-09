<template>
  <div class="ffmpegPanel">
    <section class="downloadSection" aria-labelledby="ffmpegTitle">
      <header class="componentHeader"><div class="componentTitle"><h3 id="ffmpegTitle"><icon-movie :size="18" aria-hidden="true" />FFmpeg</h3><uiTag :tone="statusError ? 'error' : busy || loading ? 'neutral' : ready ? 'success' : 'warning'">{{ statusError ? '检测失败' : busy ? phaseLabels[download.phase] : loading ? '检测中' : ready ? '已就绪' : '待配置' }}</uiTag></div><uiButton variant="ghost" size="small" :icon="IconRefresh" :loading="loading" :disabled="saving || submitting" @click="refreshStatus">重新检测</uiButton></header>
      <p class="introduction">Agent和部分节点插件、工具插件、供应商在处理音视频时可能需要 FFmpeg，按需安装即可。</p>
      <uiAlert v-if="statusError" :title="statusError" tone="error" />
      <div class="downloadHeader"><span>下载线路</span><span v-if="status" class="sourceCount">{{ availableSourceCount }} 条可用线路</span></div>
      <div class="downloadActions">
        <uiSelect class="downloadSourceSelect" inline :modelValue="config.source" :options="sourceOptions" :disabled="!status || loading || saving || busy || submitting" filterable placeholder="选择下载线路" aria-label="FFmpeg 下载源" @change="source => typeof source === 'string' && updateConfig({ source })" />
        <uiButton :icon="IconDownload" :loading="submitting || busy" :disabled="!canDownload" @click="submitDownload('download')">{{ busy ? phaseLabels[download.phase] : download.phase === 'error' ? '重试安装' : downloaded || download.phase === 'completed' ? '重新安装' : '下载并安装' }}</uiButton>
        <uiButton v-if="busy && download.phase !== 'installing'" variant="secondary" :disabled="submitting" @click="submitDownload('cancel')">取消</uiButton>
      </div>
      <div v-if="selectedSource" class="sourceHint"><span>下载较慢时，可取消后切换线路。</span><a :href="selectedSource.homepage" target="_blank" rel="noopener noreferrer">来源网站<icon-external-link :size="12" aria-hidden="true" /></a></div>
      <p class="description">{{ ready ? '已检测到可用版本，无需重复安装。' : '下载后自动完成安装，无需手动解压或配置。' }}</p>
      <uiAlert v-if="status && !status.supported" title="当前平台暂不提供下载，请在高级设置中使用系统安装版。" tone="warning" />
      <uiAlert v-if="config.mode === 'system'" title="当前仅使用系统安装版。如需使用下载的版本，请在高级设置中切换运行方式。" />
      <div v-if="download.phase !== 'idle'" class="downloadProgress" aria-live="polite"><div class="progressHeader"><span>{{ phaseLabels[download.phase] }}<template v-if="busy && download.file && download.phase !== 'installing'"> · 组件 {{ download.file === 'ffprobe' ? '2' : '1' }}/2</template></span><span v-if="download.received || download.total">{{ formatBytes(download.received) }}{{ download.total ? ` / ${formatBytes(download.total)}` : '' }}</span></div><uiProgress aria-label="FFmpeg 下载进度" :percentage="busy && !download.total ? 50 : percentage" :showText="!busy || !!download.total" :indeterminate="busy && !download.total" :status="download.phase === 'error' ? 'error' : download.phase === 'completed' ? 'success' : undefined" /></div>
      <uiAlert v-if="operationError || download.error" :title="operationError || download.error" tone="error" />
    </section>
    <details class="advancedSettings">
      <summary>高级设置</summary>
      <div class="advancedContent">
        <uiField label="运行方式"><uiRadioGroup :modelValue="config.mode" :options="modeOptions" :disabled="loading || saving || busy || submitting" variant="segmented" aria-label="FFmpeg 运行方式" @change="mode => (mode === 'auto' || mode === 'download' || mode === 'system') && updateConfig({ mode })" /></uiField>
        <p class="description">{{ modeDescriptions[config.mode] }}</p>
        <template v-if="status">
          <div class="runtimeInfo"><p class="description">运行环境：{{ status.platform }} / {{ status.arch }}</p><p class="description">下载版本：{{ status.version }} · {{ status.target }}</p><p class="description">保存在当前 omnistudio-next 服务的数据目录，下载后自动复用。</p><code class="toolPath">{{ status.directory }}</code></div>
          <div v-for="name in toolNames" :key="name" class="toolInfo"><header><strong>{{ name }}</strong><uiTag :tone="status.tools[name].version ? 'success' : 'neutral'">{{ status.tools[name].version ? (status.tools[name].origin === 'download' ? '下载版' : '系统安装版') : '不可用' }}</uiTag></header><p v-if="status.tools[name].version" class="description">{{ status.tools[name].version }}</p><code v-if="status.tools[name].path" class="toolPath">{{ status.tools[name].path }}</code><p v-if="status.tools[name].error" class="description">{{ status.tools[name].error }}</p></div>
        </template>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { uiTag, uiButton, uiAlert, uiSelect, uiProgress, uiField, uiRadioGroup, useUiFeedback } from "@omnistudio-next/ui";
import { IconDownload, IconRefresh } from "@tabler/icons-vue";
import { saveSettings, settings } from "@/stores/settings";

type FfmpegConfig = { mode: "auto" | "download" | "system"; source: string };
type DownloadState = { phase: "idle" | "downloading" | "verifying" | "installing" | "completed" | "error" | "cancelled"; file?: string; received: number; total?: number; error?: string };
type ToolStatus = { path: string | null; version: string | null; error: string | null; origin: "download" | "system" | null };
type FfmpegStatus = {
  platform: string; arch: string; target: string; supported: boolean; directory: string; version: string;
  sources: { id: FfmpegConfig["source"]; label: string; description: string; available: boolean; homepage: string }[];
  config: FfmpegConfig; tools: { ffmpeg: ToolStatus; ffprobe: ToolStatus }; download: DownloadState;
};

const props = withDefaults(defineProps<{ visible?: boolean; downloadOnOpen?: boolean }>(), { visible: true, downloadOnOpen: false });
const feedback = useUiFeedback();
const headers = { "x-omnistudio-next-workspace": "1" };
const modeOptions = [{ value: "auto", label: "自动选择" }, { value: "download", label: "使用下载版" }, { value: "system", label: "使用系统安装版" }];
const toolNames = ["ffmpeg", "ffprobe"] as const;
const modeDescriptions = {
  auto: "优先使用已下载的版本；未下载时，从当前 omnistudio-next 服务的系统 PATH 查找。",
  download: "仅使用此页面下载的版本。",
  system: "仅从当前 omnistudio-next 服务的系统 PATH 查找 FFmpeg 与 ffprobe。",
};
const phaseLabels = { idle: "等待下载", downloading: "正在下载", verifying: "正在校验", installing: "正在安装", completed: "下载完成", error: "下载失败", cancelled: "已取消" };
const config = computed<FfmpegConfig>(() => {
  const raw = settings.value.ffmpeg;
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Partial<FfmpegConfig> : {};
  return {
    mode: value.mode === "download" || value.mode === "system" ? value.mode : "auto",
    source: [value.source, status.value?.config.source].find(id => status.value?.sources.some(source => source.id === id && source.available))
      ?? status.value?.sources.find(source => source.available)?.id ?? "",
  };
});
const status = ref<FfmpegStatus>();
const ready = computed(() => toolNames.every(name => !!status.value?.tools[name].version));
const downloaded = computed(() => toolNames.some(name => status.value?.tools[name].origin === "download"));
const selectedSource = computed(() => status.value?.sources.find(source => source.id === config.value.source));
const availableSourceCount = computed(() => status.value?.sources.filter(source => source.available).length ?? 0);
const sourceGroups = computed(() => {
  const sources = status.value?.sources ?? [];
  return [
    { label: "常用线路", sources: sources.filter(source => source.available && ["npmmirror", "github"].includes(source.id)) },
    { label: "更多加速线路", sources: sources.filter(source => source.available && !["npmmirror", "github"].includes(source.id)) },
  ].filter(group => group.sources.length);
});
const sourceOptions = computed(() => sourceGroups.value.flatMap(group => group.sources.map(source => ({ value: source.id, label: `${source.label} · ${source.description}`, group: group.label }))));
const download = ref<DownloadState>({ phase: "idle", received: 0 });
const statusError = ref("");
const operationError = ref("");
const loading = ref(false);
const saving = ref(false);
const submitting = ref(false);
const busy = computed(() => ["downloading", "verifying", "installing"].includes(download.value.phase));
const canDownload = computed(() => status.value?.supported && status.value.sources.some(source => source.id === config.value.source && source.available) && !loading.value && !saving.value && !busy.value && !submitting.value);
const percentage = computed(() => download.value.phase === "completed" ? 100 : download.value.total ? Math.min(100, Math.round(download.value.received / download.value.total * 100)) : 0);
let timer: ReturnType<typeof setTimeout> | undefined;
let readController = new AbortController();

function errorMessage(error: unknown) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "操作失败";
}

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`;
}

function stopReading() {
  clearTimeout(timer);
  readController.abort();
}

function pollProgress() {
  clearTimeout(timer);
  if (!props.visible || readController.signal.aborted || !busy.value) return;
  const signal = readController.signal;
  timer = setTimeout(async () => {
    try {
      const { data } = await axios.get<{ code: number; data: DownloadState; message?: string }>("/api/ffmpeg/progress", { headers, signal });
      if (signal.aborted) return;
      if (data.code !== 200) throw new Error(data.message || "读取下载进度失败");
      download.value = data.data;
      if (busy.value) pollProgress();
      else await refreshStatus();
    } catch (error) {
      if (!signal.aborted) operationError.value = `${errorMessage(error)}，请刷新查看下载状态。`;
    }
  }, 1000);
}

async function refreshStatus() {
  stopReading();
  readController = new AbortController();
  const signal = readController.signal;
  loading.value = true;
  statusError.value = "";
  operationError.value = "";
  try {
    const { data } = await axios.get<{ code: number; data: FfmpegStatus; message?: string }>("/api/ffmpeg/status", { headers, signal });
    if (signal.aborted) return;
    if (data.code !== 200) throw new Error(data.message || "读取 FFmpeg 状态失败");
    status.value = data.data;
    download.value = data.data.download;
    pollProgress();
    return true;
  } catch (error) {
    if (!signal.aborted) statusError.value = errorMessage(error);
    return false;
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}

async function updateConfig(patch: Partial<FfmpegConfig>) {
  saving.value = true;
  try {
    await saveSettings(current => {
      const value = current.ffmpeg;
      return { ffmpeg: { ...(value && typeof value === "object" && !Array.isArray(value) ? value : {}), ...patch } };
    });
    return props.visible && !readController.signal.aborted ? await refreshStatus() : false;
  } catch (error) {
    feedback.message({ tone: "error", message: errorMessage(error) });
    return false;
  } finally {
    saving.value = false;
  }
}

async function submitDownload(action: "download" | "cancel") {
  if (submitting.value || action === "download" && !canDownload.value) return;
  stopReading();
  readController = new AbortController();
  submitting.value = true;
  operationError.value = "";
  try {
    const { data } = await axios.post<{ code: number; data: DownloadState; message?: string }>(`/api/ffmpeg/${action}`, action === "download" ? { source: config.value.source } : {}, { headers });
    if (data.code !== 200) throw new Error(data.message || "操作失败");
    download.value = data.data;
    if (props.visible && !readController.signal.aborted) {
      if (busy.value) pollProgress();
      else await refreshStatus();
    }
  } catch (error) {
    const message = errorMessage(error);
    if (props.visible && !readController.signal.aborted) await refreshStatus();
    operationError.value = message;
  } finally {
    submitting.value = false;
  }
}

watch(() => props.visible, async visible => {
  if (!visible) return stopReading();
  if (!await refreshStatus() || !props.downloadOnOpen || status.value?.tools.ffmpeg.version) return;
  if (config.value.mode === "system" && !await updateConfig({ mode: "auto" })) return;
  if (props.visible && !readController.signal.aborted && !status.value?.tools.ffmpeg.version && !busy.value) await submitDownload("download");
}, { immediate: true });
onBeforeUnmount(stopReading);
</script>

<style lang="scss" scoped>
.ffmpegPanel {
  display: flex; flex-direction: column; gap: 28px; min-width: 0;
  .description { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; overflow-wrap: anywhere; }
  .downloadSection {
    display: flex; flex-direction: column; gap: 20px; min-width: 0;
    .componentHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; .componentTitle { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: var(--uiFontLabel); font-weight: 600; } } }
    .introduction { max-width: 70ch; margin: 0; color: var(--uiTextBody); font-size: var(--uiFontBody); line-height: 1.7; }
    .downloadHeader { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding-top: 20px; border-top: 1px solid var(--uiBorderDefault); font-size: var(--uiFontControl); .sourceCount { color: var(--uiTextMuted); } }
    .downloadActions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; :deep(.downloadSourceSelect) { flex: 1 1 260px; min-width: 0; } }
    .sourceHint { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 16px; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; a { display: inline-flex; align-items: center; gap: 4px; color: var(--uiActionPrimary); } }
    .downloadProgress { .progressHeader { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; color: var(--uiTextMuted); font-size: var(--uiFontControl); font-variant-numeric: tabular-nums; } }
  }
  .advancedSettings { min-width: 0; border-top: 1px solid var(--uiBorderDefault); summary { width: fit-content; padding: 20px 0; color: var(--uiTextBody); font-size: var(--uiFontLabel); cursor: pointer; } .advancedContent { display: flex; flex-direction: column; gap: 16px; min-width: 0; .runtimeInfo { display: flex; flex-direction: column; gap: 8px; padding-top: 16px; border-top: 1px solid var(--uiBorderDefault); } .toolInfo { padding-top: 20px; border-top: 1px solid var(--uiBorderDefault); header { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; strong { font-size: var(--uiFontLabel); font-weight: 500; } } .description + .toolPath { margin-top: 8px; } } .toolPath { display: block; color: var(--uiTextBody); font-size: var(--uiFontControl); overflow-wrap: anywhere; user-select: text; } } }
}
</style>

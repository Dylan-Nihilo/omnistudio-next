<template>
  <section class="cutPanel" aria-label="剪辑成片审片与交付">
    <header class="cutPanelHeader">
      <div><span class="cutEyebrow">剪辑台成片</span><h3>审片与交付</h3><p>逐版记录剪辑结果、审片意见和交付凭证。</p></div>
      <div class="cutHeaderActions"><uiTag>{{ cuts.length }} 个版本</uiTag><uiButton size="small" variant="secondary" :loading="loading" :disabled="busy" @click="loadCuts">刷新成片</uiButton></div>
    </header>
    <p v-if="errorMessage" class="cutError" role="alert">{{ errorMessage }}</p>
    <p v-if="notice" class="cutNotice" role="status">{{ notice }}</p>
    <div v-if="cuts.length" class="cutWorkspace">
      <nav class="cutList" aria-label="成片版本">
        <button v-for="cut in cuts" :key="cut.id" type="button" class="cutListItem" :class="{ selected: cut.id === selectedCut?.id }" :aria-pressed="cut.id === selectedCut?.id" :disabled="busy" @click="selectedId = cut.id">
          <span class="cutVersion">V{{ String(cut.version).padStart(2, '0') }}</span>
          <span class="cutListCopy"><strong>{{ cut.title }}</strong><small>{{ episodeLabel(cut.episodeId) }} · {{ formatDate(cut.createdAt) }}</small></span>
          <uiTag :tone="statusTone(cut.status)">{{ statusLabels[cut.status] }}</uiTag>
        </button>
      </nav>
      <section v-if="selectedCut" class="cutDetail" :aria-label="`${selectedCut.title} 第 ${selectedCut.version} 版`">
        <header class="cutDetailHeader"><div><span class="cutEyebrow">{{ episodeLabel(selectedCut.episodeId) }} / VERSION {{ selectedCut.version }}</span><h4>{{ selectedCut.title }}</h4></div><uiTag :tone="statusTone(selectedCut.status)">{{ statusLabels[selectedCut.status] }}</uiTag></header>
        <video :key="selectedCut.id" class="cutPlayer" :src="selectedCut.videoUrl" controls preload="metadata" @error="previewError = '成片预览加载失败，请刷新列表重试或下载 MP4 检查。'" />
        <p v-if="previewError" class="cutError" role="alert">{{ previewError }}</p>
        <div class="cutSpecs"><span>{{ formatDuration(selectedCut.durationMs) }}</span><span>{{ selectedCut.width }} × {{ selectedCut.height }}</span><span>{{ formatFrameRate(selectedCut.frameRate) }} fps</span><span>{{ formatBytes(selectedCut.fileSize) }}</span></div>
        <dl class="cutEvidence"><div><dt>提交时间</dt><dd>{{ formatDate(selectedCut.createdAt) }}</dd></div><div><dt>文件 SHA-256</dt><dd class="cutHash">{{ selectedCut.fileHash }}</dd></div><div><dt>Manifest</dt><dd>{{ selectedCut.manifestIntegrity === 'sha256-recorded' ? '已记录 SHA-256' : '旧版，未核验' }}</dd></div><div><dt>素材来源</dt><dd>{{ sourceLineageLabel }}</dd></div><div v-if="selectedCut.reviewedAt"><dt>审片时间</dt><dd>{{ formatDate(selectedCut.reviewedAt) }}</dd></div><div v-if="selectedCut.deliveredAt"><dt>交付时间</dt><dd>{{ formatDate(selectedCut.deliveredAt) }}</dd></div></dl>
        <ul v-if="selectedCut.metadata.sourceSnapshots?.length" class="cutSourceList" aria-label="素材来源快照">
          <li v-for="snapshot in selectedCut.metadata.sourceSnapshots" :key="snapshot.assetId">
            <span><strong>{{ snapshot.assetName }}</strong><small>{{ snapshot.verified ? sourceLabel(snapshot.source) : '来源未核验' }}</small></span>
            <code>{{ snapshot.verified && snapshot.source ? '来源' : '固定素材' }} SHA-256 {{ snapshot.verified && snapshot.source ? snapshot.source.hash : snapshot.assetHash }}</code>
          </li>
        </ul>
        <div v-if="selectedCut.comment" class="cutReviewRecord"><strong>审片意见</strong><p>{{ selectedCut.comment }}</p></div>
        <form v-if="selectedCut.status === 'review' && (canReview || canApprove)" class="cutReviewForm" @submit.prevent="submitDecision('approved')">
          <uiField label="审片意见"><template #default="{ id }"><uiTextarea :id="id" v-model="reviewComment" :rows="3" :maxlength="4000" :disabled="busy" resize="vertical" placeholder="退回修改时请写明问题与修改要求" /></template></uiField>
          <div class="cutReviewActions"><uiButton v-if="canReview" variant="secondary" :disabled="busy || !reviewComment.trim()" :loading="busyAction === 'changesRequested'" @click="submitDecision('changesRequested')">退回修改</uiButton><uiButton v-if="canApprove" htmlType="submit" :disabled="busy" :loading="busyAction === 'approved'">批准此版本</uiButton></div>
        </form>
        <div v-else-if="selectedCut.status === 'changesRequested'" class="cutReviewHint">此版本已退回。修改剪辑后，在剪辑台导出并提交新版本复审。</div>
        <footer class="cutFooter">
          <div class="cutDownloads"><a :href="selectedCut.videoUrl" :download="`${selectedCut.title}V${selectedCut.version}.mp4`">下载 MP4</a><a :href="selectedCut.projectUrl" :download="`cutV${selectedCut.version}Project.json`">下载剪辑工程</a><a :href="selectedCut.manifestUrl" :download="`cutV${selectedCut.version}Manifest.json`">下载 manifest</a></div>
          <uiButton v-if="selectedCut.status === 'approved' && canDeliver" :disabled="busy" :loading="busyAction === 'deliver'" @click="deliverCut">确认交付</uiButton>
        </footer>
      </section>
    </div>
    <p v-else-if="!loading && !errorMessage" class="cutEmpty">还没有登记成片。将项目候选送入剪辑台，导出后提交到本项目审片。</p>
    <p v-else-if="loading && !cuts.length" class="cutEmpty" role="status">正在读取成片记录…</p>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { uiButton, uiField, uiTag, uiTextarea } from "@omnistudio-next/ui";

type CutStatus = "review" | "changesRequested" | "approved" | "delivered";
type MediaSource = {
  type: "workspace" | "production" | "library";
  path: string;
  hash: string;
  canvasPath?: string;
  nodeId?: string;
  outputId?: string;
  projectId?: string;
  episodeId?: string;
  shotId?: string;
  variantId?: string;
};
type SourceSnapshot = {
  assetId: string;
  assetName: string;
  assetPath: string;
  assetHash: string;
  verified: boolean;
  source?: MediaSource;
};
type ProductionCut = {
  id: string;
  title: string;
  episodeId: string | null;
  version: number;
  status: CutStatus;
  fileHash: string;
  fileSize: number;
  durationMs: number;
  width: number;
  height: number;
  frameRate: string;
  createdAt: string;
  comment: string | null;
  reviewedAt: string | null;
  deliveredAt: string | null;
  manifestIntegrity: "sha256-recorded" | "legacy-unverified";
  sourceLineageVerified: boolean;
  metadata: { sourceSnapshots?: SourceSnapshot[] };
  videoUrl: string;
  projectUrl: string;
  manifestUrl: string;
};

const props = defineProps<{
  projectId: string;
  episodes: { id: string; episodeNumber: number; title: string }[];
  canReview: boolean;
  canApprove: boolean;
  canDeliver: boolean;
  refreshKey: number;
}>();
const cuts = ref<ProductionCut[]>([]);
const selectedId = ref("");
const loading = ref(false);
const busyAction = ref("");
const errorMessage = ref("");
const previewError = ref("");
const notice = ref("");
const reviewComment = ref("");
let requestVersion = 0;
let active = true;
const selectedCut = computed(() => cuts.value.find(cut => cut.id === selectedId.value));
const sourceLineageLabel = computed(() => {
  const cut = selectedCut.value;
  const snapshots = cut?.metadata.sourceSnapshots;
  if (!snapshots) return "旧版记录，无服务端来源快照";
  if (!snapshots.length) return "无引用素材，未标记为已核验";
  const verifiedCount = snapshots.filter(snapshot => snapshot.verified).length;
  if (cut.sourceLineageVerified) return `服务端已核验 ${verifiedCount}/${snapshots.length} 项`;
  return `已核验 ${verifiedCount} 项，未核验 ${snapshots.length - verifiedCount} 项`;
});
const busy = computed(() => !!busyAction.value);
const statusLabels: Record<CutStatus, string> = { review: "待审片", changesRequested: "退回修改", approved: "已批准", delivered: "已交付" };

function statusTone(status: CutStatus) { return status === "approved" || status === "delivered" ? "success" : "warning"; }
function episodeLabel(id: string | null) {
  const episode = props.episodes.find(item => item.id === id);
  return episode ? `第 ${episode.episodeNumber} 集 · ${episode.title}` : "全项目成片";
}
function sourceLabel(source?: MediaSource) {
  if (!source) return "来源未核验";
  if (source.type === "workspace") {
    if (!source.canvasPath) return `工作区素材 · ${source.path}`;
    return [`画布 ${source.canvasPath}`, source.nodeId && `节点 ${source.nodeId}`, source.outputId && `输出 ${source.outputId}`].filter(Boolean).join(" · ");
  }
  if (source.type === "production") {
    const references = [source.projectId && `项目 ${source.projectId}`, source.episodeId && `剧集 ${source.episodeId}`, source.shotId && `镜头 ${source.shotId}`, source.variantId && `候选 ${source.variantId}`].filter(Boolean);
    return `项目候选${references.length ? ` · ${references.join(" · ")}` : ""}`;
  }
  return `共享素材库 · ${source.path}`;
}
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function formatDuration(value: number) { return `${(value / 1000).toFixed(2)} 秒`; }
function formatFrameRate(value: string) {
  const match = /^(\d+)(?:\/(\d+))?$/.exec(value);
  if (!match) return "—";
  const numerator = Number(match[1]);
  const denominator = Number(match[2] ?? 1);
  const rate = numerator / denominator;
  return Number.isFinite(rate) && denominator > 0 && rate > 0 ? Number(rate.toFixed(3)) : "—";
}
function formatBytes(value: number) { return value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(2)} GiB` : `${(value / 1024 ** 2).toFixed(2)} MiB`; }
function errorText(error: unknown) { return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "请求失败，请重试" : error instanceof Error ? error.message : "请求失败，请重试"; }

async function loadCuts() {
  const version = ++requestVersion;
  const projectId = props.projectId;
  loading.value = true;
  errorMessage.value = "";
  try {
    const { data } = await axios.get<{ data: { cuts: ProductionCut[] } }>("/api/productionProjects/cuts/list", { params: { projectId } });
    if (!active || version !== requestVersion || projectId !== props.projectId) return;
    cuts.value = data.data.cuts;
    if (!cuts.value.some(cut => cut.id === selectedId.value)) selectedId.value = cuts.value[0]?.id ?? "";
  } catch (error) {
    if (active && version === requestVersion && projectId === props.projectId) errorMessage.value = errorText(error);
  } finally {
    if (active && version === requestVersion) loading.value = false;
  }
}

async function submitDecision(decision: "approved" | "changesRequested") {
  const cut = selectedCut.value;
  const projectId = props.projectId;
  if (!cut || cut.status !== "review" || busy.value || (decision === "approved" ? !props.canApprove : !props.canReview || !reviewComment.value.trim())) return;
  busyAction.value = decision;
  errorMessage.value = "";
  notice.value = "";
  try {
    await axios.post("/api/productionProjects/cuts/decision", { projectId, cutId: cut.id, decision, comment: reviewComment.value.trim() || undefined });
    if (!active || projectId !== props.projectId) return;
    await loadCuts();
    notice.value = decision === "approved" ? "此成片版本已批准。" : "修改要求已登记，等待新版本复审。";
  } catch (error) {
    if (active && projectId === props.projectId) errorMessage.value = errorText(error);
  } finally {
    if (active && projectId === props.projectId) busyAction.value = "";
  }
}

async function deliverCut() {
  const cut = selectedCut.value;
  const projectId = props.projectId;
  if (!cut || cut.status !== "approved" || busy.value || !props.canDeliver) return;
  busyAction.value = "deliver";
  errorMessage.value = "";
  notice.value = "";
  try {
    await axios.post("/api/productionProjects/cuts/deliver", { projectId, cutId: cut.id });
    if (!active || projectId !== props.projectId) return;
    await loadCuts();
    notice.value = "此版本已交付，交付时间与文件哈希已保留。";
  } catch (error) {
    if (active && projectId === props.projectId) errorMessage.value = errorText(error);
  } finally {
    if (active && projectId === props.projectId) busyAction.value = "";
  }
}

watch(() => props.projectId, () => {
  cuts.value = [];
  selectedId.value = "";
  busyAction.value = "";
  notice.value = "";
});
watch(() => [props.projectId, props.refreshKey], () => { void loadCuts(); }, { immediate: true });
watch(selectedId, () => { reviewComment.value = ""; previewError.value = ""; notice.value = ""; });
onBeforeUnmount(() => { active = false; requestVersion++; });
</script>

<style scoped lang="scss">
.cutPanel {
  margin-bottom: 22px;
  overflow: hidden;
  border: 1px solid var(--uiBorderDefault);
  border-radius: 14px;
  background: var(--uiSurfaceRaised);
  .cutPanelHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px;
    border-bottom: 1px solid var(--uiBorderDefault);
    h3 { margin: 5px 0; color: var(--uiTextPrimary); font-size: 18px; }
    p { margin: 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.6; }
    .cutHeaderActions { display: flex; align-items: center; gap: 10px; }
  }
  .cutEyebrow { color: var(--uiTextMuted); font-size: 10px; letter-spacing: .06em; }
  .cutError, .cutNotice { margin: 12px 20px; font-size: 12px; line-height: 1.6; }
  .cutError { color: var(--uiStatusError); }
  .cutNotice { color: var(--uiStatusSuccess); }
  .cutWorkspace {
    display: grid;
    grid-template-columns: minmax(230px, 30%) minmax(0, 1fr);
    .cutList {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 780px;
      padding: 12px;
      overflow-y: auto;
      border-right: 1px solid var(--uiBorderDefault);
      .cutListItem {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        align-items: center;
        gap: 9px;
        padding: 12px 10px;
        border: 1px solid transparent;
        border-radius: 8px;
        color: var(--uiTextPrimary);
        background: transparent;
        text-align: left;
        cursor: pointer;
        &:hover, &.selected { border-color: var(--uiBorderDefault); background: var(--uiBackgroundSubtle); }
        &.selected { box-shadow: inset 3px 0 var(--uiActionPrimary); }
        &:focus-visible { outline: 2px solid var(--uiActionPrimary); outline-offset: 2px; }
        &:disabled { cursor: default; }
        > :last-child { grid-column: 2; justify-self: start; }
        .cutVersion { color: var(--uiActionPrimary); font: 600 12px ui-monospace, monospace; }
        .cutListCopy {
          min-width: 0;
          strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          strong { font-size: 12px; }
          small { margin-top: 5px; color: var(--uiTextMuted); font-size: 10px; }
        }
      }
    }
    .cutDetail {
      min-width: 0;
      padding: 20px;
      .cutDetailHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; h4 { margin: 5px 0 14px; color: var(--uiTextPrimary); font-size: 16px; } }
      .cutPlayer { display: block; width: 100%; max-height: 410px; aspect-ratio: 16 / 9; border-radius: 8px; background: #070b10; object-fit: contain; }
      .cutError { margin: 10px 0; }
      .cutSpecs { display: flex; flex-wrap: wrap; gap: 8px 18px; padding: 12px 0; color: var(--uiTextMuted); font: 11px ui-monospace, monospace; }
      .cutEvidence {
        display: grid;
        gap: 8px;
        margin: 0;
        padding: 14px 0;
        border-top: 1px solid var(--uiBorderDefault);
        div { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 12px; font-size: 11px; }
        dt { color: var(--uiTextMuted); }
        dd { margin: 0; color: var(--uiTextPrimary); }
        .cutHash { overflow-wrap: anywhere; font: 10px ui-monospace, monospace; }
      }
      .cutSourceList {
        display: grid;
        gap: 8px;
        margin: -4px 0 14px;
        padding: 0;
        list-style: none;
        li { display: grid; gap: 4px; padding: 8px 0; border-top: 1px solid var(--uiBorderDefault); }
        span { display: grid; gap: 3px; min-width: 0; }
        strong { color: var(--uiTextPrimary); font-size: 11px; font-weight: 550; }
        small { color: var(--uiTextMuted); font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
        code { color: var(--uiTextSecondary); font: 9px ui-monospace, monospace; line-height: 1.5; overflow-wrap: anywhere; }
      }
      .cutReviewRecord { padding: 12px; border-radius: 7px; background: var(--uiBackgroundSubtle); strong { color: var(--uiTextPrimary); font-size: 11px; } p { margin: 7px 0 0; color: var(--uiTextSecondary); font-size: 12px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; } }
      .cutReviewForm { display: grid; gap: 12px; padding-top: 14px; .cutReviewActions { display: flex; justify-content: flex-end; gap: 8px; } }
      .cutReviewHint { margin-top: 10px; color: var(--uiTextMuted); font-size: 12px; line-height: 1.7; }
      .cutFooter {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid var(--uiBorderDefault);
        .cutDownloads { display: flex; flex-wrap: wrap; gap: 10px 16px; a { color: var(--uiActionPrimary); font-size: 11px; text-underline-offset: 3px; &:focus-visible { outline: 2px solid var(--uiActionPrimary); outline-offset: 3px; } } }
      }
    }
  }
  .cutEmpty { margin: 0; padding: 28px 20px; color: var(--uiTextMuted); font-size: 12px; line-height: 1.7; }
}
@media (max-width: 800px) { .cutPanel .cutWorkspace { grid-template-columns: 1fr; .cutList { max-height: 240px; border-right: 0; border-bottom: 1px solid var(--uiBorderDefault); } } }
@media (max-width: 520px) { .cutPanel { .cutPanelHeader { align-items: flex-start; flex-direction: column; padding: 16px; } .cutWorkspace .cutDetail { padding: 16px; } } }
</style>

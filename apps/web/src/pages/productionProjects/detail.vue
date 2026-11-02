<template>
  <accountShell :title="project?.title ?? '生产项目'" eyebrow="生产项目详情" description="结构化管理剧集、镜头、候选版本与交付证据。">
    <template #actions>
      <uiButton variant="ghost" @click="router.push('/productionProjects')">返回项目列表</uiButton>
      <uiButton variant="secondary" :loading="loading" @click="loadProject">刷新详情</uiButton>
      <uiButton :disabled="!project || exporting" :loading="exporting" @click="exportDelivery">导出交付包</uiButton>
    </template>

    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
    <div v-if="loading && !project" class="loadingState">正在读取项目生产数据…</div>
    <template v-else-if="project">
      <section class="projectHero">
        <div><span class="heroKicker">{{ project.id }}</span><h2>{{ project.title }}</h2><p>预算 {{ project.budgetCents }} 积分 · {{ project.members.length }} 位项目成员 · {{ project.shots.length }} 个镜头</p></div>
        <div class="heroStatus"><uiTag :tone="statusTone(project.status)">{{ statusLabel(project.status) }}</uiTag><span>当前角色：{{ roleLabel(currentRole) }}</span></div>
      </section>

      <section class="workflowRail" aria-label="生产流程"><div v-for="(step, index) in workflowSteps" :key="step.key" class="workflowStep" :class="{ active: isWorkflowActive(step.key), current: step.key === project.status }"><span>{{ String(index + 1).padStart(2, '0') }}</span><strong>{{ step.label }}</strong></div></section>

      <div class="detailGrid">
        <section class="mainColumn">
          <uiCard title="剧集与镜头">
            <template #actions><uiButton size="small" :disabled="!canCreate" @click="episodeVisible = true">添加剧集</uiButton></template>
            <div v-if="!project.episodes.length" class="inlineEmpty">还没有剧集。先创建第一集，再添加场景和镜头。</div>
            <div v-for="episode in project.episodes" :key="episode.id" class="episodeBlock">
              <header class="episodeHeader"><div><span class="episodeNumber">EP {{ String(episode.episodeNumber).padStart(2, '0') }}</span><h3>{{ episode.title }}</h3></div><uiTag>{{ episode.status }}</uiTag></header>
              <div class="shotList"><article v-for="shot in shotsForEpisode(episode.id)" :key="shot.id" class="shotRow"><div class="shotIndex">{{ String(shot.shotNumber).padStart(2, '0') }}</div><div class="shotBody"><strong>{{ shot.prompt || '未填写镜头提示词' }}</strong><span>{{ shot.durationMs }}ms · {{ shot.shotType || '未设景别' }} · 修订 {{ shot.revision }}</span></div><uiTag :tone="shotTone(shot.status)">{{ shotStatusLabel(shot.status) }}</uiTag><div class="shotActions"><uiButton v-if="shot.status === 'review'" size="small" variant="secondary" :disabled="busy" @click="selectShotForReview(shot)">审片</uiButton><uiButton v-if="shot.status === 'draft' || shot.status === 'ready' || shot.status === 'changesRequested'" size="small" :disabled="busy" @click="selectShotForGeneration(shot)">生成</uiButton></div></article><div v-if="!shotsForEpisode(episode.id).length" class="inlineEmpty">这一集还没有镜头。</div></div>
              <uiButton v-if="canCreate" class="addShotButton" variant="ghost" size="small" @click="openShotForm(episode.id)">＋ 添加镜头</uiButton>
            </div>
          </uiCard>
        </section>

        <aside class="sideColumn">
          <uiCard title="预算与权限"><div class="budgetBlock"><span>项目预算</span><strong>{{ project.budgetCents }} <small>积分</small></strong><div class="budgetMeter"><i :style="{ width: `${budgetPercent}%` }" /></div><p>{{ budgetHint }}</p></div><div class="memberList"><div v-for="member in project.members" :key="member.id"><span>{{ member.displayName || member.email }}</span><uiTag>{{ roleLabel(member.role) }}</uiTag></div></div></uiCard>
          <uiCard title="候选版本与审计"><div class="auditSummary"><div><strong>{{ project.variants.length }}</strong><span>候选片段</span></div><div><strong>{{ project.approvals.length }}</strong><span>审批记录</span></div><div><strong>{{ project.reviews.length }}</strong><span>评论记录</span></div></div><p class="sideHint">每次生成、退回、批准和导出都会记录在项目审计链路中。</p></uiCard>
        </aside>
      </div>
    </template>

    <uiDialog v-model="episodeVisible" title="添加剧集" :width="500">
      <form class="dialogForm" @submit.prevent="submitEpisode"><uiField label="季编号" required><template #default="{ id }"><uiNumberInput :id="id" v-model="episodeForm.seasonNumber" :min="1" :precision="0" /></template></uiField><uiField label="季名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="episodeForm.seasonTitle" /></template></uiField><uiField label="集编号" required><template #default="{ id }"><uiNumberInput :id="id" v-model="episodeForm.episodeNumber" :min="1" :precision="0" /></template></uiField><uiField label="集名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="episodeForm.title" /></template></uiField><p v-if="dialogError" class="pageError">{{ dialogError }}</p><div class="dialogActions"><uiButton variant="secondary" type="button" @click="episodeVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="busy" :disabled="busy || !episodeForm.title">创建剧集</uiButton></div></form>
    </uiDialog>
    <uiDialog v-model="shotVisible" title="添加镜头" :width="560">
      <form class="dialogForm" @submit.prevent="submitShot"><uiField label="场景编号" required><template #default="{ id }"><uiNumberInput :id="id" v-model="shotForm.sceneNumber" :min="1" :precision="0" /></template></uiField><uiField label="场景名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="shotForm.sceneTitle" /></template></uiField><uiField label="镜头编号" required><template #default="{ id }"><uiNumberInput :id="id" v-model="shotForm.shotNumber" :min="1" :precision="0" /></template></uiField><uiField label="时长（毫秒）"><template #default="{ id }"><uiNumberInput :id="id" v-model="shotForm.durationMs" :min="0" :precision="0" /></template></uiField><uiField label="提示词"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shotForm.prompt" :rows="4" resize="vertical" placeholder="描述动作、空间、角色和声音" /></template></uiField><p v-if="dialogError" class="pageError">{{ dialogError }}</p><div class="dialogActions"><uiButton variant="secondary" type="button" @click="shotVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="busy" :disabled="busy || !shotForm.sceneTitle || !shotForm.prompt">创建镜头</uiButton></div></form>
    </uiDialog>
    <uiDialog v-model="generateVisible" title="提交镜头生成" :width="560">
      <form class="dialogForm" @submit.prevent="submitGeneration"><uiField label="供应商 ID" required><template #default="{ id }"><uiInput :id="id" v-model.trim="generationForm.providerId" placeholder="例如 baiduVideoFire" /></template></uiField><uiField label="模型 ID" required><template #default="{ id }"><uiInput :id="id" v-model.trim="generationForm.modelId" placeholder="例如 S2.0-Mini" /></template></uiField><uiField label="工作目录" required><template #default="{ id }"><uiInput :id="id" v-model.trim="generationForm.directory" :placeholder="auth.personalDirectory" /></template></uiField><uiField label="媒体类型"><template #default="{ id }"><uiSelect :id="id" :modelValue="generationForm.mediaType" :options="mediaOptions" @update:modelValue="value => typeof value === 'string' && (generationForm.mediaType = value as 'image' | 'video' | 'audio')" /></template></uiField><uiField v-if="generationForm.mediaType === 'video'" label="视频分辨率" required><template #default="{ id }"><uiSelect :id="id" v-model="generationForm.resolution" :options="resolutionOptions" /></template></uiField><uiField label="生成提示词" required><template #default="{ id }"><uiTextarea :id="id" v-model.trim="generationForm.prompt" :rows="4" resize="vertical" /></template></uiField><p class="sectionHint">提交前会再次校验项目权限、预算和幂等键；真实供应商生成会消耗积分。</p><p v-if="dialogError" class="pageError">{{ dialogError }}</p><div class="dialogActions"><uiButton variant="secondary" type="button" @click="generateVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="busy" :disabled="busy || !generationForm.providerId || !generationForm.modelId || !generationForm.prompt || (generationForm.mediaType === 'video' && !generationForm.resolution)">提交生成</uiButton></div></form>
    </uiDialog>
    <uiDialog v-model="reviewVisible" title="候选片段审片" :width="620">
      <div v-if="selectedShot" class="reviewPanel"><div class="reviewMeta"><span>镜头 {{ selectedShot.shotNumber }}</span><uiTag tone="warning">待审片</uiTag></div><p class="reviewPrompt">{{ selectedShot.prompt }}</p><div v-if="selectedVariant" class="variantBox"><strong>候选 {{ selectedVariant.attemptNumber }}</strong><span>{{ selectedVariant.filePath }}</span></div><uiTextarea v-model="reviewComment" :rows="3" resize="vertical" placeholder="填写审片意见，可用于退回重拍或留档" /><div class="dialogActions"><uiButton variant="secondary" :disabled="busy" @click="submitDecision('changesRequested')">退回重拍</uiButton><uiButton :loading="busy" :disabled="busy" @click="submitDecision('approved')">批准候选</uiButton></div></div>
    </uiDialog>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "axios";
import { uiButton, uiCard, uiDialog, uiField, uiInput, uiNumberInput, uiSelect, uiTag, uiTextarea } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import { useAuthStore } from "@/stores/auth";

type ProjectStatus = "draft" | "scripted" | "storyboarded" | "generating" | "editing" | "review" | "approved" | "delivered";
type ShotStatus = "draft" | "ready" | "generating" | "review" | "changesRequested" | "approved";
type Episode = { id: string; seasonId: string; episodeNumber: number; title: string; status: string; targetDurationMs: number };
type Shot = { id: string; sceneId: string; shotNumber: number; durationMs: number; shotType: string | null; prompt: string | null; status: ShotStatus; revision: number };
type Variant = { id: string; shotId: string; attemptNumber: number; filePath: string; mimeType: string; status: string };
type Member = { id: string; userId: string; displayName: string | null; email: string; role: string; status: string };
type Project = { id: string; workspaceId: string; title: string; status: ProjectStatus; budgetCents: string; members: Member[]; seasons: unknown[]; episodes: Episode[]; scenes: unknown[]; shots: Shot[]; variants: Variant[]; reviews: unknown[]; approvals: unknown[] };
type ProjectPayload = { project: Omit<Project, "members" | "seasons" | "episodes" | "scenes" | "shots" | "variants" | "reviews" | "approvals">; members: Member[]; seasons: unknown[]; episodes: Episode[]; scenes: unknown[]; shots: Shot[]; variants: Variant[]; reviews: unknown[]; approvals: unknown[] };
type ApiResponse<T> = { code: number; data: T; message: string };

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const project = ref<Project>();
const loading = ref(false);
const busy = ref(false);
const exporting = ref(false);
const errorMessage = ref("");
const dialogError = ref("");
const episodeVisible = ref(false);
const shotVisible = ref(false);
const generateVisible = ref(false);
const reviewVisible = ref(false);
const selectedEpisodeId = ref("");
const selectedShot = ref<Shot>();
const selectedVariant = ref<Variant>();
const reviewComment = ref("");
const episodeForm = reactive({ seasonNumber: 1, seasonTitle: "第一季", episodeNumber: 1, title: "第一集" });
const shotForm = reactive({ sceneNumber: 1, sceneTitle: "场景 01", shotNumber: 1, durationMs: 6000, prompt: "" });
const generationForm = reactive<{ providerId: string; modelId: string; directory: string; mediaType: "image" | "video" | "audio"; resolution: string; prompt: string }>({ providerId: "", modelId: "", directory: "", mediaType: "video", resolution: "480p", prompt: "" });
const currentRole = computed(() => project.value?.members.find(member => member.userId === auth.user?.id)?.role ?? "viewer");
const canCreate = computed(() => ["owner", "producer", "writer", "director", "artist", "editor"].includes(currentRole.value));
const workflowSteps = [{ key: "draft", label: "项目" }, { key: "scripted", label: "剧本" }, { key: "storyboarded", label: "分镜" }, { key: "generating", label: "生成" }, { key: "review", label: "审片" }, { key: "approved", label: "批准" }, { key: "delivered", label: "交付" }] as const;
const mediaOptions = [{ value: "video", label: "视频" }, { value: "image", label: "图片" }, { value: "audio", label: "音频" }];
const resolutionOptions = [{ value: "480p", label: "480p" }, { value: "720p", label: "720p" }, { value: "1080p", label: "1080p" }, { value: "4k", label: "4K" }];
const statusLabels: Record<ProjectStatus, string> = { draft: "草稿", scripted: "已编剧", storyboarded: "已分镜", generating: "生成中", editing: "剪辑中", review: "待审片", approved: "已批准", delivered: "已交付" };
const shotLabels: Record<ShotStatus, string> = { draft: "草稿", ready: "待生成", generating: "生成中", review: "待审片", changesRequested: "需重拍", approved: "已批准" };
const budgetPercent = computed(() => Math.min(100, project.value ? Number(project.value.budgetCents) ? Math.round((project.value.variants.length / Number(project.value.budgetCents)) * 100) : 0 : 0));
const budgetHint = computed(() => project.value?.budgetCents === "0.000000" || project.value?.budgetCents === "0" ? "未设置预算上限" : `已记录 ${project.value?.variants.length ?? 0} 个候选片段，生成前会校验预算`);

function errorText(error: unknown) { return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "连接中断，请刷新后重试" : error instanceof Error ? error.message : "操作失败，请重试"; }
function statusLabel(status: ProjectStatus) { return statusLabels[status] ?? status; }
function statusTone(status: string) { return status === "approved" || status === "delivered" ? "success" : status === "review" || status === "generating" ? "warning" : "neutral"; }
function shotTone(status: ShotStatus) { return status === "approved" ? "success" : status === "review" || status === "changesRequested" ? "warning" : status === "generating" ? "warning" : "neutral"; }
function shotStatusLabel(status: ShotStatus) { return shotLabels[status] ?? status; }
function roleLabel(role: string) { return ({ owner: "项目所有者", producer: "制片人", writer: "编剧", director: "导演", artist: "美术", editor: "剪辑师", reviewer: "审片人", viewer: "查看者" } as Record<string, string>)[role] ?? role; }
function isWorkflowActive(key: string) { const order = ["draft", "scripted", "storyboarded", "generating", "editing", "review", "approved", "delivered"]; return project.value ? order.indexOf(key) <= order.indexOf(project.value.status) : false; }
function shotsForEpisode(episodeId: string) { const sceneIds = new Set((project.value?.scenes as { id: string; episodeId: string }[] ?? []).filter(scene => scene.episodeId === episodeId).map(scene => scene.id)); return project.value?.shots.filter(shot => sceneIds.has(shot.sceneId)) ?? []; }
async function loadProject() { loading.value = true; errorMessage.value = ""; try { const { data } = await axios.get<ApiResponse<ProjectPayload>>("/api/productionProjects/get", { params: { projectId: String(route.params.projectId) } }); const payload = data.data; project.value = { ...payload.project, members: payload.members, seasons: payload.seasons, episodes: payload.episodes, scenes: payload.scenes, shots: payload.shots, variants: payload.variants, reviews: payload.reviews, approvals: payload.approvals }; } catch (error) { errorMessage.value = errorText(error); } finally { loading.value = false; } }
function resetDialog() { dialogError.value = ""; }
function openShotForm(episodeId: string) { selectedEpisodeId.value = episodeId; resetDialog(); shotVisible.value = true; }
function selectShotForGeneration(shot: Shot) { selectedShot.value = shot; generationForm.directory = auth.personalDirectory; generationForm.prompt = shot.prompt ?? ""; resetDialog(); generateVisible.value = true; }
function selectShotForReview(shot: Shot) { selectedShot.value = shot; selectedVariant.value = project.value?.variants.find(variant => variant.shotId === shot.id && variant.status === "candidate"); reviewComment.value = ""; resetDialog(); reviewVisible.value = true; }
async function submitEpisode() { if (!project.value) return; busy.value = true; resetDialog(); try { await axios.post("/api/productionProjects/episodes/create", { projectId: project.value.id, ...episodeForm }); episodeVisible.value = false; await loadProject(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function submitShot() { if (!project.value) return; busy.value = true; resetDialog(); try { await axios.post("/api/productionProjects/shots/create", { projectId: project.value.id, episodeId: selectedEpisodeId.value, ...shotForm }); shotVisible.value = false; await loadProject(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function submitGeneration() { if (!project.value || !selectedShot.value) return; busy.value = true; resetDialog(); try { await axios.post("/api/productionProjects/shots/generate", { projectId: project.value.id, shotId: selectedShot.value.id, directory: generationForm.directory || auth.personalDirectory, mediaType: generationForm.mediaType, providerId: generationForm.providerId, modelId: generationForm.modelId, prompt: generationForm.prompt, resolution: generationForm.mediaType === "video" ? generationForm.resolution : undefined, duration: generationForm.mediaType === "video" ? selectedShot.value.durationMs / 1000 : undefined }, { headers: { "Idempotency-Key": crypto.randomUUID() } }); generateVisible.value = false; await loadProject(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function submitDecision(decision: "approved" | "changesRequested") { if (!project.value || !selectedVariant.value) return; busy.value = true; try { await axios.post("/api/productionProjects/reviews/decision", { projectId: project.value.id, variantId: selectedVariant.value.id, decision, comment: reviewComment.value || undefined }); reviewVisible.value = false; await loadProject(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function exportDelivery() { if (!project.value) return; exporting.value = true; errorMessage.value = ""; try { await axios.post("/api/productionProjects/delivery/export", { projectId: project.value.id, directory: auth.personalDirectory }); await loadProject(); } catch (error) { errorMessage.value = errorText(error); } finally { exporting.value = false; } }
onMounted(async () => { await auth.restoreSession(); await loadProject(); });
</script>

<style scoped lang="scss">
.pageError { margin: 0 0 20px; color: var(--uiStatusError); line-height: 1.6; }
.loadingState, .inlineEmpty { padding: 24px; color: var(--uiTextMuted); text-align: center; }
.projectHero { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; padding: 26px 28px; border: 1px solid var(--uiBorderDefault); border-radius: 18px; background: linear-gradient(120deg, var(--uiSurfaceRaised), color-mix(in srgb, var(--uiActionPrimary) 6%, var(--uiSurfaceRaised))); .heroKicker { color: var(--uiTextMuted); font: 11px ui-monospace, monospace; } h2 { margin: 12px 0 8px; font-size: clamp(25px, 3vw, 38px); letter-spacing: -.03em; } p { margin: 0; color: var(--uiTextMuted); } .heroStatus { display: grid; align-content: center; justify-items: end; gap: 10px; color: var(--uiTextMuted); font-size: 12px; }
}
.workflowRail { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 24px; padding: 10px; border: 1px solid var(--uiBorderDefault); border-radius: 14px; background: var(--uiSurfaceRaised); .workflowStep { display: grid; gap: 4px; padding: 10px 12px; border-radius: 10px; color: var(--uiTextMuted); font-size: 11px; span { font: 10px ui-monospace, monospace; } &.active { color: var(--uiTextPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 8%, transparent); } &.current { color: var(--uiActionPrimary); box-shadow: inset 0 -2px var(--uiActionPrimary); } }
}
.detailGrid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(260px, .8fr); gap: 20px; }
.mainColumn, .sideColumn { min-width: 0; display: grid; gap: 20px; align-content: start; }
.episodeBlock { border-top: 1px solid var(--uiBorderDefault); padding-top: 18px; margin-top: 18px; &:first-child { margin-top: 0; border-top: 0; padding-top: 0; } }
.episodeHeader { display: flex; align-items: center; justify-content: space-between; gap: 14px; .episodeNumber { color: var(--uiActionPrimary); font: 11px ui-monospace, monospace; } h3 { margin: 6px 0 0; font-size: 17px; } }
.shotList { display: grid; gap: 8px; margin-top: 16px; }
.shotRow { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto auto; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; &:hover { border-color: color-mix(in srgb, var(--uiActionPrimary) 55%, var(--uiBorderDefault)); } .shotIndex { color: var(--uiActionPrimary); font: 700 13px ui-monospace, monospace; } .shotBody { min-width: 0; strong, span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } strong { font-size: 13px; } span { margin-top: 4px; color: var(--uiTextMuted); font-size: 11px; } } .shotActions { display: flex; gap: 6px; } }
.addShotButton { margin-top: 14px; }
.budgetBlock { padding-bottom: 18px; border-bottom: 1px solid var(--uiBorderDefault); span, p { color: var(--uiTextMuted); font-size: 12px; } strong { display: block; margin: 8px 0 14px; font-size: 28px; small { font-size: 12px; font-weight: 400; color: var(--uiTextMuted); } } p { margin: 10px 0 0; line-height: 1.6; } .budgetMeter { height: 7px; overflow: hidden; border-radius: 99px; background: var(--uiBackgroundSubtle); i { display: block; height: 100%; border-radius: inherit; background: var(--uiActionPrimary); } } }
.memberList { display: grid; gap: 10px; padding-top: 16px; div { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; } } }
.auditSummary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; div { display: grid; gap: 5px; } strong { font-size: 24px; } span { color: var(--uiTextMuted); font-size: 11px; } } .sideHint { margin: 18px 0 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.7; }
.dialogForm { display: grid; gap: 16px; .dialogActions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; } .sectionHint { margin: 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.7; } }
.reviewPanel { display: grid; gap: 16px; .reviewMeta { display: flex; align-items: center; justify-content: space-between; } .reviewPrompt { margin: 0; padding: 14px; border-radius: 10px; background: var(--uiBackgroundSubtle); line-height: 1.7; } .variantBox { display: grid; gap: 5px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; span { color: var(--uiTextMuted); font: 11px ui-monospace, monospace; overflow-wrap: anywhere; } } }
@media (max-width: 860px) { .detailGrid { grid-template-columns: 1fr; } .workflowRail { overflow-x: auto; grid-template-columns: repeat(7, minmax(100px, 1fr)); } }
@media (max-width: 620px) { .projectHero { display: grid; .heroStatus { justify-items: start; } } .shotRow { grid-template-columns: 30px minmax(0, 1fr); .uiTag, .shotActions { grid-column: 2; justify-self: start; } } }
</style>

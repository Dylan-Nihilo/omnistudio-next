<template>
  <accountShell title="生产项目" eyebrow="企业漫剧工作区" description="把剧集、镜头、预算和审片状态放在同一条可追踪生产链路里。">
    <template #actions>
      <uiButton variant="secondary" :loading="loading" @click="loadProjects">刷新项目</uiButton>
      <uiButton :disabled="!auth.currentTeamId" @click="createVisible = true">新建生产项目</uiButton>
    </template>

    <div class="productionIntro">
      <div>
        <span class="introKicker">Production control room</span>
        <h2>从需求到交付，每个版本都有归属。</h2>
        <p>先建立项目和预算，再进入剧集、镜头、生成、审片与交付阶段。项目写操作始终继承当前团队权限。</p>
      </div>
      <div class="introMetric"><span>当前团队</span><strong>{{ currentTeam?.name ?? '未选择团队' }}</strong><small>{{ projects.length }} 个项目</small></div>
    </div>

    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
    <uiAlert v-if="!auth.currentTeamId" title="请先选择或创建团队" tone="warning">生产项目必须归属团队，前往团队空间创建团队后再开始。</uiAlert>

    <section class="projectGrid" aria-label="生产项目列表">
      <uiCard v-for="project in projects" :key="project.id" class="projectCard">
        <template #header>
          <div class="cardHeading"><span class="projectMark">{{ project.title.slice(0, 1) }}</span><div><h3>{{ project.title }}</h3><span class="projectId">{{ project.id }}</span></div></div>
        </template>
        <template #actions><uiTag :tone="statusTone(project.status)">{{ statusLabel(project.status) }}</uiTag></template>
        <div class="projectStats"><div><span>项目预算</span><strong>{{ project.budgetCents }} 积分</strong></div><div><span>你的角色</span><strong>{{ roleLabel(project.role) }}</strong></div><div><span>创建时间</span><strong>{{ formatDate(project.createdAt) }}</strong></div></div>
        <div class="cardFooter"><span class="muted">最近更新 {{ formatDate(project.updatedAt) }}</span><uiButton size="small" @click="openProject(project.id)">进入项目</uiButton></div>
      </uiCard>
      <div v-if="!loading && !projects.length" class="emptyState"><span class="emptyGlyph">01</span><h3>还没有生产项目</h3><p>创建第一个企业漫剧项目，开始建立可追踪的制作链路。</p><uiButton :disabled="!auth.currentTeamId" @click="createVisible = true">创建项目</uiButton></div>
    </section>

    <uiDialog v-model="createVisible" title="新建生产项目" :width="520" :closeOnClickModal="!creating">
      <form class="projectForm" @submit.prevent="submitCreate">
        <uiField label="项目名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="createForm.title" maxlength="200" autofocus placeholder="例如：青禾传媒 · 夏日短剧" :disabled="creating" /></template></uiField>
        <uiField label="客户 ID"><template #default="{ id }"><uiInput :id="id" v-model.trim="createForm.customerId" maxlength="36" placeholder="可选，用于关联企业客户" :disabled="creating" /></template></uiField>
        <uiField label="项目预算（积分）" required><template #default="{ id }"><uiNumberInput :id="id" v-model="createForm.budget" :min="0" :step="1" :precision="0" :disabled="creating" /></template></uiField>
        <p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p>
        <div class="dialogActions"><uiButton variant="secondary" type="button" :disabled="creating" @click="createVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="creating" :disabled="creating || !createForm.title">创建项目</uiButton></div>
      </form>
    </uiDialog>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { uiAlert, uiButton, uiCard, uiDialog, uiField, uiInput, uiNumberInput, uiTag } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import { useAuthStore } from "@/stores/auth";

type ProjectStatus = "draft" | "scripted" | "storyboarded" | "generating" | "editing" | "review" | "approved" | "delivered";
type Project = { id: string; workspaceId: string; customerId: string | null; title: string; status: ProjectStatus; budgetCents: string; createdBy: string; role: string; createdAt: string; updatedAt: string };
type ApiResponse<T> = { code: number; data: T; message: string };

const router = useRouter();
const auth = useAuthStore();
const projects = ref<Project[]>([]);
const loading = ref(false);
const creating = ref(false);
const createVisible = ref(false);
const errorMessage = ref("");
const dialogError = ref("");
const createForm = reactive({ title: "", customerId: "", budget: 1600 });
const currentTeam = computed(() => auth.currentTeam);
const statusLabels: Record<ProjectStatus, string> = { draft: "草稿", scripted: "已编剧", storyboarded: "已分镜", generating: "生成中", editing: "剪辑中", review: "待审片", approved: "已批准", delivered: "已交付" };

function errorText(error: unknown) { return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "连接中断，请刷新后重试" : error instanceof Error ? error.message : "操作失败，请重试"; }
function statusLabel(status: ProjectStatus) { return statusLabels[status] ?? status; }
function statusTone(status: ProjectStatus) { return status === "approved" || status === "delivered" ? "success" : status === "review" ? "warning" : status === "generating" ? "warning" : "neutral"; }
function roleLabel(role: string) { return ({ owner: "项目所有者", producer: "制片人", director: "导演", reviewer: "审片人", editor: "剪辑师", viewer: "查看者" } as Record<string, string>)[role] ?? role; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }); }
async function loadProjects() {
  if (!auth.currentTeamId) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const { data } = await axios.get<ApiResponse<Project[]>>("/api/productionProjects/list", { params: { workspaceId: auth.currentTeamId } });
    projects.value = data.data;
  } catch (error) { errorMessage.value = errorText(error); }
  finally { loading.value = false; }
}
async function submitCreate() {
  if (!auth.currentTeamId || !createForm.title.trim()) return;
  creating.value = true;
  dialogError.value = "";
  try {
    const { data } = await axios.post<ApiResponse<Project>>("/api/productionProjects/create", { workspaceId: auth.currentTeamId, title: createForm.title, customerId: createForm.customerId || undefined, budgetCents: String(createForm.budget ?? 0) });
    createVisible.value = false;
    createForm.title = "";
    createForm.customerId = "";
    createForm.budget = 1600;
    await router.push(`/productionProjects/${data.data.id}`);
  } catch (error) { dialogError.value = errorText(error); }
  finally { creating.value = false; }
}
function openProject(id: string) { void router.push(`/productionProjects/${id}`); }
onMounted(async () => { await auth.restoreSession(); await loadProjects(); });
</script>

<style scoped lang="scss">
.pageError { margin: 0 0 20px; color: var(--uiStatusError); line-height: 1.6; }
.productionIntro { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 32px; margin-bottom: 34px; padding: 28px 30px; border: 1px solid var(--uiBorderDefault); border-radius: 18px; background: radial-gradient(circle at 90% 20%, color-mix(in srgb, var(--uiActionPrimary) 15%, transparent), transparent 45%), var(--uiSurfaceRaised); .introKicker { color: var(--uiActionPrimary); font: 600 11px/1.2 ui-monospace, monospace; letter-spacing: .16em; text-transform: uppercase; } h2 { margin: 14px 0 10px; max-width: 620px; font-size: clamp(24px, 3vw, 38px); line-height: 1.15; letter-spacing: -.03em; } p { max-width: 640px; margin: 0; color: var(--uiTextMuted); line-height: 1.8; } .introMetric { display: grid; align-content: center; gap: 8px; padding-left: 24px; border-left: 1px solid var(--uiBorderDefault); span, small { color: var(--uiTextMuted); font-size: 12px; } strong { font-size: 20px; overflow-wrap: anywhere; } }
}
.projectGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 18px; }
.projectCard { min-height: 210px; :deep(.cardHeader) { padding: 14px 18px; } :deep(.cardContent) { padding: 18px; } }
.cardHeading { display: flex; align-items: center; gap: 12px; min-width: 0; .projectMark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: color-mix(in srgb, var(--uiActionPrimary) 16%, transparent); color: var(--uiActionPrimary); font-weight: 700; } h3 { margin: 0 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .projectId { display: block; max-width: 210px; color: var(--uiTextMuted); font: 10px ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; }
}
.projectStats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; div { min-width: 0; } span { display: block; margin-bottom: 8px; color: var(--uiTextMuted); font-size: 11px; } strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; } }
.cardFooter { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 14px; border-top: 1px solid var(--uiBorderDefault); .muted { color: var(--uiTextMuted); font-size: 11px; } }
.emptyState { grid-column: 1 / -1; display: grid; justify-items: center; gap: 10px; padding: 70px 20px; border: 1px dashed var(--uiBorderDefault); border-radius: 18px; text-align: center; .emptyGlyph { color: var(--uiActionPrimary); font: 700 28px ui-monospace, monospace; } h3, p { margin: 0; } p { color: var(--uiTextMuted); } }
.projectForm { display: grid; gap: 18px; .dialogActions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 8px; } }
@media (max-width: 700px) { .productionIntro { grid-template-columns: 1fr; padding: 22px; .introMetric { padding: 18px 0 0; border-top: 1px solid var(--uiBorderDefault); border-left: 0; } } .projectGrid { grid-template-columns: 1fr; } }
</style>

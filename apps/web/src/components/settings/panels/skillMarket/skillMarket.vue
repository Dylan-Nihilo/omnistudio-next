<template>
  <section class="skillMarket" aria-label="技能精选目录" :aria-busy="loading || Boolean(installingId)">
    <header class="marketHeader">
      <div>
        <h3>官方精选技能</h3>
        <p>{{ scope === "account" ? "安装仅对当前账户可用。" : "安装到全局目录后，所有用户都可以在 Agent 对话中选择。" }}</p>
      </div>
      <uiButton variant="ghost" :icon="IconRefresh" :disabled="loading || Boolean(installingId)" aria-label="刷新技能目录" title="刷新技能目录" @click="load" />
    </header>
    <div class="marketFilters">
      <uiInput v-model.trim="searchQuery" clearable placeholder="搜索技能或用途" aria-label="搜索官方技能" />
      <uiSelect v-model="selectedStage" :options="stageOptions" aria-label="按制作阶段筛选" />
    </div>
    <p v-if="errorMessage" class="marketError" role="alert">{{ errorMessage }}</p>
    <p v-if="loading" class="marketStatus" role="status">正在读取技能目录…</p>
    <div v-else class="packageList">
      <article v-for="item in filteredPackages" :key="item.packageId" class="packageItem">
        <header class="packageHeader">
          <div>
            <h4>{{ item.displayName }}</h4>
            <p>{{ item.description }}</p>
          </div>
          <uiTag tone="neutral">{{ item.publisher }} · {{ item.license }}</uiTag>
        </header>
        <dl class="packageFacts">
          <div><dt>发布者</dt><dd>{{ item.publisher }}</dd></div>
          <div><dt>版本</dt><dd>{{ item.version }}</dd></div>
          <div v-if="scope === 'account' && item.installedVersion"><dt>个人已安装</dt><dd>{{ item.installedVersion }}</dd></div>
          <div><dt>包含技能</dt><dd>{{ item.skills.length }}</dd></div>
          <div><dt>来源提交</dt><dd><code>{{ item.sourceCommit.slice(0, 12) }}</code></dd></div>
          <div><dt>所需能力</dt><dd>{{ item.requiredCapabilities.join("、") }}</dd></div>
        </dl>
        <p class="compatibility">{{ item.hostCompatibility }}</p>
        <p v-if="item.conflicts.length" class="packageNotice">以下技能已由管理员安装到全局目录，无法重复安装：{{ item.conflicts.join("、") }}</p>
        <p v-else-if="item.installedCount > 0 && !item.installed" class="packageNotice">检测到部分同名技能已安装。为避免覆盖现有内容，暂不支持整包覆盖安装。</p>
        <div v-if="scope === 'account' && item.updateAvailable" class="updatePreview">
          <uiButton size="small" variant="secondary" :loading="previewingId === item.packageId" :disabled="Boolean(installingId) || Boolean(autoPauseName)" @click="previewUpdate(item)">查看更新差异</uiButton>
          <p v-if="updatePreviews[item.packageId]" class="previewResult">{{ updatePreviewLabel(updatePreviews[item.packageId]!) }}</p>
          <details v-if="updatePreviews[item.packageId]" class="fileDiffDetails">
            <summary>查看文件差异（{{ updatePreviews[item.packageId]!.changes.length }}）</summary>
            <ul><li v-for="change in updatePreviews[item.packageId]!.changes" :key="change.path"><span>{{ change.status === 'added' ? '新增' : change.status === 'changed' ? '修改' : '删除' }}</span><code>{{ change.path }}</code></li></ul>
            <p v-if="updatePreviews[item.packageId]!.localModified.length" class="localChangesTitle">本地修改</p>
            <ul v-if="updatePreviews[item.packageId]!.localModified.length"><li v-for="change in updatePreviews[item.packageId]!.localModified" :key="change.path"><code>{{ change.path }}</code></li></ul>
          </details>
          <uiButton v-if="updatePreviews[item.packageId]?.updateAvailable && updatePreviews[item.packageId]?.cleanFromCatalog" size="small" :loading="lifecycleAction === `update:${item.packageId}`" :disabled="Boolean(lifecycleAction)" @click="updatePackage(item, updatePreviews[item.packageId]!)">升级到 v{{ updatePreviews[item.packageId]!.targetVersion }}</uiButton>
        </div>
        <div v-if="scope === 'account' && item.installedCount" class="personalActions">
          <uiButton size="small" variant="danger" :disabled="Boolean(lifecycleAction) || Boolean(installingId)" :loading="lifecycleAction === `uninstall:${item.packageId}`" @click="uninstallPackage(item)">卸载个人安装</uiButton>
        </div>
        <details v-if="scope === 'account' && item.backups.length" class="backupDetails">
          <summary>可恢复备份（{{ item.backups.length }}）</summary>
          <div v-for="backup in item.backups" :key="backup.id" class="backupRow">
            <span>v{{ backup.version }} · {{ new Date(backup.createdAt).toLocaleString() }}</span>
            <uiButton size="small" variant="secondary" :disabled="Boolean(lifecycleAction)" :loading="lifecycleAction === `restore:${backup.id}`" @click="restoreBackup(item, backup)">恢复</uiButton>
          </div>
        </details>
        <details class="packageDetails">
          <summary>技能详情、示例与版本</summary>
          <ul class="skillNames"><li v-for="skill in visibleSkills(item)" :key="skill.name"><div><strong>{{ skill.displayName }}</strong><span>{{ stageLabel(skill.stage) }} · {{ skill.description }}</span><code>/skill:{{ skill.name }}</code></div><uiCheckbox v-if="scope === 'account' && skill.installed" :modelValue="skill.autoPaused" :disabled="Boolean(autoPauseName)" @update:modelValue="value => setAutoPaused(item, skill, value)">暂停自动推荐</uiCheckbox></li></ul>
          <p class="detailLabel">示例</p>
          <ul class="examples"><li v-for="example in item.examples" :key="example.input"><span>输入：{{ example.input }}</span><span>输出：{{ example.output }}</span></li></ul>
          <p class="detailLabel">版本记录</p>
          <ul class="limitations"><li v-for="version in item.versions" :key="version.version">v{{ version.version }} · {{ version.sourceCommit.slice(0, 12) }}</li></ul>
          <ul class="limitations"><li v-for="limitation in item.limitations" :key="limitation">{{ limitation }}</li></ul>
        </details>
        <footer class="packageActions">
          <div class="sourceLinks">
            <a :href="item.sourceUrl" target="_blank" rel="noreferrer">查看源项目</a>
            <a :href="item.licenseUrl" target="_blank" rel="noreferrer">查看许可证</a>
          </div>
          <uiButton :disabled="Boolean(installingId) || item.installedCount > 0 || item.conflicts.length > 0" :loading="installingId === item.packageId" @click="installPackage(item)">
            {{ item.conflicts.length ? '全局已提供' : item.updateAvailable ? `已安装 v${item.installedVersion} · 可更新` : item.installed ? scope === 'account' ? '个人已安装' : '已安装' : item.installedCount ? `部分安装 ${item.installedCount}/${item.skills.length}` : scope === 'account' ? '安装到个人账户' : '安装到全局' }}
          </uiButton>
        </footer>
      </article>
      <p v-if="!filteredPackages.length && !loading" class="marketStatus">没有匹配的技能包。</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import axios from "axios";
import { IconRefresh } from "@tabler/icons-vue";
import { uiButton, uiCheckbox, uiInput, uiSelect, uiTag, useUiFeedback, isUiCancelledError } from "@omnistudio-next/ui";
import { authClient, type ApiResponse } from "@/lib/authApi";

const props = withDefaults(defineProps<{ scope?: "global" | "account" }>(), { scope: "account" });

type CatalogPackage = {
  packageId: string;
  displayName: string;
  description: string;
  publisher: string;
  version: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  sourceCommit: string;
  skills: { name: string; displayName: string; stage: string; description: string; installed?: boolean; autoPaused?: boolean }[];
  compatibility: string;
  hostCompatibility: string;
  requiredCapabilities: string[];
  examples: { input: string; output: string }[];
  versions: { version: string; sourceCommit: string }[];
  limitations: string[];
  installedCount: number;
  installed: boolean;
  conflicts: string[];
  installedVersion?: string;
  updateAvailable: boolean;
  backups: { id: string; version: string; sourceCommit: string; sourceSha256: string; archiveSha256: string; createdAt: string }[];
};

const emit = defineEmits<{ installed: [] }>();
const feedback = useUiFeedback();
const packages = ref<CatalogPackage[]>([]);
const loading = ref(false);
const installingId = ref("");
const autoPauseName = ref("");
const previewingId = ref("");
type SkillUpdatePreview = { currentVersion: string; targetVersion: string; updateAvailable: boolean; cleanFromCatalog: boolean; localModified: { path: string }[]; changes: { path: string; status: "added" | "changed" | "deleted" }[] };
const updatePreviews = ref<Record<string, SkillUpdatePreview>>({});
const lifecycleAction = ref("");
const errorMessage = ref("");
const searchQuery = ref("");
const selectedStage = ref("all");
const stageLabels: Record<string, string> = { assetDesign: "资产设计", audioSubtitle: "音频字幕", continuity: "连续性", delivery: "交付", mediaGeneration: "媒体生成", reviewQa: "质量检查", scriptAnalysis: "剧本分析", storyboard: "分镜", workflow: "全流程" };
const stageOptions = computed(() => [
  { value: "all", label: "全部阶段" },
  ...[...new Set(packages.value.flatMap(item => item.skills.map(skill => skill.stage)).filter(Boolean))]
    .sort((left, right) => stageLabel(left).localeCompare(stageLabel(right), "zh-CN"))
    .map(stage => ({ value: stage, label: stageLabel(stage) })),
]);
const filteredPackages = computed(() => packages.value.filter(item => visibleSkills(item).length > 0));

function stageLabel(stage: string) {
  return stageLabels[stage] ?? stage;
}

function visibleSkills(item: CatalogPackage) {
  const query = searchQuery.value.toLocaleLowerCase();
  const packageMatch = `${item.displayName} ${item.description} ${item.publisher}`.toLocaleLowerCase().includes(query);
  return item.skills.filter(skill => (selectedStage.value === "all" || skill.stage === selectedStage.value)
    && (!query || packageMatch || `${skill.name} ${skill.displayName} ${skill.description}`.toLocaleLowerCase().includes(query)));
}

function errorText(error: unknown) {
  return axios.isAxiosError(error) ? error.response?.data?.message || "连接中断，请刷新后确认结果" : error instanceof Error ? error.message : "操作失败，请重试";
}

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    const { data } = await authClient.get<ApiResponse<{ packages: CatalogPackage[] }>>("/api/skills/catalog/get", { params: { scope: props.scope } });
    if (data.code !== 200) throw new Error(data.message || "读取技能目录失败");
    packages.value = data.data.packages;
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    loading.value = false;
  }
}

async function installPackage(item: CatalogPackage) {
  if (item.installedCount || installingId.value) return;
  try {
    const installTarget = props.scope === "account" ? "当前账户" : "全局目录";
    await feedback.confirm(
      `安装「${item.displayName}」v${item.version}到${installTarget}？共包含 ${item.skills.length} 个 Skill。来源：${item.publisher}；许可证：${item.license}。安装不会执行包内脚本，也不会开启或授予工具权限。`,
      "安装精选技能包",
      { confirmButtonText: "安装", cancelButtonText: "取消" },
    );
    installingId.value = item.packageId;
    errorMessage.value = "";
    const installPath = props.scope === "account" ? "/api/skills/catalog/installAccount" : "/api/skills/catalog/install";
    const { data } = await authClient.post<ApiResponse<{ packageId: string; names: string[] }>>(installPath, { packageId: item.packageId });
    if (data.code !== 200) throw new Error(data.message || "安装技能包失败");
    feedback.message({ tone: "success", message: `已安装 ${data.data.names.length} 个技能` });
    await load();
    emit("installed");
  } catch (error) {
    if (!isUiCancelledError(error)) errorMessage.value = errorText(error);
  } finally {
    installingId.value = "";
  }
}

async function setAutoPaused(item: CatalogPackage, skill: CatalogPackage["skills"][number], paused: boolean) {
  if (autoPauseName.value) return;
  autoPauseName.value = skill.name;
  errorMessage.value = "";
  try {
    const { data } = await authClient.post<ApiResponse<{ name: string; paused: boolean }>>("/api/skills/catalog/autoPauseAccount", {
      packageId: item.packageId, name: skill.name, paused,
    });
    if (data.code !== 200) throw new Error(data.message || "更新自动推荐设置失败");
    skill.autoPaused = paused;
    feedback.message({ tone: "success", message: paused ? `已暂停「${skill.displayName}」的自动推荐` : `已恢复「${skill.displayName}」的自动推荐` });
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    autoPauseName.value = "";
  }
}

async function previewUpdate(item: CatalogPackage) {
  if (previewingId.value) return;
  previewingId.value = item.packageId;
  errorMessage.value = "";
  try {
    const { data } = await authClient.post<ApiResponse<SkillUpdatePreview>>("/api/skills/catalog/updatePreview", {
      packageId: item.packageId, version: item.version,
    });
    if (data.code !== 200) throw new Error(data.message || "读取更新差异失败");
    updatePreviews.value = { ...updatePreviews.value, [item.packageId]: data.data };
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    previewingId.value = "";
  }
}

function updatePreviewLabel(preview: SkillUpdatePreview) {
  const counts = { added: 0, changed: 0, deleted: 0 };
  for (const change of preview.changes) counts[change.status]++;
  const summary = `v${preview.currentVersion} → v${preview.targetVersion}：新增 ${counts.added}、修改 ${counts.changed}、删除 ${counts.deleted} 个文件。`;
  return preview.localModified.length
    ? `${summary}检测到 ${preview.localModified.length} 个本地修改，升级前需要保留或处理这些内容。`
    : `${summary}${preview.updateAvailable && preview.cleanFromCatalog ? "可以安全升级。" : "没有可升级版本。"}`;
}

async function updatePackage(item: CatalogPackage, preview: SkillUpdatePreview) {
  if (!preview.updateAvailable || !preview.cleanFromCatalog || lifecycleAction.value) return;
  try {
    await feedback.confirm(
      `升级「${item.displayName}」：v${preview.currentVersion} → v${preview.targetVersion}。将新增 ${preview.changes.filter(change => change.status === "added").length} 个文件，修改 ${preview.changes.filter(change => change.status === "changed").length} 个，删除 ${preview.changes.filter(change => change.status === "deleted").length} 个。升级前会保存当前个人备份。`,
      "升级个人技能包",
      { confirmButtonText: "备份并升级", cancelButtonText: "取消" },
    );
  } catch (error) {
    if (!isUiCancelledError(error)) errorMessage.value = errorText(error);
    return;
  }
  lifecycleAction.value = `update:${item.packageId}`;
  errorMessage.value = "";
  try {
    const { data } = await authClient.post<ApiResponse<{ backupId: string; version: string }>>("/api/skills/catalog/updateAccount", {
      packageId: item.packageId, version: preview.targetVersion,
    });
    if (data.code !== 200) throw new Error(data.message || "升级技能包失败");
    feedback.message({ tone: "success", message: `已升级到 v${data.data.version}，旧版已备份` });
    updatePreviews.value = {};
    await load();
    emit("installed");
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally { lifecycleAction.value = ""; }
}

async function uninstallPackage(item: CatalogPackage) {
  if (lifecycleAction.value) return;
  try {
    await feedback.confirm(`卸载「${item.displayName}」v${item.installedVersion ?? "未知"}？完整技能文件会先存入个人备份，可之后恢复。包含本地修改的技能将拒绝卸载。`, "卸载个人技能包", { confirmButtonText: "卸载并备份", cancelButtonText: "取消" });
    lifecycleAction.value = `uninstall:${item.packageId}`;
    const { data } = await authClient.post<ApiResponse<{ backupId: string }>>("/api/skills/catalog/uninstallAccount", { packageId: item.packageId });
    if (data.code !== 200) throw new Error(data.message || "卸载技能包失败");
    feedback.message({ tone: "success", message: "个人技能包已卸载，备份可恢复" });
    updatePreviews.value = {};
    await load();
    emit("installed");
  } catch (error) {
    if (!isUiCancelledError(error)) errorMessage.value = errorText(error);
  } finally { lifecycleAction.value = ""; }
}

async function restoreBackup(item: CatalogPackage, backup: CatalogPackage["backups"][number]) {
  if (lifecycleAction.value) return;
  try {
    await feedback.confirm(`从个人备份恢复「${item.displayName}」v${backup.version}？当前干净的官方版本会自动备份；含本地修改时将拒绝覆盖。`, "恢复技能包", { confirmButtonText: "恢复备份", cancelButtonText: "取消" });
    lifecycleAction.value = `restore:${backup.id}`;
    const { data } = await authClient.post<ApiResponse<unknown>>("/api/skills/catalog/restoreAccount", { packageId: item.packageId, backupId: backup.id });
    if (data.code !== 200) throw new Error(data.message || "恢复技能包失败");
    feedback.message({ tone: "success", message: `已恢复到 v${backup.version}` });
    updatePreviews.value = {};
    await load();
    emit("installed");
  } catch (error) {
    if (!isUiCancelledError(error)) errorMessage.value = errorText(error);
  } finally { lifecycleAction.value = ""; }
}

onMounted(load);
</script>

<style lang="scss" scoped>
.skillMarket {
  display: grid;
  gap: 16px;

  .marketHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    h3 { margin: 0 0 4px; font-size: 15px; }
    p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.6; }
  }

  .marketFilters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(150px, 220px); gap: 8px; }

  .marketError, .marketStatus { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.6; }
  .marketError { color: var(--uiStatusError); }

  .packageList { display: grid; gap: 12px; }

  .packageItem {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--uiBorderDefault);
    border-radius: 6px;
    background: var(--uiSurfaceRaised);
  }

  .packageHeader {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    h4 { margin: 0 0 4px; font-size: 14px; }
    p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.6; }
  }

  .packageFacts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 22px;
    margin: 0;

    div { display: flex; gap: 6px; font-size: 12px; }
    dt { color: var(--uiTextMuted); }
    dd { margin: 0; color: var(--uiTextPrimary); }
  }

  .compatibility { margin: 0; font-size: 12px; line-height: 1.6; }
  .updatePreview { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; min-width: 0; .previewResult { flex: 1 1 260px; min-width: 0; margin: 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; } }
  .fileDiffDetails { flex: 1 0 100%; min-width: 0; color: var(--uiTextMuted); font-size: 12px; summary { width: fit-content; cursor: pointer; } ul { display: grid; gap: 4px; max-height: 180px; overflow: auto; margin: 8px 0 0; padding-left: 18px; } li { display: flex; flex-wrap: wrap; gap: 6px; } code { overflow-wrap: anywhere; } .localChangesTitle { margin: 10px 0 0; color: var(--uiStatusWarning); } }
  .personalActions { display: flex; flex-wrap: wrap; gap: 8px; }
  .backupDetails { display: grid; gap: 6px; summary { width: fit-content; cursor: pointer; } .backupRow { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--uiTextMuted); font-size: 12px; } }
  .packageNotice { margin: 0; color: var(--uiStatusWarning); font-size: 12px; line-height: 1.6; }
  .packageDetails { color: var(--uiTextMuted); font-size: 12px; }
  .packageDetails summary { width: fit-content; cursor: pointer; }
  .skillNames, .limitations, .examples { display: grid; gap: 8px; margin: 8px 0 0; padding-left: 18px; line-height: 1.55; }
  .skillNames li, .examples li { display: grid; gap: 3px; }
  .skillNames span, .examples span, .detailLabel { color: var(--uiTextMuted); }
  .skillNames code { width: fit-content; }
  .detailLabel { margin: 12px 0 0; }
  .limitations { color: var(--uiTextMuted); }

  .packageActions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 4px;
  }

  .sourceLinks { display: flex; flex-wrap: wrap; gap: 14px; }
  a { color: var(--uiActionPrimary); font-size: 12px; text-decoration: underline; text-underline-offset: 2px; }
  a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }
}

@media (max-width: 640px) {
  .skillMarket .packageHeader, .skillMarket .packageActions { align-items: flex-start; flex-direction: column; }
  .skillMarket .marketFilters { grid-template-columns: minmax(0, 1fr); }
}
</style>

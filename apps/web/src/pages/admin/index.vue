<template>
  <accountShell class="adminPage" title="平台管理" eyebrow="root" description="管理平台 API、模型与个人积分账户。">
    <template #actions><uiButton variant="secondary" :loading="loading" @click="loadAll">刷新平台数据</uiButton><uiButton tag="a" href="#/teams" variant="ghost">查看团队空间</uiButton></template>
    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
    <uiTabs :modelValue="activeTab" :options="tabs" label="平台管理" @update:modelValue="value => typeof value === 'string' && (activeTab = value)">
      <section v-if="activeTab === 'users'" class="adminSection"><header class="sectionHeader"><div><h2>用户与个人积分</h2><p>只有 root 拥有平台管理权限，团队 owner 不具备平台管理权限。</p></div><div class="sectionActions"><uiSelect :modelValue="workspaceFilter" :options="workspaceOptions" aria-label="按工作区筛选" @update:modelValue="updateWorkspaceFilter" /></div></header><uiTable :rows="filteredUsers" :columns="userColumns" :loading="loading" emptyText="还没有用户" label="平台用户"><template #cell="{ row, column }"><span v-if="column.key === 'role'" class="roleLabel">{{ row.isRoot ? 'root' : '用户' }}</span><span v-else-if="column.key === 'workspace'" class="workspaceNames">{{ userWorkspaceLabel(row as AdminUser) }}</span><uiTag v-else-if="column.key === 'status'" :tone="row.status === 'active' ? 'success' : 'error'">{{ row.status === 'active' ? '正常' : '已停用' }}</uiTag><span v-else-if="column.key === 'available' || column.key === 'frozen'">{{ formatCredits(String(row[column.key])) }}</span><div v-else-if="column.key === 'actions'" class="rowActions"><uiButton size="small" variant="ghost" :disabled="busy" @click="openCredits(row as AdminUser)">调整积分</uiButton><uiButton size="small" variant="ghost" :disabled="busy" @click="showProjects(row as AdminUser)">查看项目</uiButton><uiButton size="small" variant="ghost" :disabled="busy" @click="openPassword(row as AdminUser)">重置密码</uiButton><uiButton v-if="!row.isRoot" size="small" :variant="row.status === 'active' ? 'danger' : 'secondary'" :disabled="busy" @click="toggleUser(row as AdminUser)">{{ row.status === 'active' ? '停用' : '恢复' }}</uiButton></div><span v-else>{{ row[column.key] }}</span></template></uiTable></section>
      <section v-else-if="activeTab === 'api'" class="adminSection">
        <header class="sectionHeader"><div><h2>API 提供方</h2><p>凭据仅显示配置状态，留空不会覆盖已保存的凭据。</p></div><div class="sectionActions"><uiButton variant="secondary" :disabled="busy" @click="initializeCatalog">添加内置模型目录</uiButton><uiButton :disabled="busy" @click="editProvider()">添加 API</uiButton></div></header>
        <uiTable :rows="configuration?.providers ?? []" :columns="providerColumns" :loading="loading" emptyText="还没有配置 API" label="平台 API"><template #cell="{ row, column }"><span v-if="column.key === 'apiUrl'">{{ (row.config as PlatformProvider['config']).apiUrl }}</span><span v-else-if="column.key === 'credential'" class="credentialBadge" :title="providerCredential(row)">{{ providerCredential(row) }}</span><uiTag v-else-if="column.key === 'enabled'" :tone="row.enabled ? 'success' : 'error'">{{ row.enabled ? '已启用' : '已停用' }}</uiTag><div v-else-if="column.key === 'actions'" class="actionGroup"><uiButton size="small" variant="secondary" :disabled="busy" @click="editProvider(row as PlatformProvider)">配置 API</uiButton><uiButton size="small" variant="danger" :disabled="busy" @click="deleteProvider(row as PlatformProvider)">删除</uiButton></div><span v-else>{{ row[column.key] }}</span></template></uiTable>
        <div class="defaultModelsCard">
          <header class="sectionHeader defaultModelsHeader">
            <div>
              <h2>默认模型配置</h2>
              <p>配置全平台文本对话与创作、图片生成、视频生成的默认首选模型。</p>
            </div>
            <div class="sectionActions">
              <uiButton variant="secondary" :disabled="busy" :loading="busy" @click="submitDefaultModels">保存默认模型</uiButton>
            </div>
          </header>
          <div class="defaultModelsGrid">
            <uiField label="默认文本模型">
              <template #default="{ id }">
                <uiSelect :id="id" :modelValue="defaultTextModel" :options="defaultTextModelOptions" :disabled="busy" @update:modelValue="value => typeof value === 'string' && (defaultTextModel = value)" />
              </template>
            </uiField>
            <uiField label="默认图片模型">
              <template #default="{ id }">
                <uiSelect :id="id" :modelValue="defaultImageModel" :options="defaultImageModelOptions" :disabled="busy" @update:modelValue="value => typeof value === 'string' && (defaultImageModel = value)" />
              </template>
            </uiField>
            <uiField label="默认视频模型">
              <template #default="{ id }">
                <uiSelect :id="id" :modelValue="defaultVideoModel" :options="defaultVideoModelOptions" :disabled="busy" @update:modelValue="value => typeof value === 'string' && (defaultVideoModel = value)" />
              </template>
            </uiField>
          </div>
        </div>
        <header class="sectionHeader modelHeader"><div><h2>平台模型</h2><p>用户只能使用平台启用的模型。</p></div><div class="sectionActions"><uiRadioGroup :modelValue="modelFilter" :options="modelFilterOptions" variant="segmented" aria-label="模型类型筛选" @update:modelValue="updateModelFilter" /><uiButton :disabled="busy || !configuration?.providers.length" @click="editModel()">添加模型</uiButton></div></header>
        <uiTable :rows="filteredModels" :columns="modelColumns" :emptyText="modelFilter === 'all' ? '先配置 API，再添加模型' : '当前类型没有模型'" label="平台模型"><template #cell="{ row, column }"><span v-if="column.key === 'mediaType'">{{ mediaLabels[String(row.mediaType)] }}</span><uiTag v-else-if="column.key === 'enabled'" :tone="row.enabled ? 'success' : 'error'">{{ row.enabled ? '已启用' : '已停用' }}</uiTag><div v-else-if="column.key === 'actions'" class="actionGroup"><uiButton size="small" variant="secondary" :disabled="busy" @click="editModel(row as PlatformModel)">编辑模型</uiButton><uiButton size="small" variant="danger" :disabled="busy" @click="deleteModel(row as PlatformModel)">删除</uiButton></div><span v-else>{{ row[column.key] ?? '—' }}</span></template></uiTable>
      </section>
      <section v-else-if="activeTab === 'prices'" class="adminSection">
        <header class="sectionHeader"><div><h2>积分价格</h2><p>{{ configuration?.priceVersion ? `当前价格版本：${configuration.priceVersion}` : '尚未发布价格。配置后，用户才能使用收费模型。' }}</p></div><div class="sectionActions"><uiRadioGroup :modelValue="priceFilter" :options="modelFilterOptions" variant="segmented" aria-label="积分价格类型筛选" @update:modelValue="updatePriceFilter" /><uiButton :disabled="busy || !priceRows.length || missingPrices" :loading="busy" @click="publishPrices">发布新价格</uiButton></div></header>
        <p class="sectionHint">新任务使用新价格，已开始的任务保持原价格。文本按各类实际 token 与配置费率结算，视频可按分辨率配置积分，1 元＝10 积分。</p>
        <component v-for="group in priceGroups" :is="group.key === 'disabled' ? 'details' : 'div'" :key="group.key" class="priceGroup" :class="{ disabledPrices: group.key === 'disabled' }">
          <summary v-if="group.key === 'disabled'"><uiTag tone="error">已停用模型（{{ group.rows.length }}）</uiTag></summary>
          <uiTable class="priceTable" :rows="group.rows" :columns="priceColumns" rowKey="priceKey" :emptyText="priceFilter === 'all' ? '暂无已启用的模型' : '当前类型没有已启用的模型'" :label="group.key === 'disabled' ? '已停用模型积分价格' : '模型积分价格'">
            <template #cell="{ row, column }">
              <span v-if="column.key === 'mediaType'">{{ mediaLabels[String(row.mediaType)] }}</span>
              <span v-else-if="column.key === 'unit'">{{ priceUnit(row) }}</span>
              <div v-else-if="column.key === 'configDetails'" class="configDetails">
                <uiButton v-if="row.mediaType === 'text'" size="small" variant="ghost" :disabled="busy" @click="openPriceConfig(row as PriceRow, true)">查看配置</uiButton>
                <span v-else class="priceSummary">{{ priceSummary(row as PriceRow) }}</span>
              </div>
              <div v-else-if="column.key === 'creditsPerUnit'" class="priceEditor">
                <uiButton v-if="row.mediaType === 'text' || row.mediaType === 'image' || row.mediaType === 'video'" size="small" variant="secondary" :disabled="busy" @click="openPriceConfig(row as PriceRow)">修改配置</uiButton>
              </div>
              <span v-else>{{ row[column.key] }}</span>
            </template>
          </uiTable>
        </component>
        <p v-if="missingPrices" class="sectionHint">请为所有已启用模型填写完整有效的价格。</p>
      </section>
      <extensionPanel v-else-if="activeTab === 'extensions'" /><section v-else class="adminSection"><header class="sectionHeader"><h2>管理审计</h2><p>最近 200 条平台操作记录。</p></header><uiTable :rows="audit" :columns="auditColumns" emptyText="还没有操作记录" label="平台审计"><template #cell="{ row, column }"><span v-if="column.key === 'actorUserId'">{{ userName(String(row.actorUserId)) }}</span><span v-else-if="column.key === 'createdAt'">{{ new Date(String(row.createdAt)).toLocaleString('zh-CN', { hour12: false }) }}</span><span v-else-if="column.key === 'metadata'" class="auditDetails">{{ auditText(row.metadata) }}</span><span v-else>{{ auditLabels[String(row.action)] ?? row.action }}</span></template></uiTable></section>
    </uiTabs>
    <uiDialog v-model="creditsVisible" :title="`调整 ${selectedUser?.displayName ?? ''} 的积分`" :width="500" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="adjustCredits"><p class="sectionHint">可用 {{ formatCredits(selectedUser?.available) }} · 冻结 {{ formatCredits(selectedUser?.frozen) }}。正数增加，负数扣回，不允许扣回冻结积分。</p><uiField label="积分变更" required><template #default="{ id }"><uiNumberInput :id="id" v-model="creditAmount" :min="-1000000000" :max="1000000000" :step="1" :precision="0" :disabled="busy" /></template></uiField><uiField label="调整原因" required><template #default="{ id }"><uiInput :id="id" v-model.trim="creditReason" maxlength="500" required :disabled="busy" /></template></uiField><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :disabled="busy || !creditAmount || !creditReason" :loading="busy">确认调整积分</uiButton></form></uiDialog>
    <uiDialog v-model="passwordVisible" :title="`重置 ${selectedUser?.displayName ?? ''} 的密码`" :width="480" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="resetPassword"><p class="sectionHint">重置后该账户的所有会话和服务凭证将被撤销。</p><uiField label="新密码" required><template #default="{ id }"><uiInput :id="id" v-model="newPassword" type="password" minlength="12" maxlength="200" autocomplete="new-password" showPassword required :disabled="busy" /></template></uiField><uiField label="确认新密码" required><template #default="{ id }"><uiInput :id="id" v-model="passwordConfirmation" type="password" autocomplete="new-password" showPassword required :disabled="busy" /></template></uiField><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :loading="busy" :disabled="busy || !newPassword">重置密码</uiButton></form></uiDialog>
    <uiDialog v-model="projectsVisible" :title="`${selectedUser?.displayName ?? ''} 的个人项目`" :width="680"><p v-if="projectsLoading" class="sectionHint">正在读取项目…</p><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><div class="projectList"><uiButton v-for="project in projects" :key="project.directory" variant="secondary" :disabled="busy" @click="openProject(project)"><span>{{ project.name }}</span><icon-arrow-up-right :size="16" aria-hidden="true" /></uiButton><p v-if="!projects.length && !projectsLoading" class="sectionHint">这个账户还没有项目。</p></div></uiDialog>
    <uiDialog v-model="providerVisible" title="配置平台 API" :width="600" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="submitProvider"><uiField label="提供方标识" required><template #default="{ id }"><uiInput :id="id" v-model.trim="providerId" required :readonly="providerEditing" :disabled="busy" placeholder="如 myProvider" /></template></uiField><uiField label="API 地址" required><template #default="{ id }"><uiInput :id="id" v-model.trim="apiUrl" type="url" required :disabled="busy" /></template></uiField><uiField label="文本接口协议"><uiRadioGroup v-model="protocol" :options="protocolOptions" variant="segmented" /></uiField><uiField label="API 凭据" :help="currentMaskedApiKey ? `已保存凭据：${currentMaskedApiKey}（留空保留原凭据）` : undefined"><template #default="{ id }"><uiInput :id="id" v-model="apiKey" type="password" autocomplete="off" showPassword :disabled="busy || removeApiKey" :placeholder="currentMaskedApiKey ? `已配置：${currentMaskedApiKey}，留空保留原凭据` : (credentialConfigured ? '已配置，留空保留原凭据' : '填写此 API 的访问凭据')" /></template></uiField><uiCheckbox v-if="credentialConfigured" v-model="removeApiKey" :disabled="busy">移除已保存的凭据</uiCheckbox><uiCheckbox v-model="providerEnabled" :disabled="busy">启用此 API</uiCheckbox><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :loading="busy" :disabled="busy || !providerId || !apiUrl">保存 API 配置</uiButton></form></uiDialog>
    <uiDialog v-model="modelVisible" title="配置平台模型" :width="640" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="submitModel"><uiField label="API 提供方" required><template #default="{ id }"><uiSelect :id="id" :modelValue="modelProviderId" :options="providerOptions" :disabled="busy || !!editingModelId" @update:modelValue="value => typeof value === 'string' && (modelProviderId = value)" /></template></uiField><uiField label="类型"><uiRadioGroup v-model="mediaType" :options="mediaOptions" variant="segmented" :disabled="!!editingModelId" /></uiField><uiField label="平台模型标识" required><template #default="{ id }"><uiInput v-if="mediaType === 'text'" :id="id" v-model.trim="modelId" required :readonly="!!editingModelId" :disabled="busy" /><uiSelect v-else :id="id" :modelValue="modelId" :options="mediaModelOptions" :disabled="busy || !!editingModelId" placeholder="选择适配器支持的模型" @update:modelValue="value => typeof value === 'string' && (modelId = value)" /></template></uiField><uiField label="显示名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="modelLabel" required :disabled="busy" /></template></uiField><uiField v-if="mediaType === 'text'" label="上游模型标识"><template #default="{ id }"><uiInput :id="id" v-model.trim="apiModelId" :disabled="busy" placeholder="留空使用平台模型标识" /></template></uiField><uiField label="排序"><uiNumberInput v-model="sortOrder" :min="-100000" :max="100000" :step="1" :precision="0" :disabled="busy" /></uiField><uiCheckbox v-model="modelEnabled" :disabled="busy">启用此模型</uiCheckbox><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :disabled="busy || !modelProviderId || !modelId || !modelLabel" :loading="busy">保存模型配置</uiButton></form></uiDialog>
    <uiDialog v-model="priceConfigVisible" :title="`${priceConfigModel?.label ?? ''} 的价格配置`" :width="620" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="savePriceConfig"><template v-if="priceConfigType === 'text'"><p class="sectionHint">费率单位：积分／百万 token，支持最多 6 位小数。缓存项留空表示不适用，0 表示免费。</p><div class="rateFields"><uiField v-for="field in tokenRateFields" :key="field.key" class="rateField" :label="field.label" :required="!priceConfigReadOnly && (field.key === 'input' || field.key === 'output')"><template #default="{ id }"><uiInput :id="id" :modelValue="textPriceDraft[priceConfigKey]?.[field.key] ?? ''" inputmode="decimal" maxlength="32" :disabled="busy || priceConfigReadOnly" @update:modelValue="value => setTextPriceField(priceConfigKey, field.key, value)" /></template></uiField></div><p class="sectionHint" aria-live="polite">例（按历史用量比例）：{{ textExampleUsageLabel }}，总计：10,000,000 token。<br />实际消耗积分：<strong>{{ textExampleCredits(priceConfigKey) }}</strong>。</p><p v-if="!priceConfigReadOnly && !textPricingInput(priceConfigKey)" class="sectionHint">请输入有效积分费率（0～10 亿，最多 6 位小数）。</p></template><template v-else><p class="sectionHint">{{ priceConfigType === 'image' ? '可按图片尺寸设置每张积分；保存后最高档会同步为基础价格。' : '可按视频分辨率设置每秒积分；保存后最高档会同步为未知分辨率的兜底价格。' }}</p><div class="tierList"><div class="tierHeader"><span>{{ priceConfigType === 'image' ? '尺寸' : '分辨率' }}</span><span>价格</span><span aria-hidden="true"></span></div><div v-for="(tier, index) in tierDraft" :key="index" class="tierRow"><uiInput v-model.trim="tier.resolution" :placeholder="priceConfigType === 'image' ? '如 1K、2K、4K' : '如 768P、1080P'" :disabled="busy" :aria-label="`第 ${index + 1} 个${priceConfigType === 'image' ? '尺寸' : '分辨率'}`" /><uiNumberInput v-model="tier.credits" :min="1" :max="1000000000" :step="1" :precision="0" :disabled="busy" :aria-label="`${tier.resolution || (priceConfigType === 'image' ? '尺寸' : '分辨率')} ${priceConfigType === 'image' ? '每张' : '每秒'}积分`" /><uiButton htmlType="button" size="small" variant="danger" :disabled="busy" @click="removeTier(index)">删除</uiButton></div><div class="tierActions"><uiButton htmlType="button" variant="secondary" :disabled="busy" @click="addTier">新增{{ priceConfigType === 'image' ? '尺寸' : '分辨率' }}</uiButton><uiButton htmlType="submit" :disabled="busy" :loading="busy">保存价格配置</uiButton></div></div></template><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton v-if="priceConfigType === 'text' && !priceConfigReadOnly" htmlType="submit" :disabled="busy" :loading="busy">保存价格配置</uiButton></form></uiDialog>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { uiTag, uiButton, uiTabs, uiTable, uiDialog, uiField, uiInput, uiNumberInput, uiSelect, uiRadioGroup, uiCheckbox, useUiFeedback, isUiCancelledError, type UiColumn } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import extensionPanel from "./extensionPanel.vue";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";
import { getAdminUsers, saveAdminUser, resetAdminPassword, adjustUserCredits, getAdminProjects, getPlatformConfiguration, initializePlatformCatalog, savePlatformProvider, deletePlatformProvider, savePlatformModel, deletePlatformModel, publishPlatformPrices, getPlatformAudit, savePlatformDefaultModels, type AdminUser, type PlatformConfiguration, type PlatformProvider, type PlatformModel, type AuditEntry, type TextPricingInput, type TokenRates, type PlatformPriceInput, type PriceConstraints, type PlatformDefaultModels } from "@/lib/accountApi";
import { creditMicros, formatCredits } from "@/lib/creditFormat";
import { usePlatformModelsStore } from "@/stores/platformModels";
import { invalidateNodeModels } from "@omnistudio-next/nodes-scaffold/nodeAi";
const auth = useAuthStore(); const workspace = useWorkspaceStore(); const router = useRouter(); const feedback = useUiFeedback();
const users = ref<AdminUser[]>([]); const configuration = ref<PlatformConfiguration>(); const audit = ref<AuditEntry[]>([]); const loading = ref(false); const busy = ref(false); const errorMessage = ref(""); const dialogError = ref("");
const activeTab = ref("users"); const tabs = [{ value: "users", label: "用户与积分" }, { value: "api", label: "API 与模型" }, { value: "prices", label: "积分价格" }, { value: "extensions", label: "平台扩展" }, { value: "audit", label: "管理审计" }];
const selectedUser = ref<AdminUser>(); const creditsVisible = ref(false); const passwordVisible = ref(false); const projectsVisible = ref(false); const projectsLoading = ref(false); const projects = ref<{ name: string; directory: string }[]>([]); const creditAmount = ref<number | null>(null); const creditReason = ref(""); let creditKey = crypto.randomUUID(); const newPassword = ref(""); const passwordConfirmation = ref("");
const providerVisible = ref(false); const providerId = ref(""); const providerEditing = ref(false); const apiUrl = ref(""); const apiKey = ref(""); const currentMaskedApiKey = ref(""); const credentialConfigured = ref(false); const removeApiKey = ref(false); const providerEnabled = ref(true); const protocol = ref<PlatformProvider["config"]["protocol"]>("openai-completions");
const protocolOptions = [{ value: "openai-completions", label: "OpenAI Chat" }, { value: "openai-responses", label: "OpenAI Responses" }, { value: "anthropic-messages", label: "Anthropic" }];
const modelVisible = ref(false); const editingModelId = ref(""); const modelProviderId = ref(""); const modelId = ref(""); const modelLabel = ref(""); const apiModelId = ref(""); const modelEnabled = ref(true); const mediaType = ref<PlatformModel["mediaType"]>("text"); const sortOrder = ref<number | null>(0); const modelCapabilities = ref<Record<string, unknown> | undefined>();
const mediaOptions = [{ value: "text", label: "文本" }, { value: "image", label: "图片" }, { value: "video", label: "视频" }]; const mediaLabels: Record<string, string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };
type ModelFilter = "all" | Exclude<PlatformModel["mediaType"], "audio">;
const modelFilter = ref<ModelFilter>("all"); const priceFilter = ref<ModelFilter>("all"); const modelFilterOptions = [{ value: "all", label: "全部" }, ...mediaOptions];
const providerOptions = computed(() => configuration.value?.providers.map(provider => ({ value: provider.providerId, label: provider.providerId })) ?? []);
const mediaModelOptions = computed(() => configuration.value?.mediaProviders.find(provider => provider.id === modelProviderId.value)?.models.filter(model => model.type === mediaType.value).map(model => ({ value: model.id, label: model.label ?? model.id })) ?? []);
const defaultTextModel = ref("");
const defaultImageModel = ref("");
const defaultVideoModel = ref("");
function buildDefaultModelOptions(type: "text" | "image" | "video", selectedVal: string) {
  const models = (configuration.value?.models ?? []).filter(m => m.mediaType === type && m.enabled);
  const options = [
    { value: "", label: "未指定（默认使用列表首项）" },
    ...models.map(m => ({
      value: JSON.stringify([m.providerId, m.modelId]),
      label: `${m.label}（${m.providerId}）`,
    })),
  ];
  if (selectedVal && !options.some(opt => opt.value === selectedVal)) {
    try {
      const [providerId, modelId] = JSON.parse(selectedVal);
      options.push({ value: selectedVal, label: `${modelId}（${providerId} - 已停用或缺失）` });
    } catch {}
  }
  return options;
}
const defaultTextModelOptions = computed(() => buildDefaultModelOptions("text", defaultTextModel.value));
const defaultImageModelOptions = computed(() => buildDefaultModelOptions("image", defaultImageModel.value));
const defaultVideoModelOptions = computed(() => buildDefaultModelOptions("video", defaultVideoModel.value));
function parseModelChoice(value: string): { providerId: string; modelId: string } | null {
  if (!value) return null;
  try {
    const [providerId, modelId] = JSON.parse(value);
    if (typeof providerId === "string" && typeof modelId === "string") return { providerId, modelId };
  } catch {}
  return null;
}
async function submitDefaultModels() {
  busy.value = true;
  errorMessage.value = "";
  try {
    const input: PlatformDefaultModels = {
      text: parseModelChoice(defaultTextModel.value),
      image: parseModelChoice(defaultImageModel.value),
      video: parseModelChoice(defaultVideoModel.value),
    };
    await savePlatformDefaultModels(input);
    await loadAll();
    await refreshModels();
    feedback.message({ tone: "success", message: "默认模型配置已保存" });
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    busy.value = false;
  }
}
const priceDraft = ref<Record<string, number | null>>({});
type TextPriceDraft = { input: string; cacheRead: string; cacheWrite: string; output: string };
const textPriceDraft = ref<Record<string, TextPriceDraft>>({});
type PriceRow = PlatformModel & { priceKey: string };
type ResolutionTierDraft = { resolution: string; credits: number | null };
const tierDrafts = ref<Record<string, ResolutionTierDraft[]>>({});
const priceConfigVisible = ref(false);
const priceConfigModel = ref<PriceRow>();
const priceConfigReadOnly = ref(false);
const priceConfigKey = computed(() => priceConfigModel.value?.priceKey ?? "");
const priceConfigType = computed(() => priceConfigModel.value?.mediaType);
const tierDraft = ref<ResolutionTierDraft[]>([]);
const tokenRateFields: { key: keyof TokenRates; label: string }[] = [{ key: "input", label: "非缓存输入" }, { key: "cacheRead", label: "缓存读取" }, { key: "cacheWrite", label: "缓存写入" }, { key: "output", label: "输出" }];
// 136笔历史usage按占比缩放，并按最大余数分配为整数，总计1000万token。
const textExampleUsage = { input: 1_606_244, cacheRead: 8_350_337, cacheWrite: 0, output: 43_419 };
const textExampleUsageLabel = tokenRateFields.map(({ key, label }) => `${label}：${textExampleUsage[key].toLocaleString("en-US")}`).join("，");
function priceKey(model: { providerId: string; mediaType: string; modelId: string }) { return JSON.stringify([model.providerId, model.mediaType, model.modelId]); }
const priceRows = computed<PriceRow[]>(() => configuration.value?.models.map(model => ({ ...model, priceKey: priceKey(model) })) ?? []);
const priceGroups = computed(() => {
  const rows = priceRows.value.filter(model => priceFilter.value === "all" || model.mediaType === priceFilter.value);
  return [{ key: "enabled", rows: rows.filter(model => model.enabled) }, { key: "disabled", rows: rows.filter(model => !model.enabled) }].filter(group => group.key === "enabled" || group.rows.length);
});
const filteredModels = computed(() => { const models = configuration.value?.models ?? []; return modelFilter.value === "all" ? models : models.filter(model => model.mediaType === modelFilter.value); });
const missingPrices = computed(() => priceRows.value.some(model => model.enabled && (model.mediaType === "text" ? !textPricingInput(model.priceKey) : priceDraft.value[model.priceKey] == null)));
type WorkspaceFilter = "all" | "none" | string;
const workspaceFilter = ref<WorkspaceFilter>("all");
function userWorkspaces(user: AdminUser) { return user.workspaces ?? []; }
function userWorkspaceLabel(user: AdminUser) { return userWorkspaces(user).map(workspace => `${workspace.name}${workspace.status === "archived" ? "（已解散）" : ""}`).join("、") || "未加入工作区"; }
const workspaceOptions = computed(() => {
  const workspaces = new Map<string, string>();
  for (const user of users.value) for (const workspace of userWorkspaces(user)) workspaces.set(workspace.id, `${workspace.name}${workspace.status === "archived" ? "（已解散）" : ""}`);
  return [{ value: "all", label: "全部工作区" }, ...[...workspaces.entries()].sort(([, left], [, right]) => left.localeCompare(right, "zh-CN")).map(([value, label]) => ({ value, label })), ...(users.value.some(user => !userWorkspaces(user).length) ? [{ value: "none", label: "未加入工作区" }] : [])];
});
const filteredUsers = computed(() => workspaceFilter.value === "all" ? users.value : users.value.filter(user => workspaceFilter.value === "none" ? !userWorkspaces(user).length : userWorkspaces(user).some(workspace => workspace.id === workspaceFilter.value)));
function updateWorkspaceFilter(value: unknown) { if (typeof value === "string") workspaceFilter.value = value; }
watch(workspaceOptions, options => { if (!options.some(option => option.value === workspaceFilter.value)) workspaceFilter.value = "all"; });
const userColumns: UiColumn[] = [{ key: "displayName", label: "用户", align: "center" }, { key: "email", label: "邮箱", align: "center" }, { key: "workspace", label: "工作区", width: 180, align: "center" }, { key: "role", label: "身份", width: 80, align: "center" }, { key: "available", label: "可用积分", width: 115, align: "center" }, { key: "frozen", label: "冻结", width: 90, align: "center" }, { key: "status", label: "状态", width: 85, align: "center" }, { key: "actions", label: "操作", width: 360, align: "center" }];
const providerColumns: UiColumn[] = [{ key: "providerId", label: "提供方", width: 150, align: "center" }, { key: "apiUrl", label: "API 地址", width: 300, align: "left" }, { key: "credential", label: "访问凭据", width: 200, align: "center" }, { key: "enabled", label: "状态", width: 95, align: "center" }, { key: "actions", label: "操作", width: 180, align: "center" }];
const modelColumns: UiColumn[] = [{ key: "label", label: "模型名称", width: 160, align: "center" }, { key: "providerId", label: "提供方", width: 140, align: "center" }, { key: "modelId", label: "模型标识", width: 240, align: "center" }, { key: "mediaType", label: "类型", width: 80, align: "center" }, { key: "enabled", label: "状态", width: 90, align: "center" }, { key: "actions", label: "操作", width: 180, align: "center" }];
const priceColumns: UiColumn[] = [{ key: "label", label: "模型", width: 170, align: "center" }, { key: "providerId", label: "提供方", width: 160, align: "center" }, { key: "mediaType", label: "类型", width: 70, align: "center" }, { key: "unit", label: "计费单位", width: 150, align: "center" }, { key: "configDetails", label: "配置详情", width: 320 }, { key: "creditsPerUnit", label: "价格配置", width: 150, align: "center" }];
const auditColumns: UiColumn[] = [{ key: "action", label: "操作", width: 180 }, { key: "actorUserId", label: "操作者", width: 150 }, { key: "metadata", label: "详情" }, { key: "createdAt", label: "时间", width: 180 }];
const auditLabels: Record<string, string> = { "account.initializeRoot": "初始化 root", "account.register": "用户注册", "account.admin.update": "更新账户", "account.password.change": "修改密码", "account.password.reset": "重置密码", "billing.credits.grant": "发放积分", "billing.credits.adjustment": "调整积分", "billing.transfer": "成员积分划转", "team.create": "创建团队", "team.invite": "邀请成员", "team.acceptInvitation": "加入团队", "team.leave": "退出团队", "team.removeMember": "移除成员", "team.asset.upload": "上传团队资产", "team.asset.remove": "删除共享副本", "team.asset.rename": "重命名资产", "team.archive": "解散团队", "team.restore": "恢复团队", "team.rename": "重命名团队", "platform.provider.save": "配置 API", "platform.provider.delete": "删除 API", "platform.model.save": "配置模型", "platform.model.delete": "删除模型", "platform.prices.publish": "发布价格", "platform.catalog.initialize": "添加内置目录", "platform.defaultModels.save": "配置默认模型" };
function errorText(error: unknown) { return axios.isAxiosError(error) ? error.response?.data?.message || "连接中断，请刷新后确认结果" : error instanceof Error ? error.message : "操作失败，请重试"; }
function userName(id: string) { return users.value.find(user => user.id === id)?.displayName ?? id; }
function providerCredential(row: unknown): string { const provider = row as PlatformProvider; return provider.maskedApiKey || (provider.apiKeyConfigured ? "已配置" : "未配置"); }
function updateModelFilter(value: unknown) { if (value === "all" || value === "text" || value === "image" || value === "video") modelFilter.value = value; }
function updatePriceFilter(value: unknown) { if (value === "all" || value === "text" || value === "image" || value === "video") priceFilter.value = value; }
function auditText(value: unknown) { if (!value || typeof value !== "object") return "—"; return Object.entries(value).filter(([key]) => key !== "items").map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : String(item)}`).join(" · "); }
function setTextPriceField(key: string, field: keyof TextPriceDraft, value: unknown) { const draft = textPriceDraft.value[key]; if (draft && typeof value === "string") draft[field] = value.trim(); }
function textPricingInput(key: string): TextPricingInput | undefined {
  const draft = textPriceDraft.value[key];
  if (!draft) return;
  const ratesPerMillion = {} as TokenRates;
  for (const { key: field } of tokenRateFields) {
    const value = draft[field];
    if (!value && (field === "cacheRead" || field === "cacheWrite")) { ratesPerMillion[field] = null; continue; }
    if (value.length > 32 || !/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value) || creditMicros(value) > 1_000_000_000_000_000n) return;
    ratesPerMillion[field] = value;
  }
  return { ratesPerMillion };
}
function textExampleCredits(key: string): string {
  const pricing = textPricingInput(key);
  if (!pricing) return "—";
  let numerator = 0n;
  for (const { key: field } of tokenRateFields) {
    const rate = pricing.ratesPerMillion[field];
    if (rate === null && textExampleUsage[field] > 0) return "—";
    if (rate !== null) numerator += BigInt(textExampleUsage[field]) * creditMicros(rate);
  }
  const amount = (numerator + 500_000n) / 1_000_000n;
  return formatCredits(`${amount / 1_000_000n}.${String(amount % 1_000_000n).padStart(6, "0")}`);
}
function priceUnit(row: Record<string, unknown>): string {
  if (row.mediaType === "video") return "每秒";
  if (row.mediaType === "image") return "每张";
  if (row.mediaType === "text") return "每百万 token";
  const price = configuration.value?.prices.find(item => priceKey(item) === String(row.priceKey));
  return price?.unit === "10k_tokens" ? "旧规则：每万 token" : "旧规则：每万字符";
}
function priceTiers(price: { constraints?: PriceConstraints }, mediaType: "image" | "video") {
  const source = mediaType === "image" ? price.constraints?.sizeTiers : price.constraints?.resolutionTiers;
  return source && typeof source === "object" ? source : {};
}
function defaultImageTiers(price: { constraints?: PriceConstraints }, basePrice: number | null | undefined) {
  const tiers = priceTiers(price, "image");
  const fallback = basePrice ?? null;
  return ["1K", "2K", "4K"].map(resolution => ({ resolution, credits: typeof tiers[resolution] === "number" ? tiers[resolution] : fallback }));
}
function priceTierSummary(row: PriceRow) {
  if (row.mediaType !== "image" && row.mediaType !== "video") return "";
  const price = configuration.value?.prices.find(item => priceKey(item) === row.priceKey);
  const tiers = tierDrafts.value[row.priceKey] ?? Object.entries(priceTiers(price ?? {}, row.mediaType)).map(([resolution, credits]) => ({ resolution, credits }));
  return tiers.length ? tiers.map(tier => `${tier.resolution}：${tier.credits == null ? "—" : `${tier.credits}积分`}`).join(" · ") : "未配置档位";
}
function priceSummary(row: PriceRow) {
  if (row.mediaType === "text") return "";
  if (row.mediaType !== "image" && row.mediaType !== "video") return `基础价格：${priceDraft.value[row.priceKey] ?? "未配置"}`;
  const summary = priceTierSummary(row);
  return summary === "未配置档位" ? `基础价格：${priceDraft.value[row.priceKey] == null ? "未配置" : `${priceDraft.value[row.priceKey]}积分`}` : summary;
}
function openPriceConfig(row: PriceRow, readOnly = false) {
  priceConfigModel.value = row;
  priceConfigReadOnly.value = readOnly;
  dialogError.value = "";
  if (row.mediaType !== "text") {
    const price = configuration.value?.prices.find(item => priceKey(item) === row.priceKey);
    const tiers = tierDrafts.value[row.priceKey] ?? (row.mediaType === "image" ? defaultImageTiers(price ?? {}, priceDraft.value[row.priceKey]) : Object.entries(priceTiers(price ?? {}, "video")).map(([resolution, credits]) => ({ resolution, credits })));
    tierDraft.value = tiers.map(tier => ({ ...tier }));
  }
  priceConfigVisible.value = true;
}
function addTier() { tierDraft.value.push({ resolution: "", credits: null }); }
function removeTier(index: number) { tierDraft.value.splice(index, 1); }
function savePriceConfig() {
  const model = priceConfigModel.value;
  if (!model) return;
  if (priceConfigReadOnly.value) { priceConfigVisible.value = false; return; }
  if (model.mediaType === "text") {
    if (!textPricingInput(model.priceKey)) { dialogError.value = "请输入有效积分费率（0～10 亿，最多 6 位小数）"; return; }
    priceConfigVisible.value = false;
    return;
  }
  const tiers = tierDraft.value.map(tier => ({ resolution: tier.resolution.trim(), credits: tier.credits }));
  const names = new Set<string>();
  if (model.mediaType === "image" && tiers.length !== 3) { dialogError.value = "图片必须配置 1K、2K、4K 三档积分"; return; }
  for (const tier of tiers) {
    const name = tier.resolution.toUpperCase();
    if (!name || name.length > 32) { dialogError.value = `${model.mediaType === "image" ? "尺寸" : "分辨率"}名称不能为空且不能超过 32 个字符`; return; }
    if (names.has(name)) { dialogError.value = `${model.mediaType === "image" ? "尺寸" : "分辨率"}名称不能重复`; return; }
    if (!Number.isSafeInteger(tier.credits) || tier.credits! <= 0) { dialogError.value = "档位积分必须是正整数"; return; }
    names.add(name);
  }
  if (model.mediaType === "image" && ["1K", "2K", "4K"].some(name => !names.has(name))) { dialogError.value = "图片必须配置 1K、2K、4K 三档积分"; return; }
  const normalizedTiers = tiers.map(tier => ({ ...tier, resolution: model.mediaType === "image" ? tier.resolution.toUpperCase() : tier.resolution }));
  tierDrafts.value[model.priceKey] = normalizedTiers;
  if (tiers.length) priceDraft.value[model.priceKey] = Math.max(...tiers.map(tier => tier.credits!));
  priceConfigVisible.value = false;
}
async function loadAll() {
  loading.value = true; errorMessage.value = "";
  try {
    const [people, platform, events] = await Promise.all([getAdminUsers(), getPlatformConfiguration(), getPlatformAudit()]);
    const prices: Record<string, number | null> = {};
    const textPrices: Record<string, TextPriceDraft> = {};
    const tiers: Record<string, ResolutionTierDraft[]> = {};
    for (const model of platform.models) {
      const key = priceKey(model);
      const price = platform.prices.find(item => priceKey(item) === key);
      prices[key] = price?.creditsPerUnit ?? null;
      if (model.mediaType !== "text") continue;
      const pricing = price?.constraints?.textPricing;
      textPrices[key] = { input: pricing?.ratesPerMillion.input ?? "", cacheRead: pricing?.ratesPerMillion.cacheRead ?? "", cacheWrite: pricing?.ratesPerMillion.cacheWrite ?? "", output: pricing?.ratesPerMillion.output ?? "" };
    }
    for (const model of platform.models) {
      if (model.mediaType !== "video" && model.mediaType !== "image") continue;
      const key = priceKey(model);
      const price = platform.prices.find(item => priceKey(item) === key);
      const entries = model.mediaType === "image" ? Object.entries(priceTiers(price ?? {}, "image")) : Object.entries(priceTiers(price ?? {}, "video"));
      if (entries.length) tiers[key] = entries.map(([resolution, credits]) => ({ resolution, credits }));
    }
    users.value = people; audit.value = events; priceDraft.value = prices; textPriceDraft.value = textPrices; tierDrafts.value = tiers; configuration.value = platform;
    const defaults = platform.defaultModels;
    defaultTextModel.value = defaults?.text ? JSON.stringify([defaults.text.providerId, defaults.text.modelId]) : "";
    defaultImageModel.value = defaults?.image ? JSON.stringify([defaults.image.providerId, defaults.image.modelId]) : "";
    defaultVideoModel.value = defaults?.video ? JSON.stringify([defaults.video.providerId, defaults.video.modelId]) : "";
  } catch (error) { errorMessage.value = errorText(error); } finally { loading.value = false; }
}
async function refreshModels() { invalidateNodeModels("language"); invalidateNodeModels("media"); await usePlatformModelsStore().load(); }
function openCredits(user: AdminUser) { selectedUser.value = user; creditAmount.value = null; creditReason.value = ""; dialogError.value = ""; creditsVisible.value = true; }
watch([creditAmount, creditReason], () => { creditKey = crypto.randomUUID(); });
async function adjustCredits() { const user = selectedUser.value; if (!user || !creditAmount.value) return; const input = { userId: user.id, amount: creditAmount.value, reason: creditReason.value, key: creditKey }; try { await feedback.confirm(`为 ${user.displayName}（${user.email}）${input.amount > 0 ? '增加' : '扣回'} ${formatCredits(Math.abs(input.amount))} 积分。原因：${input.reason}`, "确认个人积分调整", { danger: input.amount < 0, confirmButtonText: "调整积分", cancelButtonText: "取消" }); busy.value = true; await adjustUserCredits(input.userId, input.amount, input.reason, input.key); creditsVisible.value = false; await loadAll(); } catch (error) { if (!isUiCancelledError(error)) dialogError.value = errorText(error); } finally { busy.value = false; } }
function openPassword(user: AdminUser) { selectedUser.value = user; newPassword.value = ""; passwordConfirmation.value = ""; dialogError.value = ""; passwordVisible.value = true; }
async function resetPassword() { const user = selectedUser.value; if (!user) return; if (newPassword.value !== passwordConfirmation.value) { dialogError.value = "两次输入的密码不一致"; return; } try { await feedback.confirm(`重置 ${user.displayName}（${user.email}）的密码？该账户将退出所有会话，服务凭证也会停用。`, "重置账户密码", { danger: true, confirmButtonText: "重置密码", cancelButtonText: "取消" }); busy.value = true; await resetAdminPassword(user.id, newPassword.value); passwordVisible.value = false; if (user.id === auth.user?.id) { auth.clear(); location.hash = "/auth/login"; location.reload(); } else await loadAll(); } catch (error) { if (!isUiCancelledError(error)) dialogError.value = errorText(error); } finally { busy.value = false; } }
async function toggleUser(user: AdminUser) { try { await feedback.confirm(`${user.status === 'active' ? '停用' : '恢复'} ${user.displayName}（${user.email}）？${user.status === 'active' ? '该账户将立即失去访问权限，个人资产与积分仍保留。' : '该账户可重新登录，服务凭证需要重新启用。'}`, "更新账户状态", { danger: user.status === "active", confirmButtonText: user.status === "active" ? "停用账户" : "恢复账户", cancelButtonText: "取消" }); busy.value = true; await saveAdminUser(user.id, { status: user.status === "active" ? "disabled" : "active" }); await loadAll(); } catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function showProjects(user: AdminUser) { selectedUser.value = user; projects.value = []; dialogError.value = ""; projectsVisible.value = true; projectsLoading.value = true; try { projects.value = await getAdminProjects(user.id); } catch (error) { dialogError.value = errorText(error); } finally { projectsLoading.value = false; } }
async function openProject(project: { directory: string; name: string }) { busy.value = true; try { await workspace.openProject(project.directory); workspace.renameProject(project.directory, project.name); projectsVisible.value = false; await router.push("/workspace"); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
function editProvider(provider?: PlatformProvider) { dialogError.value = ""; providerEditing.value = !!provider; providerId.value = provider?.providerId ?? ""; apiUrl.value = provider?.config.apiUrl ?? ""; protocol.value = provider?.config.protocol ?? "openai-completions"; apiKey.value = ""; currentMaskedApiKey.value = provider?.maskedApiKey ?? ""; removeApiKey.value = false; credentialConfigured.value = provider?.apiKeyConfigured ?? false; providerEnabled.value = provider?.enabled ?? true; providerVisible.value = true; }
async function submitProvider() { const input = { providerId: providerId.value, apiUrl: apiUrl.value, protocol: protocol.value, enabled: providerEnabled.value, ...(removeApiKey.value ? { removeApiKey: true } : apiKey.value ? { apiKey: apiKey.value } : {}) }; try { if ("removeApiKey" in input && input.removeApiKey) await feedback.confirm(`移除 ${input.providerId} 的访问凭据？依赖此 API 的模型将无法调用。`, "移除 API 凭据", { danger: true, confirmButtonText: "移除凭据", cancelButtonText: "保留凭据" }); busy.value = true; await savePlatformProvider(input); apiKey.value = ""; currentMaskedApiKey.value = ""; providerVisible.value = false; await loadAll(); await refreshModels(); } catch (error) { if (!isUiCancelledError(error)) dialogError.value = errorText(error); } finally { busy.value = false; } }
async function deleteProvider(provider: PlatformProvider) { try { await feedback.confirm(`删除 API 提供方「${provider.providerId}」？该 API 的凭据和所属模型都会删除，历史任务与价格记录保留。`, "删除 API 提供方", { danger: true, confirmButtonText: "删除 API", cancelButtonText: "保留 API" }); busy.value = true; await deletePlatformProvider(provider.providerId); await loadAll(); await refreshModels(); } catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); } finally { busy.value = false; } }
function editModel(model?: PlatformModel) { dialogError.value = ""; editingModelId.value = model?.id ?? ""; modelProviderId.value = model?.providerId ?? providerOptions.value[0]?.value ?? ""; modelId.value = model?.modelId ?? ""; modelLabel.value = model?.label ?? ""; apiModelId.value = model?.apiModelId ?? ""; mediaType.value = model?.mediaType ?? "text"; modelEnabled.value = !!(model?.enabled ?? 1); sortOrder.value = model?.sortOrder ?? 0; modelCapabilities.value = model?.capabilities ?? undefined; modelVisible.value = true; }
async function submitModel() { busy.value = true; dialogError.value = ""; try { await savePlatformModel({ ...(editingModelId.value ? { id: editingModelId.value } : {}), providerId: modelProviderId.value, modelId: modelId.value, label: modelLabel.value, mediaType: mediaType.value, enabled: modelEnabled.value, sortOrder: sortOrder.value ?? 0, ...(mediaType.value === "text" && apiModelId.value ? { apiModelId: apiModelId.value } : {}), ...(modelCapabilities.value ? { capabilities: modelCapabilities.value } : {}) }); modelVisible.value = false; await loadAll(); await refreshModels(); } catch (error) { dialogError.value = errorText(error); } finally { busy.value = false; } }
async function deleteModel(model: PlatformModel) { try { await feedback.confirm(`删除模型「${model.label}」？历史任务与价格记录保留，后续新任务将无法使用。`, "删除平台模型", { danger: true, confirmButtonText: "删除模型", cancelButtonText: "保留模型" }); busy.value = true; await deletePlatformModel(model.id); await loadAll(); await refreshModels(); } catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function initializeCatalog() { busy.value = true; try { await initializePlatformCatalog(); await loadAll(); await refreshModels(); } catch (error) { errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function publishPrices() {
  if (missingPrices.value) return;
  const items: PlatformPriceInput[] = [];
  for (const model of priceRows.value) {
    const textPricing = model.mediaType === "text" ? textPricingInput(model.priceKey) : undefined;
    if (model.mediaType === "text" && !textPricing) continue;
    const creditsPerUnit = textPricing ? 0 : priceDraft.value[model.priceKey];
    if (creditsPerUnit == null) continue;
    const previous = configuration.value?.prices.find(item => priceKey(item) === model.priceKey);
    const { resolutionTiers: previousResolutionTiers, sizeTiers: previousSizeTiers, ...constraints } = previous?.constraints ?? {};
    delete constraints.textPricing;
    let finalCreditsPerUnit = creditsPerUnit;
    if (model.mediaType === "image" || model.mediaType === "video") {
      const previousTiers = model.mediaType === "image" ? previousSizeTiers : previousResolutionTiers;
      const draftTiers = tierDrafts.value[model.priceKey];
      const tierValues = draftTiers ?? (previousTiers ? Object.entries(previousTiers).map(([resolution, credits]) => ({ resolution, credits })) : []);
      if (tierValues.length) {
        if (model.mediaType === "image") constraints.sizeTiers = Object.fromEntries(tierValues.map(tier => [tier.resolution.trim().toUpperCase(), tier.credits!]));
        else constraints.resolutionTiers = Object.fromEntries(tierValues.map(tier => [tier.resolution.trim(), tier.credits!]));
        finalCreditsPerUnit = Math.max(...tierValues.map(tier => tier.credits!));
      }
    }
    items.push({ providerId: model.providerId, modelId: model.modelId, mediaType: model.mediaType, creditsPerUnit: finalCreditsPerUnit, ...(Object.keys(constraints).length ? { constraints } : {}), ...(textPricing ? { textPricing } : {}) });
  }
  const free = items.filter(item => item.textPricing ? (Object.values(item.textPricing.ratesPerMillion) as (string | null)[]).every(rate => rate == null || creditMicros(rate) === 0n) : item.creditsPerUnit === 0).length;
  try { await feedback.confirm(`发布 ${items.length} 个模型的新价格？${free ? `其中 ${free} 个模型不扣积分。` : ''}已开始的任务按原价格结算。`, "发布模型积分价格", { confirmButtonText: "发布新价格", cancelButtonText: "继续编辑" }); busy.value = true; await publishPlatformPrices(items); await loadAll(); }
  catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); }
  finally { busy.value = false; }
}
onMounted(loadAll);
</script>

<style lang="scss" scoped>
.adminPage {
  :deep(.uiTable th) { text-align: center !important; }
}
.pageError { color: var(--uiStatusError); margin: 0 0 20px; font-size: var(--uiFontControl); line-height: 1.6; overflow-wrap: anywhere; }
.adminSection {
  min-width: 0;
  .sectionHeader { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin: 8px 0 24px; h2 { margin: 0 0 8px; font-size: 18px; } p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; } .sectionActions { display: flex; gap: 8px; flex-wrap: wrap; } }
  .defaultModelsCard {
    margin-top: 36px;
    padding: 20px;
    border: 1px solid var(--uiBorderControl);
    border-radius: var(--uiRadiusCard);
    background: var(--uiSurfaceRaised);
    .defaultModelsHeader {
      margin: 0 0 16px;
    }
    .defaultModelsGrid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
  }
  .modelHeader { margin-top: 36px; }
  .rowActions { display: flex; justify-content: center; gap: 4px; flex-wrap: wrap; }
  .actionGroup { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; flex-wrap: nowrap; }
  .credentialBadge { font-family: var(--uiFontMono, monospace); font-size: 13px; color: var(--uiTextSecondary); letter-spacing: 0.5px; }
  .roleLabel { color: var(--uiTextMuted); }
  .auditDetails { font-size: 12px; overflow-wrap: anywhere; }
  .priceGroup {
    &.disabledPrices { margin-top: 20px; summary { padding: 12px 0; cursor: pointer; color: var(--uiTextMuted); } }
  }
  .priceTable {
    :deep(table) { min-width: 1150px; }
    .priceEditor {
      display: flex; align-items: center; justify-content: center; gap: 12px; flex-wrap: wrap;
      :deep(input) { text-align: center; }
    }
  }
}
.configDetails { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 0; .priceSummary { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--uiTextSecondary); font-size: 12px; } }
.sectionHint { color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; }
.dialogForm { display: grid; gap: 20px; .sectionHint { margin: 0; } .rateFields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 20px; } }
.projectList { display: grid; gap: 12px; }
.tierList { display: grid; gap: 12px; .tierHeader, .tierRow { display: grid; grid-template-columns: minmax(0, 1fr) 140px auto; align-items: center; gap: 8px; } .tierHeader { color: var(--uiTextMuted); font-size: 12px; padding: 0 8px; } .tierActions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; :deep(button) { width: 100%; } } }
@media (max-width: 900px) { .adminSection .defaultModelsCard .defaultModelsGrid { grid-template-columns: 1fr; } }
@media (max-width: 700px) { .adminSection .sectionHeader { flex-direction: column; } }
@media (max-width: 520px) { .dialogForm .rateFields { grid-template-columns: 1fr; } }
</style>

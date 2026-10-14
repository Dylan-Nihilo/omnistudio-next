<template>
  <accountShell class="adminPage" title="平台管理" eyebrow="root" description="管理平台 API、模型与个人积分账户。">
    <template #actions><uiButton variant="secondary" :loading="loading" @click="loadAll">刷新平台数据</uiButton><uiButton tag="a" href="#/teams" variant="ghost">查看团队空间</uiButton></template>
    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
    <uiTabs :modelValue="activeTab" :options="tabs" label="平台管理" @update:modelValue="value => typeof value === 'string' && (activeTab = value)">
      <section v-if="activeTab === 'users'" class="adminSection"><header class="sectionHeader"><h2>用户与个人积分</h2><p>只有 root 拥有平台管理权限，团队 owner 不具备平台管理权限。</p></header><uiTable :rows="users" :columns="userColumns" :loading="loading" emptyText="还没有用户" label="平台用户"><template #cell="{ row, column }"><span v-if="column.key === 'role'" class="roleLabel">{{ row.isRoot ? 'root' : '用户' }}</span><span v-else-if="column.key === 'status'">{{ row.status === 'active' ? '正常' : '已停用' }}</span><span v-else-if="column.key === 'available' || column.key === 'frozen'">{{ formatCredits(String(row[column.key])) }}</span><div v-else-if="column.key === 'actions'" class="rowActions"><uiButton size="small" variant="ghost" :disabled="busy" @click="openCredits(row as AdminUser)">调整积分</uiButton><uiButton size="small" variant="ghost" :disabled="busy" @click="showProjects(row as AdminUser)">查看项目</uiButton><uiButton size="small" variant="ghost" :disabled="busy" @click="openPassword(row as AdminUser)">重置密码</uiButton><uiButton v-if="!row.isRoot" size="small" :variant="row.status === 'active' ? 'danger' : 'secondary'" :disabled="busy" @click="toggleUser(row as AdminUser)">{{ row.status === 'active' ? '停用' : '恢复' }}</uiButton></div><span v-else>{{ row[column.key] }}</span></template></uiTable></section>
      <section v-else-if="activeTab === 'api'" class="adminSection"><header class="sectionHeader"><div><h2>API 提供方</h2><p>凭据仅显示配置状态，留空不会覆盖已保存的凭据。</p></div><div class="sectionActions"><uiButton variant="secondary" :disabled="busy" @click="initializeCatalog">添加内置模型目录</uiButton><uiButton :disabled="busy" @click="editProvider()">添加 API</uiButton></div></header><uiTable :rows="configuration?.providers ?? []" :columns="providerColumns" :loading="loading" emptyText="还没有配置 API" label="平台 API"><template #cell="{ row, column }"><span v-if="column.key === 'apiUrl'">{{ (row.config as PlatformProvider['config']).apiUrl }}</span><span v-else-if="column.key === 'credential'" class="credentialBadge" :title="providerCredential(row)">{{ providerCredential(row) }}</span><span v-else-if="column.key === 'enabled'">{{ row.enabled ? '已启用' : '已停用' }}</span><div v-else-if="column.key === 'actions'" class="actionGroup"><uiButton size="small" variant="secondary" :disabled="busy" @click="editProvider(row as PlatformProvider)">配置 API</uiButton><uiButton size="small" variant="danger" :disabled="busy" @click="deleteProvider(row as PlatformProvider)">删除</uiButton></div><span v-else>{{ row[column.key] }}</span></template></uiTable><header class="sectionHeader modelHeader"><div><h2>平台模型</h2><p>用户只能使用平台启用的模型。</p></div><div class="sectionActions"><uiRadioGroup :modelValue="modelFilter" :options="modelFilterOptions" variant="segmented" aria-label="模型类型筛选" @update:modelValue="updateModelFilter" /><uiButton :disabled="busy || !configuration?.providers.length" @click="editModel()">添加模型</uiButton></div></header><uiTable :rows="filteredModels" :columns="modelColumns" :emptyText="modelFilter === 'all' ? '先配置 API，再添加模型' : '当前类型没有模型'" label="平台模型"><template #cell="{ row, column }"><span v-if="column.key === 'mediaType'">{{ mediaLabels[String(row.mediaType)] }}</span><span v-else-if="column.key === 'enabled'">{{ row.enabled ? '已启用' : '已停用' }}</span><div v-else-if="column.key === 'actions'" class="actionGroup"><uiButton size="small" variant="secondary" :disabled="busy" @click="editModel(row as PlatformModel)">编辑模型</uiButton><uiButton size="small" variant="danger" :disabled="busy" @click="deleteModel(row as PlatformModel)">删除</uiButton></div><span v-else>{{ row[column.key] ?? '—' }}</span></template></uiTable></section>
      <section v-else-if="activeTab === 'prices'" class="adminSection">
        <header class="sectionHeader"><div><h2>积分价格</h2><p>{{ configuration?.priceVersion ? `当前价格版本：${configuration.priceVersion}` : '尚未发布价格。配置后，用户才能使用收费模型。' }}</p></div><uiButton :disabled="busy || !priceRows.length || missingPrices" :loading="busy" @click="publishPrices">发布新价格</uiButton></header>
        <p class="sectionHint">新任务使用新价格，已开始的任务保持原价格。文本按各类实际 token 与配置费率结算，1 元＝10 积分。</p>
        <uiTable class="priceTable" :rows="priceRows" :columns="priceColumns" rowKey="priceKey" emptyText="请先添加平台模型" label="模型积分价格">
          <template #cell="{ row, column }">
            <span v-if="column.key === 'mediaType'">{{ mediaLabels[String(row.mediaType)] }}</span>
            <span v-else-if="column.key === 'unit'">{{ priceUnit(row) }}</span>
            <div v-else-if="column.key === 'creditsPerUnit'" class="priceEditor">
              <div v-if="row.mediaType === 'text'" class="tokenPricing">
                <p class="pricingHelp">费率单位：积分／百万 token，支持最多 6 位小数。缓存项留空表示不适用，0 表示免费。</p>
                <div class="rateFields">
                  <uiField v-for="field in tokenRateFields" :key="field.key" :label="field.label" :required="field.key === 'input' || field.key === 'output'">
                    <template #default="{ id }"><uiInput :id="id" :modelValue="textPriceDraft[String(row.priceKey)]?.[field.key] ?? ''" inputmode="decimal" maxlength="32" :disabled="busy" @update:modelValue="value => setTextPriceField(String(row.priceKey), field.key, value)" /></template>
                  </uiField>
                </div>
                <p class="pricingHelp" aria-live="polite">例（按历史用量比例）：{{ textExampleUsageLabel }}，总计：10 000 000 token，实际消耗积分：<strong>{{ textExampleCredits(String(row.priceKey)) }}</strong>。</p>
                <p v-if="!textPricingInput(String(row.priceKey))" class="pricingHelp">请输入有效积分费率（0～10 亿，最多 6 位小数）。</p>
              </div>
              <uiNumberInput v-else v-model="priceDraft[String(row.priceKey)]" class="mediaPriceInput" :min="0" :max="1000000000" :step="0.5" :precision="1" :disabled="busy" :aria-label="`${row.label} 的积分价格`" />
            </div>
            <span v-else>{{ row[column.key] }}</span>
          </template>
        </uiTable>
        <p v-if="missingPrices" class="sectionHint">请为所有已启用模型填写完整有效的价格。</p>
      </section>
      <extensionPanel v-else-if="activeTab === 'extensions'" /><section v-else class="adminSection"><header class="sectionHeader"><h2>管理审计</h2><p>最近 200 条平台操作记录。</p></header><uiTable :rows="audit" :columns="auditColumns" emptyText="还没有操作记录" label="平台审计"><template #cell="{ row, column }"><span v-if="column.key === 'actorUserId'">{{ userName(String(row.actorUserId)) }}</span><span v-else-if="column.key === 'createdAt'">{{ new Date(String(row.createdAt)).toLocaleString('zh-CN', { hour12: false }) }}</span><span v-else-if="column.key === 'metadata'" class="auditDetails">{{ auditText(row.metadata) }}</span><span v-else>{{ auditLabels[String(row.action)] ?? row.action }}</span></template></uiTable></section>
    </uiTabs>
    <uiDialog v-model="creditsVisible" :title="`调整 ${selectedUser?.displayName ?? ''} 的积分`" :width="500" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="adjustCredits"><p class="sectionHint">可用 {{ formatCredits(selectedUser?.available) }} · 冻结 {{ formatCredits(selectedUser?.frozen) }}。正数增加，负数扣回，不允许扣回冻结积分。</p><uiField label="积分变更" required><template #default="{ id }"><uiNumberInput :id="id" v-model="creditAmount" :min="-1000000000" :max="1000000000" :step="1" :precision="0" :disabled="busy" /></template></uiField><uiField label="调整原因" required><template #default="{ id }"><uiInput :id="id" v-model.trim="creditReason" maxlength="500" required :disabled="busy" /></template></uiField><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :disabled="busy || !creditAmount || !creditReason" :loading="busy">确认调整积分</uiButton></form></uiDialog>
    <uiDialog v-model="passwordVisible" :title="`重置 ${selectedUser?.displayName ?? ''} 的密码`" :width="480" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="resetPassword"><p class="sectionHint">重置后该账户的所有会话和服务凭证将被撤销。</p><uiField label="新密码" required><template #default="{ id }"><uiInput :id="id" v-model="newPassword" type="password" minlength="12" maxlength="200" autocomplete="new-password" showPassword required :disabled="busy" /></template></uiField><uiField label="确认新密码" required><template #default="{ id }"><uiInput :id="id" v-model="passwordConfirmation" type="password" autocomplete="new-password" showPassword required :disabled="busy" /></template></uiField><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :loading="busy" :disabled="busy || !newPassword">重置密码</uiButton></form></uiDialog>
    <uiDialog v-model="projectsVisible" :title="`${selectedUser?.displayName ?? ''} 的个人项目`" :width="680"><p v-if="projectsLoading" class="sectionHint">正在读取项目…</p><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><div class="projectList"><uiButton v-for="project in projects" :key="project.directory" variant="secondary" :disabled="busy" @click="openProject(project)"><span>{{ project.name }}</span><icon-arrow-up-right :size="16" aria-hidden="true" /></uiButton><p v-if="!projects.length && !projectsLoading" class="sectionHint">这个账户还没有项目。</p></div></uiDialog>
    <uiDialog v-model="providerVisible" title="配置平台 API" :width="600" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="submitProvider"><uiField label="提供方标识" required><template #default="{ id }"><uiInput :id="id" v-model.trim="providerId" required :readonly="providerEditing" :disabled="busy" placeholder="如 myProvider" /></template></uiField><uiField label="API 地址" required><template #default="{ id }"><uiInput :id="id" v-model.trim="apiUrl" type="url" required :disabled="busy" /></template></uiField><uiField label="文本接口协议"><uiRadioGroup v-model="protocol" :options="protocolOptions" variant="segmented" /></uiField><uiField label="API 凭据" :help="currentMaskedApiKey ? `已保存凭据：${currentMaskedApiKey}（留空保留原凭据）` : undefined"><template #default="{ id }"><uiInput :id="id" v-model="apiKey" type="password" autocomplete="off" showPassword :disabled="busy || removeApiKey" :placeholder="currentMaskedApiKey ? `已配置：${currentMaskedApiKey}，留空保留原凭据` : (credentialConfigured ? '已配置，留空保留原凭据' : '填写此 API 的访问凭据')" /></template></uiField><uiCheckbox v-if="credentialConfigured" v-model="removeApiKey" :disabled="busy">移除已保存的凭据</uiCheckbox><uiCheckbox v-model="providerEnabled" :disabled="busy">启用此 API</uiCheckbox><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :loading="busy" :disabled="busy || !providerId || !apiUrl">保存 API 配置</uiButton></form></uiDialog>
    <uiDialog v-model="modelVisible" title="配置平台模型" :width="640" :closeOnClickModal="!busy"><form class="dialogForm" @submit.prevent="submitModel"><uiField label="API 提供方" required><template #default="{ id }"><uiSelect :id="id" :modelValue="modelProviderId" :options="providerOptions" :disabled="busy || !!editingModelId" @update:modelValue="value => typeof value === 'string' && (modelProviderId = value)" /></template></uiField><uiField label="类型"><uiRadioGroup v-model="mediaType" :options="mediaOptions" variant="segmented" :disabled="!!editingModelId" /></uiField><uiField label="平台模型标识" required><template #default="{ id }"><uiInput v-if="mediaType === 'text'" :id="id" v-model.trim="modelId" required :readonly="!!editingModelId" :disabled="busy" /><uiSelect v-else :id="id" :modelValue="modelId" :options="mediaModelOptions" :disabled="busy || !!editingModelId" placeholder="选择适配器支持的模型" @update:modelValue="value => typeof value === 'string' && (modelId = value)" /></template></uiField><uiField label="显示名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="modelLabel" required :disabled="busy" /></template></uiField><uiField v-if="mediaType === 'text'" label="上游模型标识"><template #default="{ id }"><uiInput :id="id" v-model.trim="apiModelId" :disabled="busy" placeholder="留空使用平台模型标识" /></template></uiField><uiField label="排序"><uiNumberInput v-model="sortOrder" :min="-100000" :max="100000" :step="1" :precision="0" :disabled="busy" /></uiField><uiCheckbox v-model="modelEnabled" :disabled="busy">启用此模型</uiCheckbox><p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p><uiButton htmlType="submit" :disabled="busy || !modelProviderId || !modelId || !modelLabel" :loading="busy">保存模型配置</uiButton></form></uiDialog>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { uiButton, uiTabs, uiTable, uiDialog, uiField, uiInput, uiNumberInput, uiSelect, uiRadioGroup, uiCheckbox, useUiFeedback, isUiCancelledError, type UiColumn } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import extensionPanel from "./extensionPanel.vue";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";
import { getAdminUsers, saveAdminUser, resetAdminPassword, adjustUserCredits, getAdminProjects, getPlatformConfiguration, initializePlatformCatalog, savePlatformProvider, deletePlatformProvider, savePlatformModel, deletePlatformModel, publishPlatformPrices, getPlatformAudit, type AdminUser, type PlatformConfiguration, type PlatformProvider, type PlatformModel, type AuditEntry, type TextPricingInput, type TokenRates, type PlatformPriceInput } from "@/lib/accountApi";
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
type ModelFilter = "all" | PlatformModel["mediaType"];
const modelFilter = ref<ModelFilter>("all"); const modelFilterOptions = [{ value: "all", label: "全部" }, { value: "text", label: "文本" }, { value: "image", label: "图片" }, { value: "video", label: "视频" }, { value: "audio", label: "音频" }];
const providerOptions = computed(() => configuration.value?.providers.map(provider => ({ value: provider.providerId, label: provider.providerId })) ?? []);
const mediaModelOptions = computed(() => configuration.value?.mediaProviders.find(provider => provider.id === modelProviderId.value)?.models.filter(model => model.type === mediaType.value).map(model => ({ value: model.id, label: model.label ?? model.id })) ?? []);
const priceDraft = ref<Record<string, number | null>>({});
type TextPriceDraft = { input: string; cacheRead: string; cacheWrite: string; output: string };
const textPriceDraft = ref<Record<string, TextPriceDraft>>({});
const tokenRateFields: { key: keyof TokenRates; label: string }[] = [{ key: "input", label: "非缓存输入" }, { key: "cacheRead", label: "缓存读取" }, { key: "cacheWrite", label: "缓存写入" }, { key: "output", label: "输出" }];
// 136笔历史usage按占比缩放，并按最大余数分配为整数，总计1000万token。
const textExampleUsage = { input: 1_606_244, cacheRead: 8_350_337, cacheWrite: 0, output: 43_419 };
const textExampleUsageLabel = tokenRateFields.map(({ key, label }) => `${label}：${textExampleUsage[key].toLocaleString("en-US").replaceAll(",", " ")}`).join("，");
function priceKey(model: { providerId: string; mediaType: string; modelId: string }) { return JSON.stringify([model.providerId, model.mediaType, model.modelId]); }
const priceRows = computed(() => configuration.value?.models.map(model => ({ ...model, priceKey: priceKey(model) })) ?? []);
const filteredModels = computed(() => { const models = configuration.value?.models ?? []; return modelFilter.value === "all" ? models : models.filter(model => model.mediaType === modelFilter.value); });
const missingPrices = computed(() => priceRows.value.some(model => model.enabled && (model.mediaType === "text" ? !textPricingInput(model.priceKey) : priceDraft.value[model.priceKey] == null)));
const userColumns: UiColumn[] = [{ key: "displayName", label: "用户" }, { key: "email", label: "邮箱" }, { key: "role", label: "身份", width: 80 }, { key: "available", label: "可用积分", width: 115, align: "right" }, { key: "frozen", label: "冻结", width: 90, align: "right" }, { key: "status", label: "状态", width: 85 }, { key: "actions", label: "操作", width: 360, align: "right" }];
const providerColumns: UiColumn[] = [{ key: "providerId", label: "提供方", width: 150, align: "center" }, { key: "apiUrl", label: "API 地址", width: 300, align: "left" }, { key: "credential", label: "访问凭据", width: 200, align: "center" }, { key: "enabled", label: "状态", width: 95, align: "center" }, { key: "actions", label: "操作", width: 180, align: "center" }];
const modelColumns: UiColumn[] = [{ key: "label", label: "模型名称", width: 160, align: "center" }, { key: "providerId", label: "提供方", width: 140, align: "center" }, { key: "modelId", label: "模型标识", width: 240, align: "center" }, { key: "mediaType", label: "类型", width: 80, align: "center" }, { key: "enabled", label: "状态", width: 90, align: "center" }, { key: "actions", label: "操作", width: 180, align: "center" }];
const priceColumns: UiColumn[] = [{ key: "label", label: "模型", width: 170 }, { key: "providerId", label: "提供方", width: 110 }, { key: "mediaType", label: "类型", width: 70 }, { key: "unit", label: "计费单位", width: 150 }, { key: "creditsPerUnit", label: "价格配置", width: 450 }];
const auditColumns: UiColumn[] = [{ key: "action", label: "操作", width: 180 }, { key: "actorUserId", label: "操作者", width: 150 }, { key: "metadata", label: "详情" }, { key: "createdAt", label: "时间", width: 180 }];
const auditLabels: Record<string, string> = { "account.initializeRoot": "初始化 root", "account.register": "用户注册", "account.admin.update": "更新账户", "account.password.change": "修改密码", "account.password.reset": "重置密码", "billing.credits.grant": "发放积分", "billing.credits.adjustment": "调整积分", "billing.transfer": "成员积分划转", "team.create": "创建团队", "team.invite": "邀请成员", "team.acceptInvitation": "加入团队", "team.leave": "退出团队", "team.removeMember": "移除成员", "team.asset.upload": "上传团队资产", "team.asset.remove": "删除共享副本", "team.asset.rename": "重命名资产", "team.archive": "解散团队", "team.restore": "恢复团队", "team.rename": "重命名团队", "platform.provider.save": "配置 API", "platform.provider.delete": "删除 API", "platform.model.save": "配置模型", "platform.model.delete": "删除模型", "platform.prices.publish": "发布价格", "platform.catalog.initialize": "添加内置目录" };
function errorText(error: unknown) { return axios.isAxiosError(error) ? error.response?.data?.message || "连接中断，请刷新后确认结果" : error instanceof Error ? error.message : "操作失败，请重试"; }
function userName(id: string) { return users.value.find(user => user.id === id)?.displayName ?? id; }
function providerCredential(row: unknown): string { const provider = row as PlatformProvider; return provider.maskedApiKey || (provider.apiKeyConfigured ? "已配置" : "未配置"); }
function updateModelFilter(value: unknown) { if (value === "all" || value === "text" || value === "image" || value === "video" || value === "audio") modelFilter.value = value; }
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
async function loadAll() {
  loading.value = true; errorMessage.value = "";
  try {
    const [people, platform, events] = await Promise.all([getAdminUsers(), getPlatformConfiguration(), getPlatformAudit()]);
    const prices: Record<string, number | null> = {};
    const textPrices: Record<string, TextPriceDraft> = {};
    for (const model of platform.models) {
      const key = priceKey(model);
      const price = platform.prices.find(item => priceKey(item) === key);
      prices[key] = price?.creditsPerUnit ?? null;
      if (model.mediaType !== "text") continue;
      const pricing = price?.constraints?.textPricing;
      textPrices[key] = { input: pricing?.ratesPerMillion.input ?? "", cacheRead: pricing?.ratesPerMillion.cacheRead ?? "", cacheWrite: pricing?.ratesPerMillion.cacheWrite ?? "", output: pricing?.ratesPerMillion.output ?? "" };
    }
    users.value = people; audit.value = events; priceDraft.value = prices; textPriceDraft.value = textPrices; configuration.value = platform;
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
    const constraints = { ...previous?.constraints };
    delete constraints.textPricing;
    items.push({ providerId: model.providerId, modelId: model.modelId, mediaType: model.mediaType, creditsPerUnit, ...(Object.keys(constraints).length ? { constraints } : {}), ...(textPricing ? { textPricing } : {}) });
  }
  const free = items.filter(item => item.textPricing ? Object.values(item.textPricing.ratesPerMillion).every(rate => rate == null || creditMicros(rate) === 0n) : item.creditsPerUnit === 0).length;
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
  .modelHeader { margin-top: 36px; }
  .rowActions { display: flex; justify-content: flex-end; gap: 4px; flex-wrap: wrap; }
  .actionGroup { display: inline-flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; flex-wrap: nowrap; }
  .credentialBadge { font-family: var(--uiFontMono, monospace); font-size: 13px; color: var(--uiTextSecondary); letter-spacing: 0.5px; }
  .roleLabel { color: var(--uiTextMuted); }
  .auditDetails { font-size: 12px; overflow-wrap: anywhere; }
  .priceTable {
    :deep(table) { min-width: 950px; }
    .priceEditor {
      display: grid; gap: 12px;
      .mediaPriceInput { width: 200px; max-width: 100%; justify-self: center; }
      .tokenPricing {
        display: grid; gap: 12px;
        .pricingHelp { margin: 0; font-size: 12px; color: var(--uiTextMuted); line-height: 1.7; }
        .rateFields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      }
    }
  }
}
.sectionHint { color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; }
.dialogForm { display: grid; gap: 20px; .sectionHint { margin: 0; } }
.projectList { display: grid; gap: 12px; }
@media (max-width: 700px) { .adminSection .sectionHeader { flex-direction: column; } }
</style>

<template>
  <uiDialog v-model="visible" :title="provider ? '编辑供应商' : '添加自定义供应商'" :width="800" destroyOnClose :closeOnClickModal="false" :closeOnPressEscape="!saving" :showClose="!saving" @closed="resetForm">
    <uiForm ref="providerForm" :model="form" :rules="rules" :disabled="saving" class="customProviderForm">
      <div class="providerIdentity">
        <uiFormField label="Provider ID" prop="id"><template #default="{ id, invalid, required, describedBy }"><uiInput :id="id" v-model="form.id" :required="required" :error="invalid" :aria-describedby="describedBy" placeholder="例如 myProvider" /></template></uiFormField>
        <uiFormField label="显示名称" prop="label"><template #default="{ id, invalid, required, describedBy }"><uiInput :id="id" v-model="form.label" :required="required" :error="invalid" :aria-describedby="describedBy" placeholder="供应商的显示名称" /></template></uiFormField>
      </div>
      <div class="providerConnection">
        <uiFormField label="API 地址" prop="apiUrl"><template #default="{ id, invalid, describedBy }"><uiInput :id="id" v-model="form.apiUrl" :error="invalid" :aria-describedby="describedBy" placeholder="https://api.example.com/v1" /></template></uiFormField>
        <uiFormField label="API 协议" prop="protocol"><template #default="{ id }"><uiSelect :id="id" :modelValue="form.protocol" :options="protocols.map(value => ({ value, label: value }))" aria-label="API 协议" :disabled="saving" @update:modelValue="value => typeof value === 'string' && (form.protocol = value)" /></template></uiFormField>
      </div>
      <uiFormField label="API 密钥" prop="apiKey"><template #default="{ id }"><uiInput :id="id" v-model="form.apiKey" type="password" showPassword autocomplete="off" placeholder="本地无鉴权服务可留空" /></template></uiFormField>
      <section class="modelsSection" aria-label="模型列表">
        <header class="modelHeader"><h3>模型列表</h3><uiButton variant="secondary" :icon="IconDownload" :loading="fetching || modelRefreshPending" :disabled="saving" @click="fetchModels()">获取模型列表</uiButton></header>
        <div class="modelList">
          <article v-for="(item, index) in models" :key="item.key" class="modelItem">
            <div class="modelRow"><span class="modelIndex">{{ index + 1 }}</span><uiInput v-model="item.id" placeholder="模型 ID" aria-label="模型 ID" /><uiInput v-model="item.label" placeholder="显示名称" aria-label="模型显示名称" /><uiIconButton :icon="expandedModels.has(item.key) ? IconChevronUp : IconChevronDown" :aria-expanded="expandedModels.has(item.key)" label="展开 token 设置" @click="expandedModels.has(item.key) ? expandedModels.delete(item.key) : expandedModels.add(item.key)" /><uiIconButton variant="danger" :icon="IconTrash" label="删除模型" @click="models = models.filter(model => model.key !== item.key)" /></div>
            <div v-if="expandedModels.has(item.key)" class="tokenSettings">
              <uiField label="上下文窗口"><template #default="{ id }"><uiNumberInput :id="id" v-model="item.contextWindow" :min="1" :max="Number.MAX_SAFE_INTEGER" :precision="0" placeholder="未设置" aria-label="上下文窗口" /></template></uiField>
              <uiField label="最大输出 token"><template #default="{ id }"><uiNumberInput :id="id" v-model="item.maxOutputTokens" :min="1" :max="Number.MAX_SAFE_INTEGER" :precision="0" placeholder="未设置" aria-label="最大输出 token" /></template></uiField>
            </div>
          </article>
        </div>
        <uiButton class="manualAdd" variant="ghost" :icon="IconPlus" @click="addManualModel">手动添加模型</uiButton>
      </section>
      <uiAlert v-if="formError" :title="formError" tone="error" />
    </uiForm>
    <template #footer><uiButton variant="secondary" :disabled="saving" @click="visible = false">取消</uiButton><uiButton :loading="saving" :disabled="fetching || modelRefreshPending" @click="addProvider">{{ provider ? '保存修改' : '确定添加供应商' }}</uiButton></template>
    <uiDialog v-model="resultsVisible" title="选择要添加的模型" :width="680" destroyOnClose>
      <div class="modelSelection"><uiInput v-model="modelSearch" clearable placeholder="搜索模型 ID 或显示名称" aria-label="搜索模型"><template #prefix><icon-search :size="16" aria-hidden="true" /></template></uiInput>
        <div class="modelResults"><uiResizeBox><template #default="{ height }"><uiVirtualTable :columns="resultColumns" :rows="filteredModels" :height="height" :rowHeight="38" :headerHeight="36" rowKey="id" label="可添加模型" /></template></uiResizeBox></div>
        <p class="selectionCount">{{ filteredModels.length }} 个结果，已勾选 {{ selectedIds.size }} 个</p>
      </div>
      <template #footer><uiButton variant="secondary" @click="resultsVisible = false">取消</uiButton><uiButton :disabled="!selectedIds.size" @click="addSelectedModels">添加勾选的模型（{{ selectedIds.size }}）</uiButton></template>
    </uiDialog>
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue";
import axios from "axios";
import { uiDialog, uiForm, uiFormField, uiField, uiInput, uiNumberInput, uiSelect, uiButton, uiIconButton, uiAlert, uiCheckbox, uiVirtualTable, uiResizeBox, type UiFormApi, type UiFormRules, type UiColumn } from "@toonflow/ui";
import {
  IconPlus,
  IconDownload,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
  IconSearch,
} from "@tabler/icons-vue";
import { saveSettings, type CustomProvider, type CustomProviderModel } from "@/stores/settings";
import { languageProviders } from "@toonflow/providers";
import { isTfRouterProvider } from "@/lib/tf";

const props = defineProps<{ provider?: CustomProvider }>();
const visible = defineModel<boolean>({ default: false });
const providerForm = ref<UiFormApi>();
const form = reactive({ id: "", label: "", apiUrl: "", protocol: "openai-completions", apiKey: "" });
const models = ref<(CustomProviderModel & { key: string })[]>([]);
const expandedModels = ref(new Set<string>());
const fetchedModels = shallowRef<CustomProviderModel[]>([]);
const selectedIds = ref(new Set<string>());
const modelSearch = ref("");
const saving = ref(false);
const protocols = ["openai-completions", "openai-responses", "anthropic-messages"];
const addedIds = computed(() => new Set(models.value.map((item) => item.id.trim())));
const filteredModels = computed(() => {
  const query = modelSearch.value.trim().toLowerCase();
  return query ? fetchedModels.value.filter((item) => `${item.id} ${item.label}`.toLowerCase().includes(query)) : fetchedModels.value;
});
const resultColumns = computed<UiColumn[]>(() => [
  { key: "selection", label: "", width: 44, render: ({ row }) => h(uiCheckbox, {
    modelValue: selectedIds.value.has(row.id as string), disabled: addedIds.value.has(row.id as string), "aria-label": `选择 ${row.id}`,
    onChange: (value: boolean) => { if (value) selectedIds.value.add(row.id as string); else selectedIds.value.delete(row.id as string); },
  }) },
  { key: "id", label: "模型 ID", width: 260 },
  { key: "label", label: "显示名称" },
]);
const resultsVisible = ref(false);
const fetching = ref(false);
const modelRefreshPending = ref(false);
const modelFetchFailed = ref(false);
const formError = ref("");
let request: AbortController | undefined;
const rules: UiFormRules = {
  id: [
    { required: true, message: "请输入 Provider ID", trigger: "blur" },
    { pattern: /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, message: "仅支持字母、数字、点、下划线和短横线", trigger: "blur" },
  ],
  label: [{ required: true, whitespace: true, message: "请输入显示名称", trigger: "blur" }],
  apiUrl: [
    {
      validator: (_rule, value, callback) => {
        try {
          const url = new URL(value);
          if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
          callback();
        } catch {
          callback(new Error("请输入有效的 HTTP API 基础地址，不包含查询参数"));
        }
      },
      trigger: "blur",
    },
  ],
};

watch(visible, (value) => {
  if (value) {
    resetForm();
    if (props.provider) {
      const { models: providerModels, ...config } = props.provider;
      Object.assign(form, config);
      models.value = providerModels.map((item) => ({ ...item, key: crypto.randomUUID() }));
    }
  } else {
    request?.abort();
    resultsVisible.value = false;
  }
}, { immediate: true });
onBeforeUnmount(() => request?.abort());

watch(
  [visible, () => form.id, () => form.apiUrl, () => form.protocol, () => form.apiKey],
  ([isVisible], _previous, onCleanup) => {
    if (!isVisible || !isTfRouterProvider(form) || !form.apiKey.trim()) return;
    modelRefreshPending.value = true;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try { await fetchModels(true); }
      finally { if (!cancelled) modelRefreshPending.value = false; }
    }, 500);
    onCleanup(() => {
      cancelled = true;
      clearTimeout(timer);
      request?.abort();
      modelRefreshPending.value = false;
    });
  },
);

function resetForm() {
  Object.assign(form, { id: "", label: "", apiUrl: "", protocol: "openai-completions", apiKey: "" });
  models.value = [];
  expandedModels.value = new Set();
  fetchedModels.value = [];
  selectedIds.value = new Set();
  modelSearch.value = "";
  formError.value = "";
  modelFetchFailed.value = false;
}

async function fetchModels(autoApply = false) {
  if (fetching.value || !(await providerForm.value?.validateField("apiUrl").catch(() => false))) return;
  fetching.value = true;
  formError.value = "";
  modelFetchFailed.value = false;
  const controller = new AbortController();
  request = controller;
  try {
    const { data } = await axios.post(
      "/api/providers/models",
      { apiUrl: form.apiUrl.trim(), protocol: form.protocol, apiKey: form.apiKey.trim() },
      { signal: controller.signal, timeout: 35000 }
    );
    if (controller.signal.aborted) return;
    if (data.code !== 200 || !Array.isArray(data.data)) throw new Error(data.message || "获取模型列表失败");
    if (autoApply || isTfRouterProvider(form)) {
      if (!data.data.length) throw new Error("未获取到可用模型，请检查 API Key 后重试");
      models.value = data.data.map((item: CustomProviderModel) => ({ ...item, key: crypto.randomUUID() }));
      return;
    }
    fetchedModels.value = data.data;
    selectedIds.value = new Set();
    modelSearch.value = "";
    resultsVisible.value = true;
  } catch (error) {
    if (!controller.signal.aborted) {
      modelFetchFailed.value = true;
      formError.value = axios.isAxiosError(error)
        ? error.response?.data?.message || "获取模型列表失败，请检查连接配置"
        : error instanceof Error
        ? error.message
        : "获取模型列表失败";
    }
  } finally {
    fetching.value = false;
  }
}

function addSelectedModels() {
  const added = new Set(addedIds.value);
  for (const item of fetchedModels.value) {
    if (selectedIds.value.has(item.id) && !added.has(item.id)) {
      models.value.push({ ...item, key: crypto.randomUUID() });
      added.add(item.id);
    }
  }
  resultsVisible.value = false;
}

function addManualModel() {
  const key = crypto.randomUUID();
  models.value.push({ key, id: "", label: "" });
}

async function addProvider() {
  if (fetching.value || modelRefreshPending.value || (isTfRouterProvider(form) && modelFetchFailed.value)) return;
  formError.value = "";
  if (saving.value || !(await providerForm.value?.validate().catch(() => false))) return;
  const providerId = props.provider?.id;
  const ids = models.value.map((item) => item.id.trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    formError.value = "模型 ID 不能为空或重复";
    return;
  }
  if (
    models.value.some((item) =>
      [item.contextWindow, item.maxOutputTokens].some((value) => value != null && (!Number.isSafeInteger(value) || value < 1))
    )
  ) {
    formError.value = "token 限制必须为正整数或留空";
    return;
  }
  saving.value = true;
  try {
    const updatedProvider = {
      ...form,
      label: form.label.trim(),
      apiUrl: form.apiUrl.trim(),
      apiKey: form.apiKey.trim(),
      models: models.value.map(({ key, ...item }) => ({
        ...item,
        id: item.id.trim(),
        label: item.label.trim() || item.id.trim(),
        contextWindow: item.contextWindow ?? undefined,
        maxOutputTokens: item.maxOutputTokens ?? undefined,
      })),
    };
    await saveSettings(settings => {
      const existing = settings.customProviders;
      if (existing !== undefined && !Array.isArray(existing)) throw new Error("已保存的供应商配置格式不正确");
      if (languageProviders.some(item => item.id !== providerId && item.id.toLowerCase() === updatedProvider.id.toLowerCase())
        || existing?.some(item => typeof item?.id === "string" && item.id !== providerId && item.id.toLowerCase() === updatedProvider.id.toLowerCase())) {
        throw new Error("Provider ID 已存在");
      }
      if (providerId && !existing?.some(item => item.id === providerId)) throw new Error("供应商已不存在");
      return { customProviders: providerId
        ? existing!.map(item => item.id === providerId ? updatedProvider : item)
        : [...(existing ?? []), updatedProvider] };
    });
    visible.value = false;
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "保存失败" : error instanceof Error ? error.message : "保存失败";
    formError.value = `${message}；当前填写的内容已保留，请重试`;
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.customProviderForm {
  min-width: 0;
  .providerIdentity, .providerConnection { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
  .providerConnection { padding-top: 20px; border-top: 1px solid var(--uiBorderDefault); }
  .modelsSection {
    min-width: 0; padding-top: 24px; border-top: 1px solid var(--uiBorderDefault);
    .modelHeader { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; h3 { margin: 0; font-size: var(--uiFontLabel); font-weight: 600; } }
    .modelList { display: flex; flex-direction: column; gap: 12px; .modelItem { min-width: 0; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); .modelRow { display: grid; grid-template-columns: 20px minmax(0, 1fr) minmax(0, 1fr) 36px 36px; gap: 8px; align-items: center; .modelIndex { color: var(--uiTextMuted); font-size: var(--uiFontControl); font-variant-numeric: tabular-nums; } } .tokenSettings { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding-top: 16px; margin-top: 16px; border-top: 1px solid var(--uiBorderDefault); } } }
    .manualAdd { width: 100%; margin-top: 12px; }
  }
  @media (max-width: 700px) { .providerIdentity, .providerConnection { grid-template-columns: 1fr; gap: 20px; } .modelsSection .modelList .modelItem { .modelRow { grid-template-columns: 20px minmax(0, 1fr) 36px 36px; :deep(.uiInput:nth-child(3)) { grid-column: 2; grid-row: 2; } } .tokenSettings { grid-template-columns: 1fr; } } }
}
.modelSelection { display: flex; flex-direction: column; gap: 16px; .modelResults { height: min(420px, 52dvh); } .selectionCount { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
</style>

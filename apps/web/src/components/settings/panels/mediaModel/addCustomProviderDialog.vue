<template>
  <component :is="useOwnRules ? uiDialog : ElDialog" v-model="visible" :title="mode === 'builtin' ? '添加媒体供应商' : '添加自定义媒体供应商'" :width="mode === 'builtin' ? 860 : 800" alignCenter appendToBody destroyOnClose :closeOnClickModal="false" :closeOnPressEscape="!saving" :showClose="!saving">
    <uiThemeProvider :mode="uiSettings.theme" :primaryColor="uiSettings.primaryColor" :radius="uiSettings.radius" :fontScale="100">
      <div v-if="mode === 'builtin'" class="providerPicker">
        <aside class="providerSidebar" aria-label="选择厂商"><button v-for="item in mediaProviders" :key="item.id" class="providerItem" type="button" :disabled="saving" :aria-pressed="selectedProvider === item.id" @click="selectedProvider = item.id"><img v-if="item.id === 'tfRouter'" class="providerLogo" :src="logoUrl" alt="" /><modelIcon v-else :model="item.id" :size="18" /><span>{{ item.label }}</span></button></aside>
        <div class="providerDetails"><section v-if="activeProvider" :key="selectedProvider" class="providerContent" :aria-label="activeProvider.label">
          <header class="providerHeader"><h3>{{ activeProvider.label }}</h3><uiTag v-if="activeProvider.version">v{{ activeProvider.version }}</uiTag></header><messageMarkdown v-if="providerReadme" class="providerReadme" :content="providerReadme" /><h4 v-if="providerReadme" class="connectionTitle">连接配置</h4>
          <uiRuleForm v-if="supportsUiRules(providerRules)" v-model="builtinValues" :rule="providerRules" :disabled="saving" @update:api="value => formApi = value" /><form-create v-else v-model:api="formApi" :rule="providerRules" :option="formOptions" />
          <div class="modelHeader"><h4>模型列表 <span>{{ models.length }}</span></h4></div><uiTable v-if="models.length" class="modelList" :rows="models" :columns="modelColumns" rowKey="id" label="模型列表" /><uiAlert v-if="formError" :title="formError" tone="error" />
        </section></div>
      </div>
      <div v-else class="mediaImport">
        <uiField label="添加方式"><uiRadioGroup :modelValue="activeTab" :options="addMethods" :disabled="saving" variant="segmented" block aria-label="添加方式" @update:modelValue="value => (value === 'file' || value === 'code') && (activeTab = value)" /></uiField>
        <uiField v-if="activeTab === 'file'" label="供应商文件" help="支持 .ts 文件，最大 1 MB。"><template #default="{ id, describedBy }"><div class="fileSource"><input ref="fileInput" type="file" accept=".ts" hidden :disabled="saving" @change="readSourceFile" /><uiInput :id="id" :modelValue="fileName" placeholder="尚未选择文件" readonly :aria-describedby="describedBy" aria-label="已选择的供应商文件"><template #prefix><icon-file-code :size="16" aria-hidden="true" /></template></uiInput><uiButton variant="secondary" :icon="IconFolderOpen" :disabled="saving" @click="fileInput?.click()">选择文件</uiButton></div></template></uiField>
        <uiField v-else label="供应商代码"><template #default="{ id }"><uiTextarea :id="id" v-model="code" class="sourceInput" :rows="10" resize="vertical" :disabled="saving" aria-label="供应商代码" /></template></uiField>
        <section class="providerTips" aria-labelledby="providerTipsTitle"><h3 id="providerTipsTitle">没有供应商文件？可以让 AI 帮你生成</h3><p>复制提示词发给其他 AI，按引导提供接口资料即可生成配置文件，随后在这里导入 .ts 文件或粘贴完整代码即可使用。</p><uiButton variant="secondary" size="small" :icon="IconCopy" @click="copyPrompt">一键复制提示词</uiButton><details class="promptDetails" :open="promptExpanded" @toggle="promptExpanded = ($event.target as HTMLDetailsElement).open"><summary>查看完整提示词</summary><uiTextarea v-if="promptExpanded" :modelValue="providerPrompt" :rows="10" resize="vertical" readonly aria-label="供应商开发提示词" /></details></section>
        <uiAlert v-if="formError" :title="formError" tone="error" />
      </div>
    </uiThemeProvider>
    <template #footer><uiButton variant="secondary" :disabled="saving" @click="visible = false">取消</uiButton><uiButton :loading="saving" :disabled="!source.trim()" @click="addProvider">确定添加供应商</uiButton></template>
  </component>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, ref, shallowRef, watch } from "vue";
import formCreate, { type Api, type Options } from "../../formCreate";
import { IconFileCode, IconCode, IconFolderOpen, IconCopy } from "@tabler/icons-vue";
import { ElDialog } from "element-plus";
import { uiDialog, uiThemeProvider, uiRuleForm, uiField, uiInput, uiTextarea, uiRadioGroup, uiButton, uiAlert, uiTag, uiTable, useUiFeedback, type UiRuleFormApi, type UiColumn } from "@toonflow/ui";
import { supportsUiRules } from "../../ruleSupport";
import { mediaProviders } from "@toonflow/providers";
import { modelIcon } from "@toonflow/model-icons";
import logoUrl from "@toonflow/assets/logo.svg";
import messageMarkdown from "@/components/messageMarkdown.vue";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import tfRouterSource from "@toonflow/providers/media/tfRouter?raw";
import type { MediaProvider } from "./types";
import { providerPrompt } from "./providerPrompt";
import { saveSettings, uiSettings } from "@/stores/settings";
import { writeClipboardText } from "@/lib/clipboard";

const feedback = useUiFeedback();
const builtinValues = ref<Record<string, unknown>>({});
const modelColumns: UiColumn[] = [{ key: "id", label: "模型 ID", width: 260 }, { key: "label", label: "显示名称" }];
const { mode = "custom" } = defineProps<{ mode?: "builtin" | "custom" }>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ added: [provider: MediaProvider] }>();
const providerSources: Record<string, string> = { tfRouter: tfRouterSource };
const selectedProvider = ref<string>(mediaProviders[0]?.id ?? "");
const activeProvider = computed(() => mediaProviders.find(provider => provider.id === selectedProvider.value));
const models = computed(() => activeProvider.value?.models ?? []);
const providerReadme = computed(() => {
  const provider = activeProvider.value;
  return provider && "readme" in provider && typeof provider.readme === "string" ? provider.readme : "";
});
const activeTab = ref<"file" | "code">("file");
const addMethods = [
  { label: "文件导入", value: "file", icon: IconFileCode },
  { label: "粘贴代码", value: "code", icon: IconCode },
];
const promptExpanded = ref(false);
const code = ref("");
const fileSource = ref("");
const fileName = ref("");
const fileInput = ref<HTMLInputElement>();
const saving = ref(false);
const formError = ref("");
const formApi = shallowRef<Api | UiRuleFormApi>();
const addedProvider = shallowRef<MediaProvider>();
const formOptions = computed<Options>(() => ({ form: { labelPosition: "top", disabled: saving.value }, submitBtn: false, resetBtn: false }));
const providerRules = computed(() => formCreate.copyRules(activeProvider.value?.rules ?? []));
const useOwnRules = computed(() => mode !== "builtin" || supportsUiRules(providerRules.value));
watch(selectedProvider, () => { builtinValues.value = {}; }, { flush: "sync" });
const source = computed(() => mode === "builtin" ? providerSources[selectedProvider.value] ?? "" : activeTab.value === "file" ? fileSource.value : code.value);

watch([activeTab, selectedProvider], () => {
  formError.value = "";
  addedProvider.value = undefined;
});

watch(visible, value => {
  if (!value) return;
  selectedProvider.value = mediaProviders[0]?.id ?? "";
  activeTab.value = "file";
  promptExpanded.value = false;
  formApi.value = undefined;
  builtinValues.value = {};
  addedProvider.value = undefined;
  code.value = fileSource.value = fileName.value = formError.value = "";
});

async function readSourceFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  formError.value = "";
  try {
    if (!/\.ts$/i.test(file.name) || file.size > 1024 * 1024) throw new Error("请选择不超过 1 MB 的 .ts 文件");
    fileSource.value = await file.text();
    fileName.value = file.name;
  } catch (error) {
    fileSource.value = fileName.value = "";
    formError.value = error instanceof Error ? error.message : "读取文件失败";
  }
}

async function addProvider() {
  if (saving.value || !source.value.trim()) return;
  if (mode === "builtin" && !formApi.value) return;
  saving.value = true;
  formError.value = "";
  try {
    let values: Record<string, unknown> | undefined;
    if (mode === "builtin") {
      if (!(await formApi.value!.validate().catch(() => false))) return;
      values = formApi.value!.formData();
      if ("apiKey" in values) {
        values.apiKey = typeof values.apiKey === "string" ? values.apiKey.trim() : "";
        if (!values.apiKey) throw new Error("请填写 API Key");
        if ((values.apiKey as string).length > 8192) throw new Error("API Key 过长");
      }
    }
    if (!addedProvider.value) {
      const { data } = await axios.post<{ data: MediaProvider }>("/api/providers/media/add", { source: source.value });
      addedProvider.value = data.data;
      emit("added", data.data);
      invalidateNodeModels("media");
    }
    if (values) {
      const providerId = addedProvider.value.id;
      // ACT: 安装成功但配置保存失败时保留安装结果，重试只保存配置。
      await saveSettings(settings => {
        const configs = settings.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
        if (configs !== undefined && (!configs || typeof configs !== "object" || Array.isArray(configs))) throw new Error("媒体供应商配置格式无效");
        const current = configs?.[providerId];
        if (current !== undefined && (!current || typeof current !== "object" || Array.isArray(current))) throw new Error("当前供应商配置格式无效");
        return { mediaProviderConfigs: { ...configs, [providerId]: { ...current, ...values } } };
      });
    }
    invalidateNodeModels("media");
    visible.value = false;
  } catch (error) {
    const message = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "添加失败，请重试";
    formError.value = addedProvider.value ? `供应商已添加，连接配置未保存：${message}。填写内容已保留，请重试。` : message;
  } finally {
    saving.value = false;
  }
}

async function copyPrompt() {
  try {
    await writeClipboardText(providerPrompt);
    feedback.message({ tone: "success", message: "提示词已复制，发给其他 AI 后跟着回答问题即可" });
  } catch {
    feedback.message({ tone: "error", message: "复制失败，请展开「查看完整提示词」后手动复制" });
  }
}
</script>

<style lang="scss" scoped src="../../providerPicker.scss"></style>
<style lang="scss" scoped>
.mediaImport { display: flex; flex-direction: column; gap: 24px; min-width: 0; padding: 4px; .fileSource { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; min-width: 0; :deep(.uiInput) { flex: 1; min-width: 220px; } } .sourceInput { min-height: 180px; } .providerTips { min-width: 0; padding: 20px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiBackgroundSubtle); h3 { margin: 0 0 12px; color: var(--uiTextPrimary); font-size: var(--uiFontLabel); font-weight: 600; } p { margin: 0 0 16px; color: var(--uiTextBody); font-size: var(--uiFontControl); line-height: 1.7; } .promptDetails { margin-top: 20px; summary { width: fit-content; color: var(--uiTextMuted); font-size: var(--uiFontControl); cursor: pointer; } :deep(.uiTextarea) { margin-top: 16px; } } } }
</style>

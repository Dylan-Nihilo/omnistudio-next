<template>
  <component :is="useOwnRules ? uiDialog : ElDialog" v-model="visible" title="添加供应商" :width="860" alignCenter appendToBody destroyOnClose :closeOnClickModal="false" :closeOnPressEscape="!saving" :showClose="!saving" @closed="resetForm">
    <uiThemeProvider :mode="uiSettings.theme" :primaryColor="uiSettings.primaryColor" :radius="uiSettings.radius" :fontScale="100">
      <div class="providerPicker">
        <aside class="providerSidebar" aria-label="选择厂商"><button v-for="item in languageProviders" :key="item.id" class="providerItem" type="button" :disabled="saving" :aria-pressed="selectedProvider === item.id" @click="selectedProvider = item.id"><img v-if="item.id === 'tfRouter'" class="providerLogo" :src="logoUrl" alt="" /><modelIcon v-else :model="item.id" :size="18" /><span>{{ item.label }}</span></button></aside>
        <div class="providerDetails"><section v-if="activeProvider" :key="selectedProvider" class="providerContent" :aria-label="activeProvider.label">
          <header class="providerHeader"><h3>{{ activeProvider.label }}</h3><uiTag v-if="activeProvider.version">v{{ activeProvider.version }}</uiTag></header>
          <messageMarkdown v-if="providerReadme" class="providerReadme" :content="providerReadme" />
          <h4 v-if="providerReadme" class="connectionTitle">连接配置</h4>
          <uiRuleForm v-if="supportsUiRules(providerRules)" v-model="formValues" :rule="providerRules" :disabled="saving" @update:api="value => formApi = value" />
          <form-create v-else v-model="formValues" v-model:api="formApi" :rule="providerRules" :option="formOptions" />
          <div class="modelHeader"><h4>模型列表 <span>{{ models.length }}</span></h4><span v-if="fetching" class="modelHint" role="status">正在获取…</span><uiButton v-else-if="modelError" size="small" variant="ghost" :icon="IconRefresh" @click="modelRefresh++">重试</uiButton></div>
          <uiAlert v-if="modelError" :title="modelError" tone="error" />
          <div v-else-if="models.length" class="modelList" :style="{ height: `${Math.min(280, models.length * 38 + 36)}px` }"><uiResizeBox><template #default="{ height }"><uiVirtualTable :columns="modelColumns" :rows="models" :height="height" :rowHeight="38" :headerHeight="36" rowKey="id" label="模型列表" /></template></uiResizeBox></div>
          <p v-else-if="!fetching" class="modelHint">{{ formValues.apiKey ? '未获取到模型' : '填写 API Key 后自动获取模型列表' }}</p>
          <uiAlert v-if="formError" :title="formError" tone="error" />
        </section></div>
      </div>
    </uiThemeProvider>
    <template #footer><uiButton variant="secondary" :disabled="saving" @click="visible = false">取消</uiButton><uiButton :loading="saving" :disabled="!activeProvider || fetching || !!modelError" @click="addProvider">确定添加供应商</uiButton></template>
  </component>
</template>

<script setup lang="ts">
import { ElDialog } from "element-plus";
import { uiDialog, uiThemeProvider, uiRuleForm, uiButton, uiTag, uiAlert, uiVirtualTable, uiResizeBox, type UiRuleFormApi, type UiColumn } from "@toonflow/ui";
import { uiSettings } from "@/stores/settings";
import { supportsUiRules } from "../../ruleSupport";
import { computed, ref, shallowRef, watch } from "vue";
import axios from "axios";
import { IconRefresh } from "@tabler/icons-vue";
import formCreate, { type Api, type Options } from "../../formCreate";
import { languageProviders } from "@toonflow/providers";
import { modelIcon } from "@toonflow/model-icons";
import logoUrl from "@toonflow/assets/logo.svg";
import messageMarkdown from "@/components/messageMarkdown.vue";

import { saveSettings, type CustomProviderModel } from "@/stores/settings";

const visible = defineModel<boolean>({ default: false });
const selectedProvider = ref<string>(languageProviders[0]?.id ?? "");
const formApi = shallowRef<Api | UiRuleFormApi>();
const formValues = ref<Record<string, unknown>>({});
const models = shallowRef<CustomProviderModel[]>([]);
const fetching = ref(false);
const modelError = ref("");
const modelRefresh = ref(0);
const modelColumns: UiColumn[] = [{ key: "id", label: "模型 ID", width: 260 }, { key: "label", label: "显示名称" }];
const saving = ref(false);
const formError = ref("");
watch(selectedProvider, () => {
  formError.value = "";
  formValues.value = {};
}, { flush: "sync" });
const activeProvider = computed(() => languageProviders.find(provider => provider.id === selectedProvider.value));
const providerReadme = computed(() => {
  const provider = activeProvider.value;
  return provider && "readme" in provider && typeof provider.readme === "string" ? provider.readme : "";
});
const formOptions = computed<Options>(() => ({ form: { labelPosition: "top", disabled: saving.value }, submitBtn: false, resetBtn: false }));
const providerRules = computed(() =>
  formCreate.copyRules(activeProvider.value?.rules ?? []),
);

const useOwnRules = computed(() => supportsUiRules(providerRules.value));

watch(
  [visible, activeProvider, () => formValues.value.apiKey, modelRefresh],
  ([isVisible, provider, key], _previous, onCleanup) => {
    models.value = [];
    modelError.value = "";
    fetching.value = false;
    if (!isVisible || !provider) return;
    if (provider.models.length) {
      models.value = structuredClone(provider.models);
      return;
    }
    const apiKey = typeof key === "string" ? key.trim() : "";
    if (!apiKey) return;
    const controller = new AbortController();
    fetching.value = true;
    // ACT: 输入停顿后自动获取；输入变化时立即取消旧请求，避免逐字请求和结果串到新密钥。
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.post("/api/providers/models", {
          apiUrl: provider.apiUrl, protocol: provider.protocol, apiKey,
        }, { signal: controller.signal, timeout: 35000 });
        if (controller.signal.aborted) return;
        if (data.code !== 200 || !Array.isArray(data.data)) throw new Error(data.message || "获取模型列表失败");
        models.value = data.data;
      } catch (error) {
        if (!controller.signal.aborted) modelError.value = axios.isAxiosError(error)
          ? error.response?.data?.message || "获取模型列表失败，请检查 API Key 后重试"
          : error instanceof Error ? error.message : "获取模型列表失败";
      } finally {
        if (!controller.signal.aborted) fetching.value = false;
      }
    }, 500);
    onCleanup(() => {
      clearTimeout(timer);
      controller.abort();
    });
  },
  { immediate: true, flush: "sync" },
);

function resetForm() {
  selectedProvider.value = languageProviders[0]?.id ?? "";
  formError.value = "";
  formApi.value = undefined;
  formValues.value = {};
}

async function addProvider() {
  if (saving.value || fetching.value || modelError.value || !activeProvider.value || !formApi.value) return;
  formError.value = "";
  const provider = activeProvider.value;
  const values = formApi.value.formData();
  const apiKey = typeof values.apiKey === "string" ? values.apiKey.trim() : "";
  if (!apiKey) {
    formError.value = "请填写 API Key";
    return;
  }
  saving.value = true;
  try {
    const addedProvider = {
      id: provider.id,
      label: provider.label,
      apiKey,
      apiUrl: "apiUrl" in provider ? provider.apiUrl : "",
      protocol: "protocol" in provider ? provider.protocol : "",
      models: models.value.map(model => ({ ...model })),
    };
    await saveSettings(settings => {
      const existing = settings.customProviders;
      if (existing !== undefined && !Array.isArray(existing)) throw new Error("已保存的供应商配置格式不正确");
      if (existing?.some(item => typeof item?.id === "string" && item.id.toLowerCase() === provider.id.toLowerCase())) {
        throw new Error("此供应商已添加，请在供应商列表中编辑");
      }
      return { customProviders: [...(existing ?? []), addedProvider] };
    });
    visible.value = false;
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "保存失败" : error instanceof Error ? error.message : "保存失败";
    formError.value = `${message}；当前填写的内容已保留，请重试`;
  } finally { saving.value = false; }
}
</script>

<style lang="scss" scoped src="../../providerPicker.scss"></style>

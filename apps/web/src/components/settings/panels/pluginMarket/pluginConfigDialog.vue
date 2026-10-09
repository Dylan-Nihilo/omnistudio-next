<template>
  <component :is="useOwnRules ? uiDialog : ElDialog" v-model="visible" :title="`${plugin.displayName} · 配置`" :width="600" alignCenter appendToBody destroyOnClose :closeOnClickModal="false" :closeOnPressEscape="!saving" :showClose="!saving" @closed="formApi = undefined">
    <uiThemeProvider :mode="uiSettings.theme" :primaryColor="uiSettings.primaryColor" :radius="uiSettings.radius" :fontScale="100" class="configForm">
      <uiRuleForm v-if="supportsUiRules(formRules)" v-model="formValues" :rule="formRules" :disabled="saving" @update:api="value => formApi = value" />
      <form-create v-else v-model="formValues" v-model:api="formApi" :rule="formRules" :option="formOptions" />
      <uiAlert v-if="configError" :title="configError" tone="error" />
    </uiThemeProvider>
    <template #footer>
      <uiButton variant="secondary" :disabled="saving" @click="visible = false">取消</uiButton>
      <uiButton :loading="saving" :disabled="!canManage || !formApi" @click="saveConfig">保存</uiButton>
    </template>
  </component>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, ref, shallowRef, toRaw, watch } from "vue";
import formCreate, { type Api, type Options } from "../../formCreate";
import { ElDialog } from "element-plus";
import { uiDialog, uiThemeProvider, uiRuleForm, uiAlert, uiButton, useUiFeedback, type UiRuleFormApi } from "@omnistudio-next/ui";
import { uiSettings } from "@/stores/settings";
import { supportsUiRules } from "../../ruleSupport";
import type { Plugin } from "./types";

const { plugin, canManage } = defineProps<{ plugin: Plugin; canManage: boolean }>();
const visible = defineModel<boolean>({ default: false });
const feedback = useUiFeedback();
const formApi = shallowRef<Api | UiRuleFormApi>();
const formRules = shallowRef<ReturnType<typeof formCreate.copyRules>>([]);
const formValues = ref<Record<string, unknown>>({});
const useOwnRules = computed(() => supportsUiRules(formRules.value));
const saving = ref(false);
const configError = ref("");
const formOptions = computed<Options>(() => ({ form: { labelPosition: "top", size: "small", disabled: saving.value }, submitBtn: false, resetBtn: false }));

watch(() => [visible.value, plugin], () => {
  if (!visible.value) return;
  formApi.value = undefined;
  formRules.value = formCreate.copyRules(plugin.configRules ?? []);
  formValues.value = structuredClone(toRaw(plugin.config ?? {}));
  configError.value = "";
}, { immediate: true });

async function saveConfig() {
  if (!canManage || saving.value || !formApi.value) return;
  saving.value = true;
  configError.value = "";
  try {
    if (!(await formApi.value.validate().catch(() => false))) return;
    const path = plugin.type === "node" ? "nodes" : "tools";
    const { data } = await axios.put(`/api/${path}/save`, { name: plugin.name, config: formApi.value.formData() }, { headers: { "x-omnistudio-next-workspace": "1" } });
    if (data.code !== 200) throw new Error(data.message || "保存插件配置失败");
    plugin.config = data.data;
    if (plugin.type === "node") window.dispatchEvent(new Event("omnistudio-next:node-config-updated"));
    visible.value = false;
    feedback.message({ tone: "success", message: "插件配置已保存" });
  } catch (error) {
    configError.value = axios.isAxiosError(error)
      ? error.response?.data?.message || "保存失败，请重试；当前填写的内容已保留"
      : error instanceof Error ? error.message : "保存失败，请重试";
  } finally { saving.value = false; }
}
</script>

<style lang="scss" scoped>
.configForm { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
</style>

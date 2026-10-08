<template>
  <uiDialog v-model="visible" :title="`编辑媒体供应商：${provider?.label ?? ''}`" :width="840" destroyOnClose :closeOnClickModal="false" :closeOnPressEscape="!saving" :showClose="!saving">
    <div class="providerEditor">
      <messageMarkdown v-if="provider?.readme" class="providerReadme" :content="provider.readme" />
      <uiField label="API Key"><template #default="{ id }"><uiInput :id="id" v-model="apiKey" type="password" showPassword autocomplete="off" :disabled="saving" aria-label="媒体供应商 API Key"><template #prefix><icon-key :size="16" aria-hidden="true" /></template></uiInput></template></uiField>
      <section class="modelSection"><header class="modelHeader"><h3>模型配置 <span>{{ models.length }}</span></h3><uiButton variant="secondary" :icon="IconPlus" :disabled="saving" @click="editModel()">手动添加</uiButton></header>
        <div class="modelList"><article v-for="(item, index) in models" :key="index" class="modelCard"><div class="topInfo"><div class="modelNameWrap"><modelIcon :model="item.id" :size="24" /><div class="modelInfo"><strong class="modelName">{{ item.label }}</strong><span class="modelId">{{ item.id }}</span></div></div><div class="actionButtons"><uiButton variant="ghost" size="small" :icon="IconEdit" :disabled="saving" :aria-label="`编辑模型 ${item.label}`" @click="editModel(index)">编辑</uiButton><uiButton variant="danger" size="small" :icon="IconTrash" :disabled="saving" :aria-label="`删除模型 ${item.label}`" @click="models.splice(index, 1)">删除</uiButton></div></div><div class="modelTags"><uiTag>{{ modelTypes[item.type] }}</uiTag><uiTag v-for="(tag, tagIndex) in modelTags(item)" :key="tagIndex">{{ tag }}</uiTag></div></article><p v-if="!models.length" class="modelEmpty">暂无模型</p></div>
      </section>
      <uiAlert v-if="formError" :title="formError" tone="error" />
    </div>
    <template #footer><uiButton variant="secondary" :disabled="saving" @click="visible = false">取消</uiButton><uiButton :icon="IconDeviceFloppy" :loading="saving" @click="saveModels">保存</uiButton></template>
    <component :is="modelEditorDialog" v-model="modelEditorVisible" :model="editingModelIndex === undefined ? undefined : models[editingModelIndex]" :models="models" @confirmed="confirmModel" />
  </uiDialog>
</template>

<script setup lang="ts">
import { uiDialog, uiField, uiInput, uiButton, uiTag, uiAlert } from "@toonflow/ui";
import axios from "axios";
import { defineAsyncComponent, ref, shallowRef, watch, type Component } from "vue";
import { IconPlus, IconTrash, IconDeviceFloppy, IconEdit, IconKey } from "@tabler/icons-vue";
import { modelIcon } from "@toonflow/model-icons";
import messageMarkdown from "@/components/messageMarkdown.vue";
import type { MediaProvider, MediaProviderModel } from "./types";
import { settings, saveSettings } from "@/stores/settings";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";

const { provider } = defineProps<{ provider?: MediaProvider }>();
const modelEditorDialog = shallowRef<Component>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ saved: [provider: MediaProvider] }>();
const models = ref<MediaProviderModel[]>([]);
const modelEditorVisible = ref(false);
const editingModelIndex = ref<number>();
const saving = ref(false);
const apiKey = ref("");
const formError = ref("");
const modelTypes = { image: "图片", video: "视频", audio: "音频", text: "文本" };
const modeLabels: Record<string, string> = {
  singleImage: "单图参考", multiReference: "多图参考", startEndRequired: "首尾帧必填",
  endFrameOptional: "尾帧可选", startFrameOptional: "首帧可选",
  imageReference: "图片参考", videoReference: "视频参考", audioReference: "音频参考",
};

watch(visible, isVisible => {
  if (!isVisible) return;
  formError.value = "";
  modelEditorVisible.value = false;
  editingModelIndex.value = undefined;
  const configs = settings.value.mediaProviderConfigs as Record<string, { apiKey?: unknown }> | undefined;
  const configuredKey = provider && configs?.[provider.id]?.apiKey;
  apiKey.value = typeof configuredKey === "string" ? configuredKey : "";
  models.value = JSON.parse(JSON.stringify(provider?.models ?? []));
}, { immediate: true });

function modelTags(model: MediaProviderModel) {
  const modes = Array.isArray(model.mode) ? model.mode.flat().filter((mode): mode is string => typeof mode === "string") : [];
  return modes.map(mode => {
    if (mode === "text") return model.type === "image" ? "文生图" : "文生视频";
    const reference = /^(imageReference|videoReference|audioReference):(\d+)$/.exec(mode);
    return reference ? `${modeLabels[reference[1]!]} ×${reference[2]}` : modeLabels[mode] ?? mode;
  });
}

function editModel(index?: number) {
  modelEditorDialog.value ??= defineAsyncComponent(() => import("./modelEditorDialog.vue"));
  editingModelIndex.value = index;
  modelEditorVisible.value = true;
}

function confirmModel(model: MediaProviderModel) {
  const index = editingModelIndex.value;
  if (index === undefined) models.value.push(model);
  else models.value.splice(index, 1, model);
}

async function saveModels() {
  if (saving.value || !provider) return;
  const { id: providerId, fileName, revision } = provider;
  formError.value = "";
  let configSaved = false;
  try {
    const ids = new Set<string>();
    const values = models.value.map((item, index) => {
      const id = item.id.trim();
      const label = item.label.trim();
      if (!id || !label) throw new Error(`请填写第 ${index + 1} 个模型的 ID 和显示名称`);
      if (ids.has(id)) throw new Error(`模型 ID 重复：${id}`);
      ids.add(id);
      return { ...item, id, label };
    });
    if (apiKey.value.length > 8192) throw new Error("API Key 过长");
    saving.value = true;
    const nextKey = apiKey.value.trim();
    configSaved = await saveSettings(settings => {
      const configs = settings.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
      if (configs !== undefined && (!configs || typeof configs !== "object" || Array.isArray(configs))) throw new Error("媒体供应商配置格式无效");
      const current = configs?.[providerId];
      if (current !== undefined && (!current || typeof current !== "object" || Array.isArray(current))) throw new Error("当前供应商配置格式无效");
      if (nextKey === (current?.apiKey ?? "")) return;
      return { mediaProviderConfigs: { ...configs, [providerId]: { ...current, apiKey: nextKey } } };
    });
    const { data } = await axios.put<{ data: MediaProvider }>("/api/providers/media/save", {
      fileName, revision, models: values,
    });
    invalidateNodeModels("media");
    emit("saved", data.data);
    visible.value = false;
  } catch (error) {
    const message = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "保存失败，请重试";
    formError.value = configSaved ? `连接配置已保存，模型未保存：${message}。模型修改已保留，请重试。` : message;
  } finally {
    saving.value = false;
  }
}
</script>

<style lang="scss" scoped>
.providerEditor { display: flex; flex-direction: column; gap: 24px; min-width: 0; .providerReadme { overflow-wrap: anywhere; } .modelSection { padding-top: 24px; border-top: 1px solid var(--uiBorderDefault); .modelHeader { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; h3 { margin: 0; font-size: var(--uiFontLabel); span { margin-left: 8px; color: var(--uiTextMuted); font-weight: 400; } } } .modelList { display: flex; flex-direction: column; gap: 16px; .modelCard { min-width: 0; padding: 20px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiBackgroundSubtle); .topInfo { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; .modelNameWrap { display: flex; gap: 12px; align-items: center; min-width: 0; .modelInfo { display: flex; flex-direction: column; gap: 6px; min-width: 0; overflow-wrap: anywhere; .modelName { font-size: var(--uiFontTitle); font-weight: 600; } .modelId { color: var(--uiTextMuted); font-size: var(--uiFontControl); } } } .actionButtons { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; } } .modelTags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; } } .modelEmpty { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); } } } }
</style>

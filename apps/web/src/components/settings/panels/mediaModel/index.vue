<template>
  <div v-if="loaded" class="providerList">
    <div class="itemList">
      <uiCard v-for="item in sortedProviders" :key="item.fileName" class="providerItem" >
        <div class="providerHeader">
          <div v-if="item.id.toLowerCase() === 'tfrouter'" class="providerMark" aria-hidden="true">
            <img class="providerLogo" :src="logoUrl" alt="" />
          </div>
          <div class="providerInfo">
            <div class="providerHeading">
              <strong class="providerName">{{ item.label }}</strong>
              <uiTag v-if="item.id.toLowerCase() === 'tfrouter'" >官方</uiTag>
            </div>
            <span class="providerId" :title="item.fileName">{{ item.fileName }}</span>
          </div>
        </div>
        <uiAlert v-if="item.loadError" :title="item.loadError" tone="error" />
        <tfAccount v-if="item.id.toLowerCase() === 'tfrouter'" :apiKey="getProviderApiKey(item.id)" :visible="visible" :saveApiKey="(key) => saveProviderApiKey(item.id, key)" />
        <div class="providerFooter">
          <div class="providerMeta">
            <uiTag v-if="item.version"   >v{{ item.version }}</uiTag>
            <span class="providerCount">{{ item.models.length }} 个模型</span>
          </div>
          <div class="itemActions">
            <uiButton v-if="item.modelsUrl" variant="ghost" :icon="IconDownload" :loading="fetchingFile === item.fileName" :disabled="!!fetchingFile || !!deletingFile || !!item.loadError || !item.revision" @click="fetchModels(item)">获取模型</uiButton>
            <uiButton variant="ghost" :icon="IconEdit" :disabled="!!fetchingFile || !!deletingFile || !!item.loadError" @click="editProvider(item)">编辑模型</uiButton>
            <uiPopconfirm title="确定删除此供应商及其模型？" danger confirmButtonText="删除" cancelButtonText="取消" @confirm="deleteProvider(item)">
              <template #reference><uiButton variant="danger" :icon="IconTrash" :loading="deletingFile === item.fileName" :disabled="!!fetchingFile || !!deletingFile || !item.revision">删除</uiButton></template>
            </uiPopconfirm>
          </div>
        </div>
      </uiCard>
    </div>
    <div class="providerActions">
      <uiButton class="addButton" :icon="IconPlus" @click="openAdd('builtin')">添加供应商</uiButton>
      <uiButton class="addButton" :icon="IconSettings" @click="openAdd('custom')">添加自定义供应商</uiButton>
    </div>
    <component :is="mediaProviderDialog" v-model="providerDialogVisible" :mode="addMode" @added="saveProviderItem" />
    <component :is="editProviderDialog" v-model="editorVisible" :provider="editingProvider" @saved="saveProviderItem" />
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, ref, shallowRef, type Component } from "vue";
import { uiCard, uiTag, uiButton, uiPopconfirm, uiAlert, useUiFeedback } from "@toonflow/ui";
import { IconPlus, IconSettings, IconEdit, IconTrash, IconDownload } from "@tabler/icons-vue";
import logoUrl from "@toonflow/assets/logo.svg";
import type { MediaProvider } from "./types";
import { settings, saveSettings } from "@/stores/settings";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import tfAccount from "../../tfAccount.vue";

const feedback = useUiFeedback();
const { visible = true } = defineProps<{ visible?: boolean }>();
const mediaProviderDialog = shallowRef<Component>();
const editProviderDialog = shallowRef<Component>();
const providers = ref<MediaProvider[]>([]);
const sortedProviders = computed(() => [...providers.value].sort((a, b) => Number(b.id.toLowerCase() === "tfrouter") - Number(a.id.toLowerCase() === "tfrouter")));
const loaded = ref(false);
const providerDialogVisible = ref(false);
const editorVisible = ref(false);
const addMode = ref<"builtin" | "custom">("builtin");
const editingProvider = ref<MediaProvider>();
const deletingFile = ref("");
const fetchingFile = ref("");
let loadRequest = 0;

function getProviderApiKey(id: string) {
  const configs = settings.value.mediaProviderConfigs as Record<string, { apiKey?: unknown }> | undefined;
  const apiKey = configs?.[id]?.apiKey;
  return typeof apiKey === "string" ? apiKey : "";
}

async function saveProviderApiKey(id: string, key: string) {
  await saveSettings(settings => {
    const configs = settings.mediaProviderConfigs;
    const current = configs && typeof configs === "object" && !Array.isArray(configs) ? configs as Record<string, unknown> : {};
    const existing = current[id];
    const config = existing && typeof existing === "object" && !Array.isArray(existing) ? existing as Record<string, unknown> : {};
    return { mediaProviderConfigs: { ...current, [id]: { ...config, apiKey: key } } };
  });
}

function refreshInstalled(event: WindowEventMap["toonflow:plugin-installed"]) {
  if (event.detail.type === "provider") void loadProviders();
}
onMounted(() => {
  void loadProviders();
  window.addEventListener("toonflow:plugin-installed", refreshInstalled);
});
onBeforeUnmount(() => {
  loadRequest++;
  window.removeEventListener("toonflow:plugin-installed", refreshInstalled);
});

async function loadProviders() {
  const request = ++loadRequest;
  try {
    const { data } = await axios.get<{ data: MediaProvider[] }>("/api/providers/media/list");
    if (request === loadRequest) providers.value = data.data;
  } catch (error) {
    if (request === loadRequest) showError(axios.isAxiosError(error) ? error.response?.data?.message || error.message : "读取媒体供应商失败");
  } finally {
    if (request === loadRequest) loaded.value = true;
  }
}

function openAdd(mode: "builtin" | "custom") {
  mediaProviderDialog.value ??= defineAsyncComponent(() => import("./addCustomProviderDialog.vue"));
  addMode.value = mode;
  providerDialogVisible.value = true;
}

function editProvider(provider: MediaProvider) {
  if (fetchingFile.value || deletingFile.value || provider.loadError) return;
  editProviderDialog.value ??= defineAsyncComponent(() => import("./editProviderDialog.vue"));
  editingProvider.value = provider;
  editorVisible.value = true;
}

async function fetchModels(provider: MediaProvider) {
  if (fetchingFile.value || deletingFile.value || !provider.modelsUrl || !provider.revision || provider.loadError) return;
  fetchingFile.value = provider.fileName;
  try {
    const { data } = await axios.post<{ code: number; data: MediaProvider; message: string }>("/api/providers/media/models", {
      fileName: provider.fileName, revision: provider.revision,
    }, { timeout: 35000 });
    if (data.code !== 200 || !data.data) throw new Error(data.message || "获取模型失败");
    saveProviderItem(data.data);
    invalidateNodeModels("media");
    feedback.message({ tone: "success", message: "模型列表已更新" });
  } catch (error) {
    showError(axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "获取模型失败，请重试");
  } finally { fetchingFile.value = ""; }
}

async function deleteProvider(provider: MediaProvider) {
  if (fetchingFile.value || deletingFile.value || !provider.revision) return;
  deletingFile.value = provider.fileName;
  let deleted = false;
  try {
    await axios.delete("/api/providers/media/delete", { data: { fileName: provider.fileName, revision: provider.revision } });
    deleted = true;
    loadRequest++;
    invalidateNodeModels("media");
    providers.value = providers.value.filter(item => item.fileName !== provider.fileName);
    await saveSettings(settings => {
      const configs = settings.mediaProviderConfigs;
      if (!configs || typeof configs !== "object" || Array.isArray(configs) || !Object.hasOwn(configs, provider.id)) return;
      const current = { ...configs } as Record<string, unknown>;
      delete current[provider.id];
      return { mediaProviderConfigs: current };
    });
  } catch (error) {
    const message = axios.isAxiosError(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "删除失败，请重试";
    showError(deleted ? `供应商已删除，连接配置未清理：${message}` : message);
  } finally { deletingFile.value = ""; }
}

function saveProviderItem(provider: MediaProvider) {
  loadRequest++;
  const index = providers.value.findIndex(item => item.fileName === provider.fileName);
  if (index < 0) providers.value.push(provider);
  else providers.value.splice(index, 1, provider);
}
function showError(message: string) { feedback.message({ tone: "error", message }); }
</script>

<style lang="scss" scoped src="../../providerList.scss"></style>

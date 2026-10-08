<template>
  <section class="tfAccount" aria-label="TF-Router 账户" :aria-busy="loading || saving">
    <div v-if="apiKey" class="accountHeader">
      <div class="accountBalance"><span class="metricLabel">账户余额</span><uiSkeleton v-if="loading && !balance" class="balancePlaceholder" :rows="1" /><strong v-else class="balanceNumber">{{ balance ? numberFormat.format(balance.balance) : "—" }}</strong></div>
      <div class="accountActions"><uiIconButton variant="ghost" :icon="IconRefresh" :loading="loading" :disabled="!apiKey" label="刷新余额" title="刷新余额" @click="refresh" /><uiButton variant="secondary" :icon="IconCreditCard" :disabled="!apiKey" @click="openRecharge">充值</uiButton></div>
    </div>
    <div v-if="!apiKey" class="accountSetup"><p>填写 API Key 开始使用官方供应商</p><div class="setupForm"><uiInput v-model="draftKey" type="password" showPassword autocomplete="off" placeholder="粘贴 API Key" aria-label="TF-Router API Key" :disabled="saving" @keyup.enter="submitKey" /><uiButton :loading="saving || fetchingModels" :disabled="!draftKey.trim()" @click="submitKey">保存</uiButton></div><uiAlert v-if="setupError" :title="setupError" tone="error" /><uiButton tag="a" href="https://api.toonflow.net/" target="_blank" rel="noopener noreferrer" variant="ghost" size="small" :icon="IconExternalLink">前往 TF-Router 官网 获取 API Key</uiButton></div>
    <uiAlert v-else-if="errorMessage" class="accountError" :title="errorMessage" tone="error"><uiButton variant="secondary" size="small" :disabled="loading" @click="refresh">重试</uiButton></uiAlert>
    <dl v-if="balance" class="accountDetails"><div class="accountMetric"><dt>密钥余额</dt><dd>{{ balance.keyBalance === null ? "无限制" : numberFormat.format(balance.keyBalance) }}</dd></div><div class="accountMetric"><dt>累计消费</dt><dd>{{ numberFormat.format(balance.totalConsumption) }}</dd></div><div class="accountMetric"><dt>累计充值</dt><dd>{{ numberFormat.format(balance.totalRecharge) }}</dd></div></dl>
    <component :is="rechargeDialog" v-model="rechargeVisible" :apiKey="apiKey" />
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, watch, type Component } from "vue";
import axios from "axios";
import { uiButton, uiIconButton, uiInput, uiSkeleton, uiAlert } from "@toonflow/ui";
import { IconCreditCard, IconExternalLink, IconRefresh } from "@tabler/icons-vue";
import tf, { type TfBalance } from "@/lib/tf";
import type { CustomProvider, CustomProviderModel } from "@/stores/settings";

const props = withDefaults(defineProps<{
  apiKey: string;
  visible?: boolean;
  modelProvider?: Pick<CustomProvider, "apiUrl" | "protocol">;
  saveApiKey: (key: string, models?: CustomProviderModel[]) => Promise<void>;
}>(), { visible: true });
const rechargeDialog = shallowRef<Component>();
const rechargeVisible = ref(false);
const apiKey = computed(() =>
  props.apiKey
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim()
);
const balance = ref<TfBalance>();
const loading = ref(false);
const errorMessage = ref("");
const draftKey = ref("");
const saving = ref(false);
const setupError = ref("");
const fetchingModels = ref(false);
const draftModels = shallowRef<CustomProviderModel[]>();
const numberFormat = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 6 });
let controller: AbortController | undefined;
let rechargeKey = "";

function openRecharge() {
  if (!apiKey.value || !props.visible) return;
  rechargeKey = apiKey.value;
  rechargeDialog.value ??= defineAsyncComponent(() => import("./tfRechargeDialog.vue"));
  rechargeVisible.value = true;
}

async function submitKey() {
  const key = draftKey.value.trim();
  if (!key || saving.value || fetchingModels.value) return;
  saving.value = true;
  setupError.value = "";
  try {
    await props.saveApiKey(key, draftModels.value);
    draftKey.value = "";
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "保存失败" : error instanceof Error ? error.message : "保存失败";
    setupError.value = `${message}；当前填写的内容已保留，请重试`;
  } finally {
    saving.value = false;
  }
}

watch(
  [draftKey, () => props.visible, () => props.modelProvider?.apiUrl, () => props.modelProvider?.protocol],
  ([key, visible, apiUrl, protocol], _previous, onCleanup) => {
    draftModels.value = undefined;
    fetchingModels.value = false;
    setupError.value = "";
    if (!visible || !apiUrl || !protocol || !key.trim()) return;
    const request = new AbortController();
    fetchingModels.value = true;
    const timer = setTimeout(async () => {
      try {
        const { data } = await axios.post("/api/providers/models", { apiUrl, protocol, apiKey: key.trim() }, { signal: request.signal, timeout: 35000 });
        if (request.signal.aborted) return;
        if (data.code !== 200 || !Array.isArray(data.data)) throw new Error(data.message || "获取模型列表失败");
        if (!data.data.length) throw new Error("未获取到可用模型，请检查 API Key 后重试");
        draftModels.value = data.data;
      } catch (error) {
        if (!request.signal.aborted) setupError.value = axios.isAxiosError(error)
          ? error.response?.data?.message || "获取模型列表失败，请检查 API Key 后重试"
          : error instanceof Error ? error.message : "获取模型列表失败";
      } finally {
        if (!request.signal.aborted) fetchingModels.value = false;
      }
    }, 500);
    onCleanup(() => { clearTimeout(timer); request.abort(); });
  },
  { flush: "sync" },
);

async function refresh() {
  controller?.abort();
  loading.value = false;
  errorMessage.value = "";
  if (!apiKey.value || !props.visible) return;
  const request = new AbortController();
  controller = request;
  loading.value = true;
  try {
    const result = await tf.getBalance({ apiKey: apiKey.value, signal: request.signal });
    if (!request.signal.aborted) balance.value = result;
  } catch (error) {
    if (!request.signal.aborted) {
      errorMessage.value = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
        ? error.message
        : "余额查询失败，请重试";
    }
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}

watch(
  [apiKey, () => props.visible],
  () => {
    rechargeVisible.value = false;
    balance.value = undefined;
    draftKey.value = "";
    setupError.value = "";
    void refresh();
  },
  { immediate: true }
);
watch(rechargeVisible, (isOpen, wasOpen) => {
  if (wasOpen && !isOpen && rechargeKey === apiKey.value && props.visible) void refresh();
});
onBeforeUnmount(() => controller?.abort());
</script>

<style lang="scss" scoped>
.tfAccount {
  display: flex; flex-direction: column; gap: 20px; min-width: 0; margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--uiBorderDefault);
  .accountHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; .accountBalance { display: flex; flex-direction: column; gap: 8px; min-width: 0; .metricLabel { color: var(--uiTextMuted); font-size: var(--uiFontControl); } .balanceNumber { color: var(--uiTextPrimary); font-size: var(--uiFontTitle); line-height: 1.5; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; } .balancePlaceholder { width: 160px; :deep(.skeletonLine) { width: 100%; height: 28px; } } } .accountActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; } }
  .accountSetup { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; min-width: 0; p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; } .setupForm { display: flex; flex-wrap: wrap; gap: 12px; width: 100%; :deep(.uiInput) { flex: 1 1 240px; min-width: 0; } } }
  .accountDetails { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; margin: 0; .accountMetric { display: flex; flex-direction: column; gap: 8px; min-width: 0; font-size: var(--uiFontControl); dt { color: var(--uiTextMuted); } dd { margin: 0; color: var(--uiTextBody); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; } } }
  @media (max-width: 700px) { .accountDetails { grid-template-columns: minmax(0, 1fr); gap: 16px; } }
}
</style>

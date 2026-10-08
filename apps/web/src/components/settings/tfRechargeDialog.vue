<template>
  <uiDialog v-model="visible" title="TF-Router 充值" :width="600" destroyOnClose :closeOnClickModal="false" :closeOnPressEscape="!creating" :showClose="!creating">
    <div class="rechargeContent">
      <form v-if="!payment" class="rechargeForm" @submit.prevent="createPayment">
        <uiField label="充值套餐"><uiSkeleton v-if="loadingSkus" :rows="3" /><template v-else><div v-if="skuError" class="skuError"><uiAlert :title="skuError" tone="error" /><uiButton variant="ghost" size="small" :disabled="creating" @click="loadSkus">重试</uiButton></div><div class="rechargeOptions" role="radiogroup" aria-label="充值套餐"><uiRadio v-for="sku in skus" :key="sku.id" v-model="selectedSkuId" :value="sku.id" :name="skuGroupName" border :disabled="creating"><span class="skuInfo"><strong class="skuPrice">{{ moneyFormat.format(sku.price) }}</strong><span v-if="sku.describe" class="skuDescription">{{ sku.describe }}</span></span></uiRadio><div class="customOption"><uiRadio v-model="selectedSkuId" :value="-1" :name="skuGroupName" border :disabled="creating">自定义金额</uiRadio></div></div></template></uiField>
        <uiField v-if="!loadingSkus && selectedSkuId === -1" label="充值金额（元）"><uiNumberInput v-model="amount" :min="0.01" :max="50000" :precision="2" :step="1" :disabled="creating" placeholder="输入充值金额" aria-label="充值金额（元）" /></uiField>
        <uiField label="支付方式"><uiRadioGroup :modelValue="payType" :options="paymentMethods" variant="segmented" :disabled="creating" aria-label="支付方式" @update:modelValue="value => (value === 'wechat' || value === 'alipay') && (payType = value)" /></uiField>
      </form>
      <div v-else class="paymentDetails">
        <strong class="paymentAmount">{{ moneyFormat.format(paymentAmount) }}</strong>
        <template v-if="paymentLink"><template v-if="payType === 'wechat'"><uiImage class="paymentQr" :src="paymentLink" fit="contain" alt="微信支付二维码" loading="eager"><template #error><uiAlert title="二维码图片加载失败" tone="error" /></template></uiImage><p>使用微信扫码支付</p></template><template v-else><p>请在浏览器中完成支付宝支付</p><uiButton tag="a" :href="paymentLink" target="_blank" rel="noopener noreferrer" variant="secondary" :icon="IconExternalLink">打开支付页面</uiButton></template></template>
        <uiAlert v-else title="订单已创建，但接口未返回有效的支付链接" tone="warning" />
        <dl class="orderInfo"><dt>订单号</dt><dd>{{ payment.orderNumber }}</dd></dl><p class="paymentHint">支付后关闭窗口，将自动刷新账户余额。</p>
      </div>
      <uiAlert v-if="errorMessage" :title="errorMessage" tone="error" />
    </div>
    <template #footer><uiButton variant="secondary" :disabled="creating" @click="visible = false">{{ payment ? '关闭' : '取消' }}</uiButton><uiButton v-if="!payment" :icon="IconCreditCard" :loading="creating" :disabled="!canPay" @click="createPayment">{{ payType === 'wechat' ? '获取支付二维码' : '前往支付宝支付' }}</uiButton><uiButton v-else :icon="IconRefresh" @click="visible = false">查看余额</uiButton></template>
  </uiDialog>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { uiDialog, uiField, uiSkeleton, uiAlert, uiButton, uiRadio, uiRadioGroup, uiNumberInput, uiImage } from "@toonflow/ui";
import { IconBrandAlipay, IconBrandWechat, IconCreditCard, IconExternalLink, IconRefresh } from "@tabler/icons-vue";
import tf, { type TfPayment, type TfPayParams, type TfRechargeSku } from "@/lib/tf";

const props = defineProps<{ apiKey: string }>();
const skuGroupName = "rechargeSkus-" + useId();
const paymentMethods = [{ value: "wechat", label: "微信支付", icon: IconBrandWechat }, { value: "alipay", label: "支付宝", icon: IconBrandAlipay }];
const visible = defineModel<boolean>({ default: false });
const amount = ref<number>();
const skus = ref<TfRechargeSku[]>([]);
const selectedSkuId = ref(-1);
const loadingSkus = ref(false);
const skuError = ref("");
const payType = ref<TfPayParams["payType"]>("wechat");
const payment = ref<TfPayment>();
const paymentAmount = ref(0);
const creating = ref(false);
const errorMessage = ref("");
const moneyFormat = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });
const selectedAmount = computed(() => selectedSkuId.value === -1 ? amount.value : skus.value.find(sku => sku.id === selectedSkuId.value)?.price);
const canPay = computed(() => !!props.apiKey.trim() && !loadingSkus.value && typeof selectedAmount.value === "number"
  && Number.isFinite(selectedAmount.value) && selectedAmount.value >= 0.01 && (selectedSkuId.value !== -1 || selectedAmount.value <= 50000));
const paymentLink = computed(() => {
  const url = payment.value?.payUrl;
  return url && URL.canParse(url) && ["http:", "https:"].includes(new URL(url).protocol) ? url : "";
});
let controller: AbortController | undefined;
let skuController: AbortController | undefined;

async function loadSkus() {
  skuController?.abort();
  if (!visible.value || !props.apiKey.trim()) return;
  const request = new AbortController();
  skuController = request;
  loadingSkus.value = true;
  skuError.value = "";
  try {
    const result = await tf.getRechargeData({ apiKey: props.apiKey, signal: request.signal });
    if (request.signal.aborted) return;
    skus.value = result;
    selectedSkuId.value = result[0]?.id ?? -1;
  } catch (error) {
    if (!request.signal.aborted) {
      skuError.value = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error ? error.message : "读取充值套餐失败，请重试";
    }
  } finally {
    if (!request.signal.aborted) loadingSkus.value = false;
  }
}

async function createPayment() {
  if (creating.value || payment.value || !canPay.value || !visible.value) return;
  controller?.abort();
  const request = new AbortController();
  controller = request;
  creating.value = true;
  errorMessage.value = "";
  const money = selectedAmount.value!;
  try {
    const result = await tf.pay({ comboId: selectedSkuId.value, ...(selectedSkuId.value === -1 ? { customMoney: money } : {}), payType: payType.value }, { apiKey: props.apiKey, signal: request.signal });
    if (request.signal.aborted) return;
    paymentAmount.value = money;
    payment.value = result;
    if (payType.value === "alipay" && paymentLink.value) window.open(paymentLink.value, "_blank", "noopener,noreferrer");
  } catch (error) {
    if (!request.signal.aborted) {
      errorMessage.value = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error ? error.message : "创建充值订单失败，请重试";
    }
  } finally {
    if (!request.signal.aborted) creating.value = false;
  }
}

watch([visible, () => props.apiKey], () => {
  controller?.abort();
  skuController?.abort();
  creating.value = false;
  loadingSkus.value = false;
  skus.value = [];
  selectedSkuId.value = -1;
  skuError.value = "";
  payment.value = undefined;
  errorMessage.value = "";
  amount.value = undefined;
  if (visible.value) void loadSkus();
}, { immediate: true });
onBeforeUnmount(() => {
  controller?.abort();
  skuController?.abort();
});
</script>

<style lang="scss" scoped>
.rechargeContent {
  display: flex; flex-direction: column; gap: 24px; min-width: 0;
  .rechargeForm { display: flex; flex-direction: column; gap: 24px; min-width: 0; .skuError { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; } .rechargeOptions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; :deep(.uiRadio) { align-items: flex-start; min-height: 88px; padding: 16px; .radioMark { margin-top: 4px; } } .skuInfo { display: flex; flex-direction: column; gap: 8px; min-width: 0; .skuPrice { font-size: var(--uiFontTitle); font-weight: 600; font-variant-numeric: tabular-nums; } .skuDescription { color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; overflow-wrap: anywhere; } } .customOption { grid-column: 1 / -1; :deep(.uiRadio) { width: 100%; align-items: center; min-height: 40px; } } } }
  .paymentDetails { display: flex; flex-direction: column; align-items: center; gap: 20px; min-width: 0; text-align: center; .paymentAmount { color: var(--uiTextPrimary); font-size: var(--uiFontHeading); font-variant-numeric: tabular-nums; } .paymentQr { width: 240px; height: 240px; max-width: 100%; padding: 8px; background: #fff; border-radius: var(--uiRadiusControl); :deep(.uiAlert) { position: absolute; inset: 0; } } p { margin: 0; color: var(--uiTextBody); font-size: var(--uiFontControl); line-height: 1.7; } .orderInfo { display: flex; flex-direction: column; gap: 8px; margin: 0; width: 100%; font-size: var(--uiFontControl); dt { color: var(--uiTextMuted); } dd { margin: 0; color: var(--uiTextBody); overflow-wrap: anywhere; } } .paymentHint { color: var(--uiTextMuted); } }
  @media (max-width: 480px) { .rechargeForm .rechargeOptions { grid-template-columns: minmax(0, 1fr); } }
}
</style>

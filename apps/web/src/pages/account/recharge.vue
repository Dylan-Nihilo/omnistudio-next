<template>
  <accountShell title="积分充值" eyebrow="个人账户" description="按创作计划补充积分，支付完成后自动记入个人账户。">
    <template #actions>
      <uiButton variant="secondary" :loading="loading" @click="loadPage">刷新账户</uiButton>
      <uiButton variant="secondary" @click="router.push('/account')">返回账户</uiButton>
    </template>
    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>

    <section class="rechargeHero" aria-label="充值比例">
      <div class="heroCopy">
        <span class="heroEyebrow"><icon-sparkles :size="14" aria-hidden="true" />创作算力补给</span>
        <h2>为下一段灵感，<span>备好算力。</span></h2>
        <p>积分用于万象点点内的 AI 创作与制作服务，支付核验成功后自动到账。</p>
      </div>
      <div class="heroRate"><span>充值比例</span><strong>{{ catalog?.creditsPerYuan ?? 10 }}</strong><small>积分 / 元</small></div>
      <div class="heroMark" aria-hidden="true">W</div>
    </section>

    <section class="balanceStrip" aria-label="个人积分余额">
      <div class="balanceHeading"><icon-coins :size="19" aria-hidden="true" /><span>账户余额</span></div>
      <div class="balanceValue"><strong>{{ formatCredits(wallet?.available) }}</strong><span>可用积分</span></div>
      <div class="balanceMeta"><span>冻结 {{ formatCredits(wallet?.frozen) }}</span><i aria-hidden="true"></i><span>总额 {{ formatCredits(wallet?.total) }}</span></div>
    </section>

    <div class="rechargeLayout">
      <section class="packageSection" aria-labelledby="packageTitle">
        <header class="sectionHeader">
          <div><span class="sectionIndex">01 / 套餐</span><h2 id="packageTitle">选择积分档位</h2><p>按 {{ catalog?.creditsPerYuan ?? 10 }} 积分 / 元换算，不含额外赠送积分。</p></div>
          <span v-if="catalogLoading" class="catalogState">正在读取套餐</span>
        </header>
        <div v-if="catalog?.packages.length" class="packageGrid" role="group" aria-label="充值档位">
          <button v-for="item in catalog.packages" :key="item.id" type="button" class="packageOption" :class="{ selected: selectedPackageId === item.id }" :aria-pressed="selectedPackageId === item.id" @click="selectedPackageId = item.id">
            <span v-if="item.badge" class="packageBadge">{{ item.badge }}</span>
            <span class="packageName">{{ item.name }}</span>
            <span class="packagePrice"><small>¥</small>{{ formatYuan(item.amountCents) }}</span>
            <span class="packageCredits">{{ formatCredits(item.credits) }} 积分</span>
            <span class="packageDescription">{{ item.description }}</span>
            <span class="packageSelectMark" aria-hidden="true"><icon-check v-if="selectedPackageId === item.id" :size="13" /></span>
          </button>
        </div>
        <div v-else-if="!catalogLoading" class="catalogError" role="status">{{ errorMessage || '充值套餐暂不可用，请稍后刷新。' }}</div>

        <div class="paymentSection">
          <header class="sectionHeader compactHeader">
            <div><span class="sectionIndex">02 / 支付</span><h2>选择支付方式</h2><p>订单支付成功后由服务端核验并入账。</p></div>
          </header>
          <div class="paymentMethods" role="group" aria-label="支付方式">
            <button v-for="method in paymentMethods" :key="method.id" type="button" class="paymentOption" :class="[{ selected: selectedMethod === method.id }, `method${method.id}`]" :aria-pressed="selectedMethod === method.id" @click="selectedMethod = method.id">
              <span class="methodIcon"><icon-brand-wechat v-if="method.id === 'wechat'" :size="22" aria-hidden="true" /><span v-else aria-hidden="true">支</span></span>
              <span class="methodText"><strong>{{ method.label }}</strong><small>{{ method.enabled ? '扫码或跳转支付' : '支付通道待接入' }}</small></span>
              <span class="methodStatus" :class="{ enabled: method.enabled }">{{ method.enabled ? '可用' : '即将接入' }}</span>
              <span class="methodSelectMark" aria-hidden="true"><icon-check v-if="selectedMethod === method.id" :size="12" /></span>
            </button>
          </div>
        </div>

        <section class="purchaseNotes" aria-labelledby="notesTitle">
          <header><icon-shield-check :size="18" aria-hidden="true" /><h2 id="notesTitle">购买须知</h2><button type="button" class="textLink" @click="openAgreement('purchase')">查看完整须知 <icon-arrow-up-right :size="13" aria-hidden="true" /></button></header>
          <div class="notesGrid">
            <p><strong>到账方式</strong><span>支付渠道确认成功后，积分自动记入当前个人账户。</span></p>
            <p><strong>使用范围</strong><span>积分用于平台内创作与制作服务；不可提现，团队内划转按平台功能办理。</span></p>
            <p><strong>有效期限</strong><span>本页套餐未单独标注期限的积分长期有效。</span></p>
            <p><strong>订单处理</strong><span>未支付订单 15 分钟后失效；已支付但未到账可凭订单号联系支持。</span></p>
          </div>
        </section>
      </section>

      <aside class="checkoutPanel" aria-labelledby="checkoutTitle">
        <div class="checkoutTopline"><span>ORDER SUMMARY</span><icon-receipt :size="17" aria-hidden="true" /></div>
        <h2 id="checkoutTitle">确认订单</h2>
        <div v-if="selectedPackage" class="selectedSummary">
          <div><span>充值套餐</span><strong>{{ selectedPackage.name }}</strong></div>
          <div><span>到账积分</span><strong>{{ formatCredits(selectedPackage.credits) }}</strong></div>
          <div><span>支付方式</span><strong>{{ selectedMethodLabel }}</strong></div>
        </div>
        <div class="amountDue"><span>应付金额</span><strong><small>¥</small>{{ selectedPackage ? formatYuan(selectedPackage.amountCents) : '—' }}</strong></div>
        <label class="agreementRow">
          <input v-model="agreementAccepted" type="checkbox" :disabled="submitting || !selectedPackage" />
          <span>我已阅读并同意 <button type="button" class="textLink" @click.prevent="openAgreement('credits')">《积分用户协议》</button>、<button type="button" class="textLink" @click.prevent="openAgreement('service')">《用户服务协议》</button>、<button type="button" class="textLink" @click.prevent="openAgreement('purchase')">《购买须知》</button>，并已阅读<button type="button" class="textLink" @click.prevent="openAgreement('privacy')">《隐私政策》</button></span>
        </label>
        <uiButton class="checkoutButton" variant="primary" :loading="submitting" :disabled="!selectedPackage || !selectedMethodAvailable || !agreementAccepted || submitting" @click="submitOrder">{{ selectedMethodAvailable ? '创建充值订单' : '支付通道接入后开放' }} <icon-chevron-right :size="16" aria-hidden="true" /></uiButton>
        <p class="checkoutCaption"><icon-lock :size="13" aria-hidden="true" />{{ selectedMethodAvailable ? '订单由服务端确认，未完成支付不会扣款或发放积分。' : '所选支付通道暂未开放，不会创建订单、扣款或发放积分。' }}</p>
        <div class="supportLine"><span>需要企业采购？</span><button type="button" class="textLink" @click="openAgreement('purchase')">查看采购与开票说明</button></div>
      </aside>
    </div>

    <section class="orderSection" aria-labelledby="orderTitle">
      <header class="sectionHeader orderHeader"><div><span class="sectionIndex">ORDER HISTORY</span><h2 id="orderTitle">充值订单</h2><p>最近 20 笔订单</p></div><button type="button" class="refreshButton" :disabled="ordersLoading" aria-label="刷新订单" title="刷新订单" @click="loadOrders"><icon-refresh :size="17" :class="{ spinning: ordersLoading }" /></button></header>
      <div v-if="orders.length" class="orderList">
        <article v-for="order in orders" :key="order.id" class="orderRow">
          <span class="orderIcon"><icon-receipt :size="17" aria-hidden="true" /></span>
          <div class="orderMain"><strong>{{ order.packageName }}</strong><span>{{ order.id }} · {{ formatDate(order.createdAt) }}</span></div>
          <div class="orderCredits"><strong>{{ formatCredits(order.credits) }}</strong><span>积分</span></div>
          <div class="orderAmount"><strong>¥{{ formatYuan(order.amountCents) }}</strong><span>{{ methodLabel(order.paymentMethod) }}</span></div>
          <span class="orderStatus" :class="`status${order.status}`"><i aria-hidden="true"></i>{{ statusLabel(order.status) }}</span>
          <uiButton v-if="order.status === 'pending'" variant="secondary" size="small" @click="openOrder(order)">查看订单</uiButton>
        </article>
      </div>
      <div v-else-if="!ordersLoading" class="emptyOrders"><icon-clock :size="18" aria-hidden="true" /><span>还没有充值订单</span></div>
    </section>

    <uiDialog v-model="orderVisible" :title="currentOrder?.status === 'paid' ? '充值已到账' : '等待支付'" :width="640" :closeOnClickModal="false" destroyOnClose>
      <div v-if="currentOrder" class="orderDialog">
        <div class="orderDialogHeader" :class="{ completed: currentOrder.status === 'paid' }">
          <div class="dialogStatusIcon"><icon-circle-check v-if="currentOrder.status === 'paid'" :size="24" /><icon-clock v-else :size="24" /></div>
          <div><strong>{{ currentOrder.status === 'paid' ? '支付核验完成' : statusLabel(currentOrder.status) }}</strong><span>{{ currentOrder.status === 'paid' ? '积分已记入个人账户' : '订单创建后保留 15 分钟' }}</span></div>
        </div>
        <div class="dialogOrderInfo">
          <div><span>订单编号</span><strong>{{ currentOrder.id }}</strong></div>
          <div><span>充值档位</span><strong>{{ currentOrder.packageName }} · {{ formatCredits(currentOrder.credits) }} 积分</strong></div>
          <div><span>支付方式</span><strong>{{ methodLabel(currentOrder.paymentMethod) }}</strong></div>
          <div><span>应付金额</span><strong class="dialogAmount">¥{{ formatYuan(currentOrder.amountCents) }}</strong></div>
        </div>
        <div v-if="paymentInstruction?.type === 'qr' && currentOrder.status === 'pending'" class="paymentQr">
          <img :src="paymentInstruction.value" alt="支付二维码" />
          <span>请使用{{ methodLabel(currentOrder.paymentMethod) }}扫码完成支付</span>
        </div>
        <div v-else-if="currentOrder.status === 'pending'" class="paymentPending" role="status">
          <icon-info-circle :size="20" aria-hidden="true" /><p>{{ paymentMessage || '正在准备支付通道。' }}</p>
          <small>通道开放前不会扣款，订单也不会发放积分。</small>
        </div>
        <div v-else-if="currentOrder.status === 'paid'" class="paymentComplete" role="status"><icon-check :size="16" />到账 {{ formatCredits(currentOrder.credits) }} 积分</div>
        <div v-else class="paymentClosed" role="status">该订单已{{ statusLabel(currentOrder.status) }}，没有发生扣款。</div>
        <div class="dialogActions">
          <uiButton v-if="currentOrder.status === 'pending' && paymentInstruction?.type === 'redirect'" variant="primary" @click="goToPayment">前往{{ methodLabel(currentOrder.paymentMethod) }}支付 <icon-arrow-up-right :size="15" /></uiButton>
          <uiButton v-else-if="currentOrder.status === 'pending'" variant="primary" :loading="paymentLoading" @click="paymentInstruction ? refreshOrderStatus() : retryPayment">{{ paymentInstruction ? '检查支付状态' : '重试支付通道' }}</uiButton>
          <uiButton v-if="currentOrder.status === 'pending'" variant="secondary" :loading="cancelling" @click="cancelOrder">关闭订单</uiButton>
          <uiButton v-else variant="secondary" @click="orderVisible = false">完成</uiButton>
        </div>
      </div>
    </uiDialog>

    <uiDialog v-model="agreementVisible" :title="agreementTitle" :width="720" destroyOnClose>
      <div class="agreementDocument">
        <p class="agreementEffective">版本 {{ catalog?.termsVersion ?? 'recharge-2026-11-17-v2' }} · 更新于 2026 年 11 月 17 日</p>
        <section v-for="section in activeAgreement.sections" :key="section.heading">
          <h3>{{ section.heading }}</h3><p>{{ section.content }}</p>
        </section>
      </div>
    </uiDialog>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import axios from "axios";
import { useRouter } from "vue-router";
import { uiButton, uiDialog } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import { cancelRechargeOrder, createRechargeOrder, getRechargeCatalog, getRechargeOrder, getRechargeOrders, getWallet, startRechargePayment, type RechargeCatalog, type RechargeOrder, type RechargePackage, type RechargePaymentInstruction, type Wallet } from "@/lib/accountApi";
import { formatCredits } from "@/lib/creditFormat";

const router = useRouter();
const catalog = ref<RechargeCatalog>();
const wallet = ref<Wallet>();
const orders = ref<RechargeOrder[]>([]);
const selectedPackageId = ref("credits1000");
const selectedMethod = ref<"alipay" | "wechat">("alipay");
const agreementAccepted = ref(false);
const loading = ref(false);
const catalogLoading = ref(false);
const ordersLoading = ref(false);
const submitting = ref(false);
const paymentLoading = ref(false);
const cancelling = ref(false);
const errorMessage = ref("");
const orderVisible = ref(false);
const currentOrder = ref<RechargeOrder>();
const paymentInstruction = ref<RechargePaymentInstruction>();
const paymentMessage = ref("");
const agreementVisible = ref(false);
const agreementKind = ref<"credits" | "service" | "privacy" | "purchase">("credits");
let paymentPoll: number | undefined;

const selectedPackage = computed<RechargePackage | undefined>(() => catalog.value?.packages.find(item => item.id === selectedPackageId.value));
const paymentMethods = computed(() => catalog.value?.paymentMethods ?? []);
const selectedMethodLabel = computed(() => paymentMethods.value.find(method => method.id === selectedMethod.value)?.label ?? "请选择");
const selectedMethodAvailable = computed(() => paymentMethods.value.some(method => method.id === selectedMethod.value && method.enabled));
const agreementDocuments = computed(() => {
  const creditsPerYuan = catalog.value?.creditsPerYuan ?? 10;
  return {
    credits: {
      title: "积分用户协议",
      sections: [
        { heading: "一、积分性质与适用范围", content: `积分是万象点点平台内兑换创作、生成及制作服务的数字化额度，不是人民币、现金、预付款、存款、定金或储值凭证。当前充值换算为人民币 1 元兑换 ${creditsPerYuan} 积分；以购买时页面和服务端订单记录为准。` },
        { heading: "二、购买、到账与核验", content: "你选择套餐、支付方式并确认订单后，平台生成充值订单。支付机构确认收款并完成服务端验签后，积分才会入账。用户截图、浏览器跳转结果或自行提交的支付凭证不作为到账依据。若因系统或支付渠道原因导致积分数量不符，平台将依据订单及支付记录核验并处理差额。" },
        { heading: "三、积分使用与流转", content: "积分仅可兑换万象点点平台内服务，不可提现或兑换为法定货币。积分不得在平台外出售或交易；同一团队内的积分划转仅按平台实际提供的团队功能和规则办理。你应妥善保护账户，未经授权不得使用他人账户或代他人支付。" },
        { heading: "四、有效期与退款", content: "购买时单独注明有效期限的，按该套餐页面和订单记录执行；未单独标注期限的积分长期有效。积分属于在线交付的数字化商品，购买成功后原则上不支持任意退换；因平台或服务提供方原因导致无法按约使用、支付异常、法律法规要求退款或其他依法应处理的情形，可提交订单申请核验。已实际消耗的服务额度按法律规定和实际履行情况处理。" },
        { heading: "五、账户异常与帮助", content: "发现账户、订单或积分流水异常时，请保留订单编号并通过平台公布的支持渠道联系处理。平台可为保护账户及交易安全采取必要的核验、限制或冻结措施，并在核实后反馈处理结果。" },
      ],
    },
    service: {
      title: "用户服务协议",
      sections: [
        { heading: "一、账号与使用资格", content: "请使用真实、可验证的账号信息注册并妥善保管登录凭证。未成年人应在监护人指导和同意下使用涉及付费的服务。账号下发起的操作由账号使用者负责；发现未经授权的访问时，请及时通过平台支持渠道反馈。" },
        { heading: "二、平台服务", content: "平台提供 AI 创作、内容管理和制作工具。部分功能依赖你选择或平台配置的第三方模型与技术服务，其可用性、处理规则和输出结果受相应服务提供方影响。生成内容具有不确定性，请在使用或发布前自行核验。模型费用或积分消耗以操作前展示的预估及完成后的实际账单为准。" },
        { heading: "三、用户内容与行为", content: "你应确保对输入、上传及提交处理的文字、图片、音视频和其他内容拥有必要权利或授权，不得利用服务侵犯他人权益或从事违法活动。你保留依法享有的用户内容权利，并授权平台在提供、维护和保障你所请求服务所必需的范围内处理这些内容；所选第三方服务的处理以其条款和隐私政策为准。" },
        { heading: "四、服务调整与责任", content: "平台可能为维护安全、修复故障或更新产品而调整服务，并会在适当情况下告知。平台将按适用法律履行服务义务；因网络、第三方服务或不可抗力造成影响时，将在合理范围内协助处理。任何责任限制均不排除法律规定不得限制的责任。" },
        { heading: "五、协议更新与争议处理", content: "平台更新服务规则时会公布适用版本。涉及充值的规则以你确认订单时展示并记录的版本为准。协议适用中华人民共和国大陆地区法律；发生争议时，双方先协商处理，协商不成的依法向有管辖权的人民法院提起诉讼。" },
      ],
    },
    privacy: {
      title: "隐私政策",
      sections: [
        { heading: "一、我们处理的信息", content: "为提供账号和服务，我们处理邮箱、显示名称、密码验证信息及必要的会话凭证；为保障登录与系统安全，可能处理登录 IP、会话和安全事件记录。你使用创作功能时，平台会处理你提交的提示词、工作区文件、任务参数和生成结果。充值时会记录订单编号、套餐、金额、下单时间、支付方式、支付状态及必要的渠道交易标识。" },
        { heading: "二、处理目的与第三方服务", content: "上述信息用于注册登录、运行和保存你请求的服务、结算积分、处理售后、保障账号与交易安全以及履行法律义务。使用 AI 模型时，完成请求所必需的提示词或媒体内容会发送给你选择或平台配置的相应模型服务提供方。微信支付或支付宝接入后，完成交易所需的订单和金额信息会提供给你选择的支付机构；支付账号密码和银行卡凭证由支付机构处理，本平台不要求你向本平台提交这些凭证。" },
        { heading: "三、保存与安全", content: "平台按提供服务、保障安全和履行法定义务所需的期限保存相关信息。到期或处理目的完成后，将依法删除或匿名化处理；法律法规要求继续保存的除外。平台采取访问控制、凭证哈希和必要的安全措施保护账号及订单信息。第三方服务对信息的处理还受其自身条款和隐私政策约束。" },
        { heading: "四、你的权利与联系", content: "你可以通过账号设置访问或更正可自行维护的账号资料，并可通过平台公布的支持渠道申请查询、更正、删除或复制个人信息、撤回授权或注销账号。平台会依法核验身份并处理请求；法律法规要求留存或技术上暂不能删除的信息，将依法限制后续处理。" },
      ],
    },
    purchase: {
      title: "积分充值购买须知",
      sections: [
        { heading: "购买前请确认", content: `当前档位按人民币 1 元兑换 ${creditsPerYuan} 积分设置，不含额外赠送。应付金额、积分数量和支付方式会在订单确认前展示，请仔细核对。` },
        { heading: "支付与订单", content: "订单创建后保留 15 分钟。未完成支付的订单会失效；仅当支付机构确认并由服务端验签成功，订单才会变为已支付并发放积分。支付页面显示成功不代表平台已完成入账。" },
        { heading: "积分使用与有效期", content: "积分用于本平台的 AI 创作与制作服务，不可提现或在平台外交易；团队内划转以平台现有功能和规则为准。未单独标注期限的积分长期有效。任务消耗以发起前预估和完成后的账单为准。" },
        { heading: "退款、开票与企业采购", content: "支付失败、重复扣款、订单金额不符或支付成功未到账时，请保留订单号并通过平台支持渠道申请核验。退款按适用法律、服务履行状态和支付机构规则处理。企业采购、开票及对公付款以平台后续公布的信息为准。" },
      ],
    },
  };
});
const activeAgreement = computed(() => agreementDocuments.value[agreementKind.value]);
const agreementTitle = computed(() => activeAgreement.value.title);

function formatYuan(amountCents: number) {
  return (amountCents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
function methodLabel(method: RechargeOrder["paymentMethod"]) { return method === "alipay" ? "支付宝" : "微信支付"; }
function statusLabel(status: RechargeOrder["status"]) { return ({ pending: "待支付", paid: "已支付", cancelled: "已关闭", expired: "已失效" })[status]; }
function openAgreement(kind: "credits" | "service" | "privacy" | "purchase") { agreementKind.value = kind; agreementVisible.value = true; }
function errorText(error: unknown) {
  return axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || "连接中断，请刷新后确认结果"
    : error instanceof Error ? error.message : "操作失败，请重试";
}

async function loadOrders() {
  ordersLoading.value = true;
  try { orders.value = await getRechargeOrders(); }
  catch (error) { errorMessage.value = errorText(error); }
  finally { ordersLoading.value = false; }
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = "";
  catalogLoading.value = true;
  try {
    const [catalogResult, walletResult, ordersResult] = await Promise.allSettled([getRechargeCatalog(), getWallet(), getRechargeOrders()]);
    if (catalogResult.status === "fulfilled") {
      catalog.value = catalogResult.value;
      if (!catalogResult.value.packages.some(item => item.id === selectedPackageId.value)) selectedPackageId.value = catalogResult.value.packages[0]?.id ?? "";
      if (!catalogResult.value.paymentMethods.some(item => item.id === selectedMethod.value)) selectedMethod.value = catalogResult.value.paymentMethods[0]?.id ?? "alipay";
    } else errorMessage.value = errorText(catalogResult.reason);
    if (walletResult.status === "fulfilled") wallet.value = walletResult.value;
    else errorMessage.value ||= errorText(walletResult.reason);
    if (ordersResult.status === "fulfilled") orders.value = ordersResult.value;
    else errorMessage.value ||= errorText(ordersResult.reason);
  } finally {
    loading.value = false;
    catalogLoading.value = false;
  }
}

async function submitOrder() {
  const item = selectedPackage.value;
  if (!item || !selectedMethod.value || !selectedMethodAvailable.value || !agreementAccepted.value || submitting.value) return;
  submitting.value = true;
  errorMessage.value = "";
  try {
    const order = await createRechargeOrder(item.id, selectedMethod.value, catalog.value?.termsVersion ?? "", crypto.randomUUID());
    currentOrder.value = order;
    paymentInstruction.value = undefined;
    paymentMessage.value = "";
    orderVisible.value = true;
    await loadOrders();
    await retryPayment();
  } catch (error) { errorMessage.value = errorText(error); }
  finally { submitting.value = false; }
}

async function retryPayment() {
  if (!currentOrder.value || currentOrder.value.status !== "pending" || paymentLoading.value) return;
  paymentLoading.value = true;
  paymentMessage.value = "";
  try {
    paymentInstruction.value = await startRechargePayment(currentOrder.value.id);
    startPaymentPolling();
  } catch (error) {
    paymentInstruction.value = undefined;
    paymentMessage.value = errorText(error);
  } finally { paymentLoading.value = false; }
}

async function refreshOrderStatus() {
  const order = currentOrder.value;
  if (!order || paymentLoading.value) return;
  paymentLoading.value = true;
  try {
    currentOrder.value = await getRechargeOrder(order.id);
    if (currentOrder.value.status === "paid") {
      stopPaymentPolling();
      paymentInstruction.value = undefined;
      wallet.value = await getWallet();
      await loadOrders();
    }
  } catch (error) { paymentMessage.value = errorText(error); }
  finally { paymentLoading.value = false; }
}

function startPaymentPolling() {
  stopPaymentPolling();
  paymentPoll = window.setInterval(async () => {
    const order = currentOrder.value;
    if (!order || !orderVisible.value || order.status !== "pending") return stopPaymentPolling();
    try {
      currentOrder.value = await getRechargeOrder(order.id);
      if (currentOrder.value.status === "paid") {
        stopPaymentPolling();
        wallet.value = await getWallet();
        await loadOrders();
      }
    } catch (error) { paymentMessage.value = errorText(error); }
  }, 3000);
}

function stopPaymentPolling() {
  if (paymentPoll !== undefined) window.clearInterval(paymentPoll);
  paymentPoll = undefined;
}

function goToPayment() {
  if (paymentInstruction.value?.type === "redirect") window.location.assign(paymentInstruction.value.value);
}

async function cancelOrder() {
  const order = currentOrder.value;
  if (!order || order.status !== "pending" || cancelling.value) return;
  cancelling.value = true;
  try {
    currentOrder.value = await cancelRechargeOrder(order.id);
    stopPaymentPolling();
    paymentInstruction.value = undefined;
    await loadOrders();
  } catch (error) { paymentMessage.value = errorText(error); }
  finally { cancelling.value = false; }
}

async function openOrder(order: RechargeOrder) {
  currentOrder.value = order;
  paymentInstruction.value = undefined;
  paymentMessage.value = "";
  orderVisible.value = true;
  if (order.status === "pending") await retryPayment();
}

watch(orderVisible, visible => { if (!visible) stopPaymentPolling(); });
onMounted(loadPage);
onUnmounted(stopPaymentPolling);
</script>

<style lang="scss" scoped>
.pageError { margin: 0 0 18px; padding: 10px 12px; border-left: 3px solid var(--uiStatusError); color: var(--uiStatusError); background: color-mix(in srgb, var(--uiStatusError) 8%, transparent); font-size: var(--uiFontControl); line-height: 1.6; overflow-wrap: anywhere; }
.rechargeHero { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 24px; min-height: 184px; box-sizing: border-box; margin-bottom: 18px; padding: 28px 34px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--uiActionPrimary) 34%, var(--uiBorderDefault)); border-radius: 7px; background: linear-gradient(112deg, color-mix(in srgb, var(--uiActionPrimary) 13%, var(--uiSurfaceRaised)), var(--uiSurfaceRaised) 62%); .heroCopy { position: relative; z-index: 1; max-width: 620px; .heroEyebrow { display: inline-flex; align-items: center; gap: 7px; color: var(--uiActionPrimary); font-size: 12px; font-weight: 600; } h2 { margin: 12px 0 7px; font-size: 26px; line-height: 1.3; font-weight: 650; span { color: var(--uiActionPrimary); } } p { max-width: 540px; margin: 0; color: var(--uiTextMuted); font-size: 13px; line-height: 1.7; } } .heroRate { position: relative; z-index: 1; display: grid; justify-items: end; gap: 2px; min-width: 130px; padding-right: 16px; border-right: 1px solid color-mix(in srgb, var(--uiActionPrimary) 40%, transparent); span, small { color: var(--uiTextMuted); font-size: 11px; } strong { color: var(--uiTextPrimary); font-size: 34px; line-height: 1.1; font-variant-numeric: tabular-nums; } } .heroMark { position: absolute; right: 170px; top: -66px; color: color-mix(in srgb, var(--uiActionPrimary) 8%, transparent); font-family: Georgia, serif; font-size: 300px; font-weight: 700; line-height: 1; transform: rotate(-14deg); pointer-events: none; } }
.balanceStrip { display: grid; grid-template-columns: minmax(140px, .7fr) minmax(190px, 1fr) auto; align-items: center; gap: 22px; min-height: 82px; margin-bottom: 34px; padding: 14px 22px; box-sizing: border-box; border: 1px solid var(--uiBorderDefault); border-radius: 6px; background: var(--uiSurfaceRaised); .balanceHeading { display: flex; align-items: center; gap: 9px; color: var(--uiTextMuted); font-size: 13px; svg { color: var(--uiActionPrimary); } } .balanceValue { display: flex; align-items: baseline; flex-wrap: wrap; gap: 9px; strong { font-size: 25px; font-variant-numeric: tabular-nums; color: var(--uiTextPrimary); } span { color: var(--uiTextMuted); font-size: 11px; } } .balanceMeta { display: flex; align-items: center; justify-content: flex-end; gap: 12px; color: var(--uiTextMuted); font-size: 11px; i { width: 1px; height: 13px; background: var(--uiBorderDefault); } } }
.rechargeLayout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; align-items: start; gap: 30px; }
.packageSection { min-width: 0; }
.sectionHeader { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-bottom: 18px; .sectionIndex { color: var(--uiActionPrimary); font-size: 10px; font-weight: 700; letter-spacing: 0; } h2 { margin: 5px 0 4px; font-size: 18px; line-height: 1.4; } p { margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; } .catalogState { color: var(--uiTextMuted); font-size: 11px; } }
.packageGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.packageOption { position: relative; display: grid; justify-items: start; align-content: start; gap: 8px; min-width: 0; min-height: 155px; padding: 17px 16px 15px; border: 1px solid var(--uiBorderDefault); border-radius: 6px; color: var(--uiTextPrimary); background: var(--uiSurfaceRaised); text-align: left; font: inherit; cursor: pointer; transition: border-color .16s ease, background .16s ease, transform .16s ease; &:hover { border-color: color-mix(in srgb, var(--uiActionPrimary) 56%, var(--uiBorderDefault)); transform: translateY(-1px); } &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; } &.selected { border-color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 7%, var(--uiSurfaceRaised)); box-shadow: inset 0 0 0 1px var(--uiActionPrimary); } .packageBadge { position: absolute; top: 12px; right: 12px; padding: 3px 6px; border-radius: 3px; color: #16110e; background: #f4b84c; font-size: 9px; font-weight: 700; } .packageName { max-width: calc(100% - 40px); color: var(--uiTextMuted); font-size: 11px; } .packagePrice { display: flex; align-items: baseline; gap: 3px; font-size: 27px; font-weight: 650; line-height: 1.15; font-variant-numeric: tabular-nums; small { font-size: 14px; font-weight: 500; } } .packageCredits { color: var(--uiActionPrimary); font-size: 13px; font-weight: 650; font-variant-numeric: tabular-nums; } .packageDescription { color: var(--uiTextMuted); font-size: 10px; line-height: 1.5; } .packageSelectMark { position: absolute; right: 12px; bottom: 12px; display: grid; place-items: center; width: 18px; height: 18px; border: 1px solid var(--uiBorderDefault); border-radius: 50%; color: white; background: transparent; } &.selected .packageSelectMark { border-color: var(--uiActionPrimary); background: var(--uiActionPrimary); } }
.catalogError { padding: 24px; border: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); text-align: center; font-size: 12px; }
.paymentSection { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--uiBorderDefault); }
.compactHeader { margin-bottom: 14px; }
.paymentMethods { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.paymentOption { display: flex; align-items: center; gap: 11px; min-width: 0; min-height: 66px; padding: 10px 12px; border: 1px solid var(--uiBorderDefault); border-radius: 5px; color: var(--uiTextPrimary); background: var(--uiSurfaceRaised); text-align: left; font: inherit; cursor: pointer; &:hover { border-color: var(--uiBorderFocus); } &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; } &.selected { border-color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 6%, var(--uiSurfaceRaised)); } .methodIcon { display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; border: 1px solid var(--uiBorderDefault); border-radius: 5px; color: #1677ff; background: var(--uiBackgroundBase); font-size: 19px; font-weight: 700; } &.methodwechat .methodIcon { color: #31a56b; } .methodText { display: grid; gap: 3px; min-width: 0; flex: 1; strong { font-size: 12px; } small { color: var(--uiTextMuted); font-size: 9px; } } .methodStatus { flex: 0 0 auto; color: var(--uiTextMuted); font-size: 9px; &.enabled { color: var(--uiStatusSuccess); } } .methodSelectMark { display: grid; place-items: center; flex: 0 0 16px; width: 16px; height: 16px; border: 1px solid var(--uiBorderDefault); border-radius: 50%; color: white; } &.selected .methodSelectMark { border-color: var(--uiActionPrimary); background: var(--uiActionPrimary); } }
.purchaseNotes { margin-top: 30px; padding: 19px 0 0; border-top: 1px solid var(--uiBorderDefault); > header { display: flex; align-items: center; gap: 8px; margin-bottom: 13px; svg { color: var(--uiActionPrimary); } h2 { margin: 0; font-size: 13px; } .textLink { margin-left: auto; } } .notesGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px 20px; p { display: grid; gap: 4px; margin: 0; strong { font-size: 10px; font-weight: 600; } span { color: var(--uiTextMuted); font-size: 10px; line-height: 1.65; } } } }
.textLink { display: inline-flex; align-items: center; gap: 3px; padding: 0; border: 0; color: var(--uiActionPrimary); background: transparent; font: inherit; font-size: 10px; text-decoration: none; cursor: pointer; &:hover { text-decoration: underline; } &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: 3px; } }
.checkoutPanel { position: sticky; top: 20px; min-width: 0; padding: 20px; border: 1px solid var(--uiBorderDefault); border-radius: 6px; background: color-mix(in srgb, var(--uiSurfaceRaised) 84%, var(--uiBackgroundSubtle)); .checkoutTopline { display: flex; align-items: center; justify-content: space-between; color: var(--uiTextMuted); font-size: 9px; font-weight: 700; letter-spacing: 0; svg { color: var(--uiActionPrimary); } } h2 { margin: 13px 0 19px; font-size: 17px; } .selectedSummary { display: grid; gap: 13px; padding-bottom: 17px; border-bottom: 1px solid var(--uiBorderDefault); > div { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; span { flex: 0 0 auto; color: var(--uiTextMuted); font-size: 10px; } strong { min-width: 0; overflow-wrap: anywhere; font-size: 11px; font-weight: 550; text-align: right; } } } .amountDue { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 17px 0; span { color: var(--uiTextMuted); font-size: 11px; } strong { color: var(--uiActionPrimary); font-size: 30px; font-weight: 650; font-variant-numeric: tabular-nums; small { margin-right: 3px; font-size: 14px; } } } .agreementRow { display: flex; align-items: flex-start; gap: 8px; padding: 11px 0; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 10px; line-height: 1.7; cursor: pointer; input { flex: 0 0 15px; width: 15px; height: 15px; margin: 2px 0 0; accent-color: var(--uiActionPrimary); } .textLink { font-size: inherit; } } .checkoutButton { display: flex; justify-content: center; width: 100%; min-height: 42px; margin-top: 6px; gap: 8px; } .checkoutCaption { display: flex; align-items: flex-start; gap: 6px; margin: 12px 0 0; color: var(--uiTextMuted); font-size: 9px; line-height: 1.6; svg { flex: 0 0 auto; margin-top: 1px; } } .supportLine { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 18px; padding-top: 13px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 9px; } }
.orderSection { margin-top: 42px; padding-top: 25px; border-top: 1px solid var(--uiBorderDefault); }
.orderHeader { margin-bottom: 13px; .refreshButton { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--uiBorderDefault); border-radius: 5px; color: var(--uiTextMuted); background: transparent; cursor: pointer; &:hover { color: var(--uiTextPrimary); border-color: var(--uiBorderFocus); } &:disabled { opacity: .55; cursor: wait; } .spinning { animation: spin 1s linear infinite; } } }
.orderList { border-top: 1px solid var(--uiBorderDefault); }
.orderRow { display: grid; grid-template-columns: 34px minmax(150px, 1fr) 110px 95px 90px auto; align-items: center; gap: 12px; min-height: 66px; padding: 8px 5px; border-bottom: 1px solid var(--uiBorderDefault); .orderIcon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 5px; color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 10%, transparent); } .orderMain, .orderCredits, .orderAmount { display: grid; gap: 4px; min-width: 0; strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; font-weight: 600; } span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--uiTextMuted); font-size: 9px; } } .orderCredits, .orderAmount { text-align: right; strong { font-variant-numeric: tabular-nums; } } .orderStatus { display: inline-flex; align-items: center; gap: 5px; color: var(--uiTextMuted); font-size: 10px; white-space: nowrap; i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; } &.statuspending { color: #e9ae53; } &.statuspaid { color: #78c68b; } } :deep(.uiButton) { justify-self: end; } }
.emptyOrders { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 82px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 11px; }
.orderDialog { .orderDialogHeader { display: flex; align-items: center; gap: 12px; padding: 15px 17px; border: 1px solid var(--uiBorderDefault); border-radius: 5px; background: var(--uiBackgroundSubtle); &.completed { border-color: color-mix(in srgb, var(--uiStatusSuccess) 45%, var(--uiBorderDefault)); } .dialogStatusIcon { display: grid; place-items: center; flex: 0 0 38px; width: 38px; height: 38px; border-radius: 50%; color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 10%, transparent); } &.completed .dialogStatusIcon { color: var(--uiStatusSuccess); background: color-mix(in srgb, var(--uiStatusSuccess) 10%, transparent); } > div:last-child { display: grid; gap: 4px; strong { font-size: 13px; } span { color: var(--uiTextMuted); font-size: 10px; } } } .dialogOrderInfo { display: grid; gap: 12px; padding: 18px 2px; > div { display: flex; justify-content: space-between; gap: 15px; min-width: 0; span { color: var(--uiTextMuted); font-size: 10px; } strong { max-width: 68%; overflow-wrap: anywhere; font-size: 10px; text-align: right; font-weight: 550; } .dialogAmount { color: var(--uiActionPrimary); font-size: 14px; } } } .paymentPending, .paymentComplete, .paymentClosed { display: flex; align-items: flex-start; gap: 9px; padding: 13px; border: 1px solid var(--uiBorderDefault); border-radius: 5px; color: var(--uiTextMuted); background: var(--uiBackgroundSubtle); font-size: 10px; line-height: 1.6; svg { flex: 0 0 auto; color: var(--uiActionPrimary); } p { margin: 0; color: var(--uiTextPrimary); } small { grid-column: 2; color: var(--uiTextMuted); } } .paymentPending { display: grid; grid-template-columns: 20px minmax(0, 1fr); } .paymentComplete { align-items: center; color: var(--uiStatusSuccess); } .paymentClosed { display: block; } .paymentQr { display: grid; justify-items: center; gap: 9px; padding: 12px; color: var(--uiTextMuted); font-size: 10px; img { width: 176px; height: 176px; object-fit: contain; border: 8px solid white; border-radius: 5px; background: white; } } .dialogActions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 18px; } }
.agreementDocument { max-height: min(62dvh, 620px); padding-right: 8px; overflow: auto; color: var(--uiTextBody); font-size: 12px; line-height: 1.9; h3 { margin: 22px 0 6px; color: var(--uiTextPrimary); font-size: 13px; } p { margin: 0; } .agreementEffective { padding-bottom: 12px; border-bottom: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 10px; } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) { .rechargeLayout { grid-template-columns: minmax(0, 1fr) 270px; gap: 20px; } .packageGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .orderRow { grid-template-columns: 34px minmax(130px, 1fr) 90px 80px 82px auto; gap: 8px; } }
@media (max-width: 780px) { .rechargeHero { min-height: 160px; padding: 22px; .heroCopy h2 { font-size: 22px; } .heroRate { min-width: 92px; padding-right: 10px; strong { font-size: 28px; } } .heroMark { right: 90px; font-size: 230px; } } .balanceStrip { grid-template-columns: 1fr auto; gap: 10px 14px; padding: 14px; .balanceValue { justify-content: flex-end; strong { font-size: 21px; } } .balanceMeta { grid-column: 1 / -1; justify-content: flex-start; } } .rechargeLayout { grid-template-columns: 1fr; } .checkoutPanel { position: static; grid-row: 1; } .packageGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .paymentMethods { grid-template-columns: 1fr; } .orderRow { grid-template-columns: 32px minmax(0, 1fr) auto; gap: 8px; padding-block: 10px; .orderCredits { display: none; } .orderAmount { grid-column: 2; grid-row: 2; text-align: left; } .orderStatus { grid-column: 3; grid-row: 1; } :deep(.uiButton) { grid-column: 3; grid-row: 2; } } }
@media (max-width: 480px) { .rechargeHero { align-items: flex-start; min-height: 0; padding: 18px 16px; .heroCopy { h2 { font-size: 19px; } p { font-size: 11px; } } .heroRate { min-width: 76px; padding-right: 0; border-right: 0; strong { font-size: 24px; } span, small { font-size: 9px; } } .heroMark { right: 44px; top: -35px; font-size: 170px; } } .packageGrid { gap: 8px; } .packageOption { min-height: 142px; padding: 14px 12px; .packagePrice { font-size: 23px; } .packageDescription { font-size: 9px; } } .purchaseNotes .notesGrid { grid-template-columns: 1fr; } .checkoutPanel { padding: 17px; } }
</style>

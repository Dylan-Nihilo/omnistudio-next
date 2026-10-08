<template>
  <div class="about">
    <header class="brand"><img class="brandLogo" :src="logoUrl" alt="OmniStudio" /><div class="brandInfo"><h3>OmniStudio</h3><div class="brandMeta"><span>v{{ currentVersion }}</span><uiTag v-if="snapshot?.channel">{{ snapshot.channel }}</uiTag></div></div></header>
    <section class="updatePanel" aria-label="版本更新"><header class="sectionHeader"><h3><icon-refresh :size="18" aria-hidden="true" />版本更新</h3><div class="updateActions"><uiSelect :modelValue="updateSource" :options="updateSources" aria-label="更新源" size="small" :disabled="working || sourceSaving" @change="value => typeof value === 'string' && saveUpdateSource(value)" /><uiBadge dot :hidden="!hasDesktopUpdate" label="有新版本可用"><uiButton :loading="checking" :disabled="sourceSaving" @click="openUpdate">{{ snapshot?.updateReady ? "更新已就绪" : snapshot?.updating || action === "download" ? "查看更新进度" : "检查更新" }}</uiButton></uiBadge></div></header><div v-if="snapshot?.hash" class="buildInfo"><span>构建标识</span><code>{{ snapshot.hash }}</code></div></section>
    <section class="resourceLinks" aria-label="项目与平台">
      <a class="resourceLink" :href="repositoryUrl" target="_blank" rel="noopener noreferrer" aria-label="GitHub 仓库：HBAI-Ltd/Toonflow-app"><icon-brand-github :size="22" aria-hidden="true" /><span>GitHub 仓库</span><icon-external-link class="externalIcon" :size="16" aria-hidden="true" /></a>
      <a class="resourceLink" href="https://api.toonflow.net/" target="_blank" rel="noopener noreferrer"><icon-world :size="22" aria-hidden="true" /><span>官方中转平台 TF-Router</span><icon-external-link class="externalIcon" :size="16" aria-hidden="true" /></a>
    </section>
    <section class="communitySection" aria-label="微信交流群"><header class="sectionHeader"><h3><icon-brand-wechat :size="20" aria-hidden="true" />微信交流群</h3><uiPopover title="微信扫码加入交流群" :width="236" placement="top"><template #reference="{ triggerAttrs }"><uiButton variant="secondary" size="small" :icon="IconQrcode" v-bind="triggerAttrs">展示二维码</uiButton></template><q-r-code :value="communityUrl" :size="168" type="svg" color="#000000" bgColor="#ffffff" borderless role="img" aria-label="Toonflow 交流群二维码" /><p class="tips">Toonflow 是为爱发电的开源项目。欢迎文明交流、友善反馈；回复可能需要一些时间，请避免责问或命令式沟通，感谢你的理解与尊重。</p></uiPopover></header></section>
    <section class="sponsorPanel" aria-label="赞助商">
      <header class="sectionHeader"><h3><icon-gift :size="20" aria-hidden="true" />赞助商<span class="sponsorHint">排名不分先后</span></h3><uiPopover title="微信扫码洽谈商务合作" :width="236" placement="top"><template #reference="{ triggerAttrs }"><uiButton variant="ghost" size="small" v-bind="triggerAttrs">成为赞助商</uiButton></template><q-r-code value="https://work.weixin.qq.com/u/vc0f54596c5837d05a?v=5.0.8.70675" :size="168" type="svg" color="#000000" bgColor="#ffffff" borderless role="img" aria-label="Toonflow 商务合作二维码" /></uiPopover></header>
      <div v-if="sponsors.length" class="sponsorGrid" @keydown.esc="closeSponsor"><uiPopover v-for="sponsor in sponsors" :key="sponsor.id" role="dialog" placement="top-start" :title="sponsor.name" :width="360" :visible="activeSponsorId === sponsor.id" :hideAfter="0" @update:visible="value => setSponsorVisible(sponsor.id, value)"><template #reference="{ triggerAttrs }"><button class="sponsorEntry" type="button" v-bind="triggerAttrs" :aria-label="`查看 ${sponsor.name} 详情`"><span v-if="sponsor.logoUrl" class="sponsorLogo"><img :src="sponsor.logoUrl" :alt="`${sponsor.name} logo`" /></span><span class="sponsorName">{{ sponsor.name }}</span></button></template><messageMarkdown v-if="activeSponsorId === sponsor.id && sponsor.readme.trim()" class="sponsorReadme" :content="sponsor.readme" @keydown.esc="closeSponsor" /></uiPopover></div>
    </section>
    <uiDialog v-model="resultVisible" title="版本更新" :width="520">
      <div class="updateResult" aria-live="polite" :aria-busy="working"><div class="resultHeader"><span class="resultIcon" :class="{ warning: !!updateError, success: !working && !updateError && !snapshot?.updateAvailable }"><icon-refresh v-if="working" class="loadingIcon" :size="24" aria-hidden="true" /><icon-alert-circle v-else-if="updateError" :size="24" aria-hidden="true" /><icon-arrow-up-circle v-else-if="snapshot?.updateAvailable" :size="24" aria-hidden="true" /><icon-circle-check v-else :size="24" aria-hidden="true" /></span><div class="resultCopy"><h3>{{ resultTitle }}</h3><p>{{ resultMessage }}</p></div></div>
        <div v-if="!checking && !updateError && snapshot?.updateAvailable" class="releaseInfo"><div class="versionComparison"><div class="versionItem"><span>当前版本</span><strong>v{{ currentVersion }}</strong></div><icon-arrow-right :size="18" aria-hidden="true" /><div class="versionItem latestVersion"><span>最新版本</span><strong>v{{ snapshot.latestVersion }}</strong></div></div><div v-if="snapshot.channel || snapshot.latestHash" class="releaseMeta"><uiTag v-if="snapshot.channel">{{ snapshot.channel }}</uiTag><code v-if="snapshot.latestHash" :title="snapshot.latestHash">{{ snapshot.latestHash }}</code></div></div>
      </div>
      <template #footer><uiButton variant="secondary" @click="resultVisible = false">关闭</uiButton><uiButton v-if="snapshot?.canUpdate && snapshot.updateAvailable" :loading="working" @click="runUpdate(snapshot.updateReady ? 'apply' : 'download')">{{ snapshot.updateReady ? "重启并更新" : "下载更新" }}</uiButton></template>
    </uiDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { uiTag, uiSelect, uiBadge, uiButton, uiPopover, uiDialog, useUiFeedback } from "@toonflow/ui";
import { QRCode } from "tdesign-vue-next";
import {
  IconRefresh,
  IconBrandGithub,
  IconExternalLink,
  IconAlertCircle,
  IconArrowUpCircle,
  IconCircleCheck,
  IconArrowRight,
  IconGift,
  IconWorld,
  IconBrandWechat,
  IconQrcode,
} from "@tabler/icons-vue";
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
import tf, { type TfSponsor } from "@/lib/tf";
import type { updateSnapshot } from "@toonflow/server/desktop";
import { saveSettings } from "@/stores/settings";
import {
  desktopUpdateSource as updateSource,
  desktopUpdateCustomUrl as customUpdateUrl,
  desktopUpdateKey as updateKey,
  desktopUpdateSnapshot as snapshot,
  desktopUpdateError as updateError,
  desktopUpdateChecking,
  hasDesktopUpdate,
  checkDesktopUpdate,
} from "@/stores/desktopUpdate";

const messageMarkdown = defineAsyncComponent(() => import("@/components/messageMarkdown.vue"));
const feedback = useUiFeedback();
const updateSources = computed(() => [{ value: "official", label: "官方源" }, { value: "github", label: "GitHub" }, ...(customUpdateUrl.value ? [{ value: "custom", label: "自定义源" }] : [])]);
const repositoryUrl = "https://github.com/HBAI-Ltd/Toonflow-app";
const communityUrl = "https://work.weixin.qq.com/u/vc36adcc89845edcbe?v=5.0.3.63936&bb=85b8d228e8";
const isDesktop = new URLSearchParams(window.location.search).get("desktop") === "1";
const currentVersion = computed(() => snapshot.value?.version || import.meta.env.appVersion);
const action = ref<"check" | "download" | "apply" | null>(null);
const sourceSaving = ref(false);
const checking = computed(() => desktopUpdateChecking.value || action.value === "check");
const working = computed(() => checking.value || !!action.value || !!snapshot.value?.updating);
const resultVisible = ref(false);
const activeSponsorId = ref<number>();
const controller = new AbortController();
const resultTitle = computed(() => {
  if (updateError.value) return "更新未完成";
  if (checking.value) return "正在检查更新";
  if (action.value === "apply") return "正在重启并更新";
  if (working.value) return "正在准备更新";
  if (snapshot.value?.updateReady) return "更新已准备完成";
  return snapshot.value?.updateAvailable ? "发现新版本" : "暂无更新";
});
const resultMessage = computed(() => {
  if (updateError.value) return updateError.value;
  if (checking.value) return "正在获取最新版本信息…";
  if (action.value === "apply") return "客户端即将关闭，更新完成后会自动重新打开。";
  if (working.value) return "正在下载并校验更新包，可以关闭此弹窗继续使用。";
  if (snapshot.value?.updateReady) return "点击“重启并更新”安装新版本，请先完成正在进行的任务。";
  if (!snapshot.value?.updateAvailable) return `当前已是最新版本 v${currentVersion.value}`;
  return snapshot.value.canUpdate ? "有新的版本可用，下载完成后可重启更新。" : "当前客户端不支持应用内更新，请下载安装包。";
});

const sponsors = ref<TfSponsor[]>([]);

onMounted(async () => {
  try {
    sponsors.value = await tf.getSponsorList({ signal: controller.signal });
  } catch (error) {
    if (!controller.signal.aborted) feedback.message({ tone: "error", message: getUpdateError(error) });
  }
});

onMounted(async () => {
  if (!isDesktop || desktopUpdateChecking.value) return;
  const previous = snapshot.value;
  const source = updateKey.value;
  try {
    const { data } = await axios.get<{ data: updateSnapshot }>("/api/desktop/update", { signal: controller.signal, timeout: 10000 });
    if (snapshot.value === previous && updateKey.value === source && !sourceSaving.value && !action.value && !desktopUpdateChecking.value) {
      snapshot.value = data.data;
      updateError.value = data.data.error;
    }
  } catch {
    // ACT: 状态读取失败仍显示构建版本；检查按钮会展示具体错误。
  }
});
onBeforeUnmount(() => controller.abort());

watch([resultVisible, () => snapshot.value?.updating, action], ([visible, updating, currentAction], _, onCleanup) => {
  if ((!visible && currentAction !== "apply") || !updating || (currentAction && currentAction !== "apply")) return;
  // ACT: 下载请求自行返回结果；重启交接后继续同步，捕获宿主退出失败。
  let refreshing = false;
  const timer = setInterval(async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const { data } = await axios.get<{ data: updateSnapshot }>("/api/desktop/update", { signal: controller.signal, timeout: 10000 });
      snapshot.value = data.data;
      updateError.value = data.data.error;
      if (data.data.error && action.value === "apply") action.value = null;
    } catch (error) {
      if (controller.signal.aborted) return;
      if (action.value === "apply" && axios.isAxiosError(error) && error.code === "ERR_NETWORK") clearInterval(timer);
      else updateError.value = getUpdateError(error);
    } finally {
      refreshing = false;
    }
  }, 1500);
  onCleanup(() => clearInterval(timer));
});

function setSponsorVisible(id: number, visible: boolean) {
  if (visible || activeSponsorId.value === id) activeSponsorId.value = visible ? id : undefined;
}

function closeSponsor(event: KeyboardEvent) {
  if (!activeSponsorId.value) return;
  event.stopPropagation();
  activeSponsorId.value = undefined;
}

function openUpdate() {
  resultVisible.value = true;
  if (working.value || snapshot.value?.updateReady) return;
  void runUpdate("check");
}

async function saveUpdateSource(source: string) {
  if (source === updateSource.value || sourceSaving.value || working.value) return;
  if (source !== "official" && source !== "github" && (source !== "custom" || !customUpdateUrl.value)) return;
  sourceSaving.value = true;
  try {
    await saveSettings(() => ({ desktopUpdateSource: source }));
  } catch (error) {
    feedback.message({ tone: "error", message: getUpdateError(error) });
  } finally {
    sourceSaving.value = false;
  }
}

function getUpdateError(error: unknown) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message : String(error);
}

async function runUpdate(nextAction: "check" | "download" | "apply") {
  if (working.value || sourceSaving.value) return;
  updateError.value = "";
  if (!isDesktop) {
    updateError.value = "请在桌面客户端中检查更新。";
    return;
  }
  action.value = nextAction;
  try {
    if (nextAction === "check") await checkDesktopUpdate();
    else {
      const { data } = await axios.post<{ data: updateSnapshot }>(`/api/desktop/update/${nextAction}`, null, {
        headers: { "x-toonflow-desktop": "1" },
        signal: controller.signal,
        timeout: 0,
      });
      snapshot.value = data.data;
    }
    updateError.value = snapshot.value?.error || (snapshot.value?.channel === "dev" ? "开发版本不提供更新检查，请使用正式桌面客户端。" : "");
  } catch (error) {
    if (!controller.signal.aborted) {
      updateError.value = getUpdateError(error);
      try {
        const { data } = await axios.get<{ data: updateSnapshot }>("/api/desktop/update", { signal: controller.signal, timeout: 10000 });
        snapshot.value = data.data;
      } catch {
        // ACT: 状态读取失败时保留本次操作的错误，不覆盖诊断信息。
      }
    }
  } finally {
    if (nextAction !== "apply" || updateError.value) action.value = null;
  }
}
</script>

<style lang="scss" scoped>
.about {
  display: flex; flex-direction: column; gap: 28px; min-width: 0;
  .brand { display: flex; align-items: center; flex-wrap: wrap; gap: 24px; .brandLogo { display: block; width: 196px; height: auto; max-width: 100%; border-radius: var(--uiRadiusControl); background: #101010; } .brandInfo { min-width: 0; h3 { margin: 0 0 8px; font-size: var(--uiFontHeading); font-weight: 700; } .brandMeta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; color: var(--uiTextMuted); font-size: var(--uiFontControl); } } }
  .sectionHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; font-size: var(--uiFontLabel); font-weight: 600; } }
  .updatePanel { padding-top: 24px; border-top: 1px solid var(--uiBorderDefault); .updateActions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; :deep(.uiPopover) { width: 150px; } } .buildInfo { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 16px; margin-top: 20px; color: var(--uiTextMuted); font-size: var(--uiFontControl); code { overflow-wrap: anywhere; } } }
  .resourceLinks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; .resourceLink { display: flex; align-items: center; gap: 12px; min-width: 0; min-height: 72px; padding: 20px; color: var(--uiTextBody); border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); text-decoration: none; font-size: var(--uiFontControl); background: var(--uiBackgroundSubtle); svg { flex-shrink: 0; } span { min-width: 0; overflow-wrap: anywhere; } .externalIcon { margin-left: auto; color: var(--uiTextMuted); } &:hover { border-color: var(--uiBorderControl); } } }
  .communitySection, .sponsorPanel { padding-top: 24px; border-top: 1px solid var(--uiBorderDefault); }
  .sponsorPanel { .sponsorHint { color: var(--uiTextMuted); font-size: var(--uiFontControl); font-weight: 400; } .sponsorGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr)); gap: 12px; margin-top: 20px; :deep(.uiPopover), :deep(.popoverReference) { display: block; } .sponsorEntry { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: 64px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); color: var(--uiTextBody); font: inherit; cursor: pointer; &:hover, &[aria-expanded="true"] { border-color: var(--uiBorderControl); background: var(--uiSurfaceHover); } .sponsorLogo { flex-shrink: 0; width: 32px; height: 32px; padding: 4px; background: #fff; border-radius: 4px; img { display: block; width: 100%; height: 100%; object-fit: contain; } } .sponsorName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--uiFontControl); } } } }
  @media (max-width: 700px) { .resourceLinks { grid-template-columns: minmax(0, 1fr); } }
}
.tips { margin: 16px 0 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; }
.sponsorReadme { max-height: min(360px, 50dvh); overflow: auto; overflow-wrap: anywhere; }
.updateResult { .resultHeader { display: flex; align-items: flex-start; gap: 16px; .resultIcon { flex-shrink: 0; color: var(--uiActionPrimary); &.warning { color: var(--uiStatusError); } &.success { color: var(--uiStatusSuccess); } .loadingIcon { animation: updateStatusSpin 1.2s linear infinite; } } .resultCopy { min-width: 0; h3 { margin: 0 0 8px; font-size: var(--uiFontLabel); font-weight: 600; } p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; overflow-wrap: anywhere; } } } .releaseInfo { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--uiBorderDefault); .versionComparison { display: flex; align-items: center; gap: 16px; color: var(--uiTextMuted); .versionItem { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; span { font-size: var(--uiFontControl); } strong { color: var(--uiTextPrimary); font-size: var(--uiFontTitle); font-weight: 600; overflow-wrap: anywhere; } &.latestVersion strong { color: var(--uiActionPrimary); } } } .releaseMeta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 24px; color: var(--uiTextMuted); font-size: var(--uiFontControl); code { overflow-wrap: anywhere; } } } }
@keyframes updateStatusSpin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .updateResult .loadingIcon { animation: none; } }
</style>

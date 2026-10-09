<template>
  <div class="about">
    <header class="brand"><img class="brandLogo" :src="logoUrl" alt="OmniStudio" /><div class="brandInfo"><h3>OmniStudio</h3><div class="brandMeta"><span>v{{ currentVersion }}</span><uiTag v-if="snapshot?.channel">{{ snapshot.channel }}</uiTag></div></div></header>
    <section class="updatePanel" aria-label="版本更新"><header class="sectionHeader"><h3><icon-refresh :size="18" aria-hidden="true" />版本更新</h3><div class="updateActions"><uiSelect class="updateSourceSelect" inline :modelValue="updateSource" :options="updateSources" aria-label="更新源" size="small" :disabled="working || sourceSaving" @change="value => typeof value === 'string' && saveUpdateSource(value)" /><uiBadge dot :hidden="!hasDesktopUpdate" label="有新版本可用"><uiButton :loading="checking" :disabled="sourceSaving" @click="openUpdate">{{ snapshot?.updateReady ? "更新已就绪" : snapshot?.updating || action === "download" ? "查看更新进度" : "检查更新" }}</uiButton></uiBadge></div></header><div v-if="snapshot?.hash" class="buildInfo"><span>构建标识</span><code>{{ snapshot.hash }}</code></div></section>
    <section class="resourceSection" aria-label="项目">
      <div class="resourceRow" aria-label="GitHub 仓库，暂未配置">
        <icon-brand-github :size="22" aria-hidden="true" />
        <span>GitHub 仓库</span>
        <span class="resourceStatus">暂未配置</span>
      </div>
    </section>
    <section class="communitySection" aria-label="微信交流群">
      <div class="resourceRow" aria-label="微信交流群，暂未配置">
        <icon-brand-wechat :size="22" aria-hidden="true" />
        <span>微信交流群</span>
        <span class="resourceStatus">暂未配置</span>
      </div>
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
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { uiTag, uiSelect, uiBadge, uiButton, uiPopover, uiDialog, useUiFeedback } from "@toonflow/ui";
import {
  IconRefresh,
  IconBrandGithub,
  IconAlertCircle,
  IconArrowUpCircle,
  IconCircleCheck,
  IconArrowRight,
  IconBrandWechat,
} from "@tabler/icons-vue";
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
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

const feedback = useUiFeedback();
const updateSources = computed(() => [{ value: "official", label: "官方源" }, { value: "github", label: "GitHub" }, ...(customUpdateUrl.value ? [{ value: "custom", label: "自定义源" }] : [])]);
const isDesktop = new URLSearchParams(window.location.search).get("desktop") === "1";
const currentVersion = computed(() => snapshot.value?.version || import.meta.env.appVersion);
const action = ref<"check" | "download" | "apply" | null>(null);
const sourceSaving = ref(false);
const checking = computed(() => desktopUpdateChecking.value || action.value === "check");
const working = computed(() => checking.value || !!action.value || !!snapshot.value?.updating);
const resultVisible = ref(false);
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
  display: flex; flex-direction: column; gap: 0; min-width: 0;
  .brand { display: flex; align-items: center; flex-wrap: wrap; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid var(--uiBorderDefault); .brandLogo { display: block; width: 196px; height: auto; max-width: 100%; border-radius: var(--uiRadiusControl); background: #101010; } .brandInfo { min-width: 0; h3 { margin: 0 0 8px; font-size: var(--uiFontHeading); font-weight: 700; } .brandMeta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; color: var(--uiTextMuted); font-size: var(--uiFontControl); } } }
  .sectionHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; h3 { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin: 0; font-size: var(--uiFontLabel); font-weight: 600; } }
  .updatePanel { padding: 24px 0; border-bottom: 1px solid var(--uiBorderDefault); .updateActions { display: flex; align-items: center; flex-wrap: nowrap; gap: 12px; min-width: max-content; :deep(.updateSourceSelect) { flex: 0 0 150px; width: 150px; } :deep(.uiBadge) { flex-shrink: 0; } } .buildInfo { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px 16px; margin-top: 20px; color: var(--uiTextMuted); font-size: var(--uiFontControl); code { overflow-wrap: anywhere; } } }
  .resourceSection, .communitySection, .sponsorPanel { padding: 24px 0; border-bottom: 1px solid var(--uiBorderDefault); }
  .resourceRow { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 14px 16px; color: var(--uiTextBody); border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); font-size: var(--uiFontControl); svg { flex-shrink: 0; color: var(--uiTextMuted); } > span:not(.resourceStatus) { min-width: 0; overflow-wrap: anywhere; } .resourceStatus { margin-left: auto; color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
  .sponsorPanel { .sponsorHint { color: var(--uiTextMuted); font-size: var(--uiFontControl); font-weight: 400; } .sponsorGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr)); gap: 12px; margin-top: 20px; :deep(.uiPopover), :deep(.popoverReference) { display: block; } .sponsorEntry { display: flex; align-items: center; gap: 12px; width: 100%; min-width: 0; min-height: 64px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); color: var(--uiTextBody); font: inherit; cursor: pointer; &:hover, &[aria-expanded="true"] { border-color: var(--uiBorderControl); background: var(--uiSurfaceHover); } .sponsorLogo { flex-shrink: 0; width: 32px; height: 32px; padding: 4px; background: #fff; border-radius: 4px; img { display: block; width: 100%; height: 100%; object-fit: contain; } } .sponsorName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--uiFontControl); } } } }
  @media (max-width: 700px) { .resourceLinks { grid-template-columns: minmax(0, 1fr); } .updateActions { min-width: 0; } }
}
.tips { margin: 16px 0 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; }
.sponsorReadme { max-height: min(360px, 50dvh); overflow: auto; overflow-wrap: anywhere; }
.updateResult { .resultHeader { display: flex; align-items: flex-start; gap: 16px; .resultIcon { flex-shrink: 0; color: var(--uiActionPrimary); &.warning { color: var(--uiStatusError); } &.success { color: var(--uiStatusSuccess); } .loadingIcon { animation: updateStatusSpin 1.2s linear infinite; } } .resultCopy { min-width: 0; h3 { margin: 0 0 8px; font-size: var(--uiFontLabel); font-weight: 600; } p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; overflow-wrap: anywhere; } } } .releaseInfo { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--uiBorderDefault); .versionComparison { display: flex; align-items: center; gap: 16px; color: var(--uiTextMuted); .versionItem { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; span { font-size: var(--uiFontControl); } strong { color: var(--uiTextPrimary); font-size: var(--uiFontTitle); font-weight: 600; overflow-wrap: anywhere; } &.latestVersion strong { color: var(--uiActionPrimary); } } } .releaseMeta { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 24px; color: var(--uiTextMuted); font-size: var(--uiFontControl); code { overflow-wrap: anywhere; } } } }
@keyframes updateStatusSpin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .updateResult .loadingIcon { animation: none; } }
</style>

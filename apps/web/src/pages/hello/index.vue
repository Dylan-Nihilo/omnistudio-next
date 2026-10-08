<template>
  <main class="hello" :class="{ configuring: view !== 'welcome' }">
    <section class="welcomePanel" aria-labelledby="welcomeTitle">
      <a class="welcomeBrand" href="#/hello" aria-label="OmniStudio"><img :src="logoUrl" alt="OmniStudio" /></a>
      <div v-if="view !== 'welcome'" class="providerContent">
        <header class="providerHeader"><uiButton variant="ghost" :icon="IconArrowLeft" :disabled="saving" @click="view = 'welcome'">返回</uiButton><h1 id="welcomeTitle">{{ view === "login" ? "登录 TF-Router" : "配置语言模型" }}</h1></header>
        <uiLoading v-if="view === 'login'" class="loginBody" :loading="saving" label="正在配置文本模型和媒体模型…"><iframe ref="loginFrame" class="loginFrame" :src="loginUrl" title="TF-Router 登录与注册" /></uiLoading>
        <div v-else class="providerBody"><languageModel /></div>
        <div v-if="view === 'login' && loginError" class="loginFeedback" role="status"><uiAlert :title="loginError" tone="error" /><uiButton v-if="loginKey" :loading="saving" @click="configureProviders">重试配置</uiButton></div>
        <uiButton v-else-if="view === 'custom'" :loading="saving" :disabled="!customProviders.some(provider => provider.models.length)" @click="completeSetup">开始使用</uiButton>
      </div>
      <div v-else class="welcomeContent">
        <span class="welcomeLabel">漫剧创作</span>
        <h1 id="welcomeTitle">快速开始</h1>
        <p class="description">选择登录 TF-Router 可直接自动配置，无需复杂操作，即可开始创作。</p>
        <uiButton class="loginButton" size="large" @click="openLogin"><icon-login :size="18" aria-hidden="true" />登录 TF-Router 自动配置</uiButton>
        <div class="secondaryActions"><uiButton variant="secondary" @click="view = 'custom'"><icon-key :size="16" aria-hidden="true" />添加私有提供商</uiButton><span class="separator">或</span><uiButton variant="ghost" :loading="saving" @click="completeSetup">稍后配置</uiButton></div>
      </div>
      <footer class="pageFooter"><p>© {{ new Date().getFullYear() }} Toonflow · 保留所有权利。</p></footer>
    </section>
    <aside class="artPanel" aria-hidden="true"><img class="artwork" :src="heroInk" alt="" /></aside>
  </main>
</template>

<script setup lang="ts">
import axios from "axios";
import { defineAsyncComponent, onMounted, onBeforeUnmount, ref } from "vue";
import { useRouter } from "vue-router";
import { uiButton, uiAlert, uiLoading, useUiFeedback } from "@toonflow/ui";
import { IconArrowLeft } from "@tabler/icons-vue";
import tfRouter from "@toonflow/providers/language/tfRouter";
import tfRouterSource from "@toonflow/providers/media/tfRouter?raw";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import { customProviders, saveSettings, type CustomProviderModel } from "@/stores/settings";
import type { MediaProvider } from "@/components/settings/panels/mediaModel/types";
import { useHelloStore } from "@/stores/hello";
import anonymousData from "@/lib/anonymousData";
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
import heroInk from "@toonflow/assets/illustrations/heroInk.png";

const feedback = useUiFeedback();
const languageModel = defineAsyncComponent(() => import("@/components/settings/panels/languageModel/index.vue"));
const view = ref<"welcome" | "login" | "custom">("welcome");
const loginUrl = ref("https://api.toonflow.net/login?type=toonflow");
const loginOrigin = new URL(loginUrl.value).origin;
const loginFrame = ref<HTMLIFrameElement>();
const loginKey = ref("");
const loginError = ref("");
const saving = ref(false);
const router = useRouter();
const hello = useHelloStore();
let loginRequest: AbortController | undefined;

function openLogin() {
  const url = new URL(loginUrl.value);
  const pageStyle = getComputedStyle(document.documentElement);
  url.searchParams.set("bgcolor", "white");
  url.searchParams.set("txtcolor", pageStyle.getPropertyValue("--el-color-primary").trim());
  loginUrl.value = url.href;
  loginKey.value = loginError.value = "";
  view.value = "login";
}

async function completeSetup() {
  if (saving.value) return;
  saving.value = true;
  try {
    await hello.complete();
    anonymousData.track(view.value === "custom" ? "onboarding.complete" : "onboarding.skip");
    await router.replace("/home");
  } catch {
    feedback.message({ tone: "error", message: "保存引导状态失败，请重试" });
  } finally {
    saving.value = false;
  }
}

function receiveLogin(event: MessageEvent) {
  if (view.value !== "login" || saving.value || event.origin !== loginOrigin || event.source !== loginFrame.value?.contentWindow) return;
  const data = event.data;
  if (!data || typeof data !== "object" || !["register", "login"].includes(data.type)) return;
  if (data.msg === "failed") {
    loginKey.value = "";
    loginError.value = typeof data.error === "string" && data.error.trim() ? data.error : data.type === "register" ? "注册失败" : "登录失败";
    return;
  }
  if (data.msg !== "success") return;
  loginError.value = "";
  if (data.type === "register") {
    feedback.message({ tone: "success", message: "注册成功，请继续登录以自动配置模型" });
    return;
  }
  if (typeof data.key !== "string" || !data.key.trim() || data.key.length > 8192) {
    loginKey.value = "";
    loginError.value = "登录未返回有效的 API Key，请重新登录";
    return;
  }
  loginKey.value = data.key.trim();
  void configureProviders();
}

async function configureProviders() {
  if (saving.value || !loginKey.value) return;
  saving.value = true;
  loginError.value = "";
  const apiKey = loginKey.value;
  const request = new AbortController();
  loginRequest = request;
  try {
    const [modelsResponse, mediaResponse] = await Promise.all([
      axios.post<{ code: number; data: CustomProviderModel[] }>(
        "/api/providers/models",
        {
          apiUrl: tfRouter.apiUrl,
          protocol: tfRouter.protocol,
          apiKey,
        },
        { signal: request.signal, timeout: 35000 }
      ),
      axios.get<{ code: number; data: MediaProvider[] }>("/api/providers/media/list", { signal: request.signal }),
    ]);
    const models = modelsResponse.data.data;
    if (modelsResponse.data.code !== 200 || !Array.isArray(models) || !models.length) throw new Error("未获取到文本模型，请重试配置");
    if (mediaResponse.data.code !== 200 || !Array.isArray(mediaResponse.data.data)) throw new Error("读取媒体供应商失败，请重试配置");
    request.signal.throwIfAborted();
    if (!mediaResponse.data.data.some((provider) => provider.id === tfRouter.id)) {
      await axios.post("/api/providers/media/add", { source: tfRouterSource }, { signal: request.signal });
    }
    request.signal.throwIfAborted();
    // ACT: 媒体文件已安装但保存失败时保留文件，重试通过列表复用，不覆盖用户编辑的模型。
    await saveSettings(settings => {
      request.signal.throwIfAborted();
      const providers = settings.customProviders ?? [];
      if (!Array.isArray(providers)) throw new Error("语言模型配置格式无效");
      const configs = settings.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
      if (configs !== undefined && (!configs || typeof configs !== "object" || Array.isArray(configs))) throw new Error("媒体供应商配置格式无效");
      const current = configs?.[tfRouter.id];
      if (current !== undefined && (!current || typeof current !== "object" || Array.isArray(current))) throw new Error("当前供应商配置格式无效");
      const index = providers.findIndex(provider => typeof provider?.id === "string" && provider.id.toLowerCase() === tfRouter.id.toLowerCase());
      const previous = providers[index];
      const provider = {
        ...previous,
        id: previous?.id ?? tfRouter.id,
        label: previous?.label ?? tfRouter.label,
        apiUrl: tfRouter.apiUrl,
        protocol: tfRouter.protocol,
        apiKey,
        models: previous?.models?.length ? previous.models : models,
      };
      return {
        customProviders: index < 0 ? [...providers, provider] : providers.map((item, position) => position === index ? provider : item),
        mediaProviderConfigs: { ...configs, [tfRouter.id]: { ...current, apiKey } },
      };
    });
    invalidateNodeModels("media");
    if (request.signal.aborted) return;
    await hello.complete();
    anonymousData.track("onboarding.complete");
    loginKey.value = "";
    feedback.message({ tone: "success", message: "文本模型和媒体模型已配置完成" });
    await router.replace("/home");
  } catch (error) {
    if (!request.signal.aborted)
      loginError.value = axios.isAxiosError(error)
        ? error.response?.data?.message || "自动配置失败，请重试"
        : error instanceof Error
        ? error.message
        : "自动配置失败，请重试";
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  window.addEventListener("message", receiveLogin);
});
onBeforeUnmount(() => {
  window.removeEventListener("message", receiveLogin);
  loginRequest?.abort();
  loginKey.value = "";
});
</script>

<style lang="scss" scoped>
.hello {
  display: grid; grid-template-columns: minmax(420px, 0.95fr) minmax(0, 1.05fr); min-height: 100dvh; background: var(--uiBackgroundBase); color: var(--uiTextPrimary);
  .welcomePanel {
    display: flex; flex-direction: column; min-width: 0; min-height: 720px; gap: 32px; padding: 28px clamp(32px, 4.4vw, 72px) 32px; border-right: 1px solid var(--uiBorderDefault);
    .welcomeBrand { display: block; width: 196px; max-width: 100%; img { display: block; width: 100%; height: auto; border-radius: 8px; background: #101010; } }
    .welcomeContent {
      width: 100%; max-width: 460px; margin: auto 0;
      .welcomeLabel { display: inline-flex; min-height: 28px; align-items: center; padding: 4px 12px; margin-bottom: 28px; transform: rotate(-2deg); border-radius: 2px; color: var(--uiTextOnAccent); background: var(--uiActionPrimary); font-size: var(--uiFontControl); font-weight: 600; }
      h1 { margin: 0 0 20px; font-size: clamp(36px, 3.8vw, 48px); line-height: 1.2; font-weight: 900; letter-spacing: -1px; }
      .description { max-width: 40ch; margin: 0 0 32px; color: var(--uiTextBody); font-size: var(--uiFontBody); line-height: 1.8; }
      .loginButton { width: 100%; min-height: 48px; :deep(.buttonLabel) { display: flex; align-items: center; justify-content: center; gap: 10px; } }
      .secondaryActions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 20px; :deep(.buttonLabel) { display: flex; align-items: center; gap: 8px; } .separator { color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
    }
    .pageFooter { color: var(--uiTextMuted); font-size: var(--uiFontControl); p { margin: 0; line-height: 1.6; } }
    .providerContent { display: flex; flex-direction: column; gap: 24px; flex: 1; min-height: 0; .providerHeader { h1 { margin: 20px 0 0; font-size: var(--uiFontHeading); font-weight: 700; } } .providerBody { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 2px; } .loginBody { flex: 1; min-width: 0; overflow: auto; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: #fff; :deep(> div:first-child) { height: 100%; } .loginFrame { display: block; width: 100%; height: 100%; min-height: 640px; border: 0; background: #fff; } } .loginFeedback { display: flex; flex-direction: column; gap: 12px; } }
  }
  .artPanel { display: flex; align-items: center; justify-content: center; min-width: 0; padding: 28px; background: #101010; overflow: hidden; .artwork { display: block; width: 100%; height: auto; object-fit: contain; aspect-ratio: 3 / 2; } }
  &.configuring { height: 100dvh; overflow: hidden; .welcomePanel { min-height: 0; gap: 24px; .welcomeBrand { width: 168px; } } }
  @media (max-width: 1100px) { grid-template-columns: minmax(420px, 1.1fr) minmax(0, 0.9fr); .welcomePanel { padding-inline: 32px; } .artPanel { padding: 12px; } }
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr); .welcomePanel { min-height: 100dvh; padding: 24px 20px; border: 0; .welcomeContent { margin: auto; } } .artPanel { display: none; } }
}
</style>

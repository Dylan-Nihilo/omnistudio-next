<template>
  <uiThemeProvider :mode="mode" :accent="accent" :fontScale="fontScale" :radius="radius" :primaryColor="primaryColor" class="previewRoot">
    <uiFeedbackProvider>
      <main class="previewPage">
        <header class="previewHeader"><div class="brand"><img :src="logo" alt="OmniStudio" class="brandLogo" /><h1>组件库</h1></div>
          <div class="themeActions"><uiButton variant="ghost" @click="mode = mode === 'dark' ? 'light' : 'dark'">{{ mode === 'dark' ? '浅色' : '深色' }}</uiButton><uiButton variant="secondary" @click="switchAccent">{{ accent === 'orange' ? '绿色主题' : '橙色主题' }}</uiButton><uiButton variant="ghost" @click="fontScale = fontScale === 100 ? 125 : 100">{{ fontScale }}%</uiButton><uiColorPicker :modelValue="primaryColor || (accent === 'orange' ? '#ff6b35' : '#c3f15a')" aria-label="强调色" @update:modelValue="value => primaryColor = value" /></div>
        </header>
        <uiTabs v-model="active" :options="sections" label="组件分类">
          <keep-alive><component :is="activeShowcase" /></keep-alive>
        </uiTabs>
      </main>
    </uiFeedbackProvider>
  </uiThemeProvider>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { uiThemeProvider, uiFeedbackProvider, uiButton, uiColorPicker, uiTabs, type UiAccent, type UiMode, type UiValue, type UiOption } from "@toonflow/ui";
import basicShowcase from "./components/basicShowcase.vue";
import formShowcase from "./components/formShowcase.vue";
import overlayShowcase from "./components/overlayShowcase.vue";
import dataShowcase from "./components/dataShowcase.vue";
import mediaShowcase from "./components/mediaShowcase.vue";
import logo from "@toonflow/assets/omniStudioLogo.svg";
const mode = ref<UiMode>("dark"), accent = ref<UiAccent>("orange"), active = ref<UiValue>("basic");
const fontScale = ref(100), radius = ref(8), primaryColor = ref<string>();
const sections: UiOption[] = [{ value: "basic", label: "基础控件" }, { value: "form", label: "选择与表单" }, { value: "overlay", label: "弹层与反馈" }, { value: "data", label: "数据与导航" }, { value: "media", label: "媒体与引导" }];
const showcases = { basic: basicShowcase, form: formShowcase, overlay: overlayShowcase, data: dataShowcase, media: mediaShowcase };
const activeShowcase = computed(() => showcases[String(active.value) as keyof typeof showcases] ?? basicShowcase);
function switchAccent() { primaryColor.value = undefined; accent.value = accent.value === "orange" ? "green" : "orange"; }
</script>

<style lang="scss">
html, body, #app { margin: 0; min-height: 100%; }
.previewRoot { min-height: 100vh; }
.previewPage {
  width: min(1120px, calc(100% - 64px)); margin-inline: auto; padding: 40px 0 64px;
  .previewHeader { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 32px; .brand { display: flex; align-items: center; gap: 16px; img { width: 168px; height: auto; border-radius: 8px; background: #101010; } h1 { margin: 0; font-size: 22px; } p { margin: 4px 0 0; color: var(--uiTextMuted); } } .themeActions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; } }
  section > h2 { margin: 8px 0 20px; font-size: var(--uiFontTitle); font-weight: 500; }
  .tabPanel > .uiStack { gap: 32px; }
  .uiForm { margin-top: 20px; }
  .uiPagination { margin-top: 16px; }
  @media (max-width: 760px) { width: calc(100% - 32px); padding-top: 24px; .previewHeader { align-items: flex-start; flex-direction: column; } }
}
</style>

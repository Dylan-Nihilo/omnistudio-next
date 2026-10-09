<template>
  <el-dialog v-model="visible" title="设置" width="min(1120px, calc(100vw - 32px))" alignCenter appendToBody>
    <uiThemeProvider class="settingsTheme" :mode="uiSettings.theme" :primaryColor="uiSettings.primaryColor" :radius="uiSettings.radius" :fontScale="100">
      <div class="settings">
        <aside class="settingsSidebar" aria-label="设置分类">
          <template v-for="item in settingsPanels" :key="item.id">
            <h3 v-if="item.groupLabel" class="settingsGroupLabel">{{ item.groupLabel }}</h3>
            <uiButton class="settingsItem" variant="ghost" :class="{ isActive: activePanel.id === item.id }" :aria-label="item.id === 'about' && hasDesktopUpdate ? `${item.label}，有新版本可用` : item.label" :aria-pressed="activePanel.id === item.id" @click="activePanel = item">
              <uiBadge dot :hidden="item.id !== 'about' || !hasDesktopUpdate" label="有新版本可用"><component :is="item.icon" :size="18" aria-hidden="true" /></uiBadge><span class="settingsLabel">{{ item.label }}</span>
            </uiButton>
          </template>
        </aside>
        <section class="settingsContent" :aria-label="activePanel.label" tabindex="0">
          <header class="settingsHeader"><h2>{{ activePanel.label }}</h2></header>
          <div class="panelContent">
            <keep-alive include="personalization"><component :is="activePanel.component" v-bind="['languageModel', 'mediaModel', 'personalization'].includes(activePanel.id) ? { visible } : {}" /></keep-alive>
          </div>
        </section>
      </div>
    </uiThemeProvider>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, shallowRef, watch } from "vue";
import { uiThemeProvider, uiBadge, uiButton } from "@omnistudio-next/ui";
import { uiSettings } from "@/stores/settings";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";
import { useAuthStore } from "@/stores/auth";
import {
  IconPalette,
  IconSettings,
  IconPhotoVideo,
  IconInfoCircle,
  IconCode,
  IconShieldLock,
  IconPlugConnected,
  IconUserCog,
  IconSubtitlesAi,
} from "@tabler/icons-vue";

// ACT: keep the legacy overlay while unported child dialogs still teleport to body.
const auth = useAuthStore();
const allPanels = [
  { id: "ui", label: "界面设置", icon: IconPalette, component: defineAsyncComponent(() => import("./panels/ui.vue")) },
  { id: "general", label: "常规配置", icon: IconSettings, component: defineAsyncComponent(() => import("./panels/general/index.vue")) },
  {
    id: "languageModel",
    label: "文本模型",
    icon: IconSubtitlesAi,
    groupLabel: "模型",
    component: defineAsyncComponent(() => import("./panels/languageModel/index.vue")),
  },
  { id: "mediaModel", label: "媒体模型", icon: IconPhotoVideo, component: defineAsyncComponent(() => import("./panels/mediaModel/index.vue")) },
  { id: "mcp", label: "MCP", icon: IconPlugConnected, groupLabel: "其他", component: defineAsyncComponent(() => import("./panels/mcp/index.vue")) },
  { id: "personalization", label: "个性化", icon: IconUserCog, component: defineAsyncComponent(() => import("./panels/personalization.vue")) },
  { id: "privacy", label: "隐私", icon: IconShieldLock, component: defineAsyncComponent(() => import("./panels/privacy.vue")) },
  { id: "developer", label: "开发者选项", icon: IconCode, component: defineAsyncComponent(() => import("./panels/developer/index.vue")) },
  { id: "about", label: "关于", icon: IconInfoCircle, component: defineAsyncComponent(() => import("./panels/about.vue")) },
];
const settingsPanels = computed(() => allPanels.filter(panel => panel.id !== "developer" || auth.isRoot));
const activePanel = shallowRef(allPanels[0]!);
watch(() => auth.isRoot, () => { if (!settingsPanels.value.includes(activePanel.value)) activePanel.value = allPanels[0]!; });
const visible = defineModel<boolean>({ default: false });
</script>

<style lang="scss" scoped>
.settingsTheme { border-radius: var(--uiRadiusControl); overflow: hidden; }
.settings {
  display: grid; grid-template-columns: 216px minmax(0, 1fr); height: min(74dvh, calc(100dvh - 160px)); min-height: 320px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); overflow: hidden;
  .settingsSidebar { min-height: 0; overflow: auto; padding: 20px 12px; border-right: 1px solid var(--uiBorderDefault); background: var(--uiBackgroundSubtle); .settingsGroupLabel { margin: 20px 12px 8px; color: var(--uiTextMuted); font-size: var(--uiFontControl); font-weight: 400; } .settingsItem { width: 100%; justify-content: flex-start; min-height: 40px; margin-bottom: 4px; :deep(.buttonLabel) { display: flex; align-items: center; gap: 12px; } &.isActive { color: var(--uiActionPrimary); background: var(--uiActionSoft); } } }
  .settingsContent { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--uiBackgroundBase); .settingsHeader { flex-shrink: 0; padding: 28px 32px 20px; border-bottom: 1px solid var(--uiBorderDefault); h2 { margin: 0; font-size: var(--uiFontHeading); font-weight: 700; } } .panelContent { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 24px 32px 32px; } }
  @media (max-width: 900px) { grid-template-columns: 184px minmax(0, 1fr); .settingsContent { .settingsHeader { padding: 20px 24px; } .panelContent { padding: 24px; } } }
  @media (max-width: 700px) { grid-template-columns: 60px minmax(0, 1fr); .settingsSidebar { padding-inline: 6px; .settingsGroupLabel { margin-inline: 0; text-align: center; } .settingsItem { justify-content: center; padding-inline: 8px; .settingsLabel { display: none; } } } .settingsContent { .settingsHeader { padding: 20px; } .panelContent { padding: 20px 16px; } } }
}
</style>

<template>
  <div class="appearanceSettings">
    <section class="settingSection" aria-labelledby="themeTitle">
      <header class="settingHeader"><h3 id="themeTitle"><icon-sun-moon :size="18" aria-hidden="true" />外观模式</h3></header>
      <div class="themeOptions" role="radiogroup" aria-label="外观模式" @click="captureThemeClickPoint">
        <uiRadio v-for="item in themes" :key="item.value" :value="item.value" :modelValue="uiSettings.theme" :name="themeGroupName" border @update:modelValue="value => changeTheme(String(value))"><span class="themeLabel"><component :is="item.icon" :size="22" aria-hidden="true" /><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span></uiRadio>
      </div>
    </section>
    <section class="settingSection" aria-labelledby="colorTitle">
      <header class="settingHeader"><h3 id="colorTitle"><icon-palette :size="18" aria-hidden="true" />主题颜色</h3><span class="settingValue">{{ uiSettings.primaryColor.toUpperCase() }}</span></header>
      <p class="description">用于按钮、选中状态与创作背景。</p>
      <div class="colorOptions"><button v-for="color in colors" :key="color.value" class="colorSwatch" type="button" :style="{ '--swatchColor': color.value }" :aria-label="color.label" :aria-pressed="uiSettings.primaryColor.toLowerCase() === color.value" :title="color.label" @click="updateUiSettings({ primaryColor: color.value })"><icon-check v-if="uiSettings.primaryColor.toLowerCase() === color.value" :size="18" aria-hidden="true" /></button><uiColorPicker :modelValue="uiSettings.primaryColor" aria-label="自定义主题颜色" @change="changeColor" /><span class="description">自定义</span></div>
    </section>
    <div class="displayOptions">
      <section class="settingSection" aria-labelledby="fontTitle"><header class="settingHeader"><h3 id="fontTitle"><icon-text-size :size="18" aria-hidden="true" />字体大小</h3><span class="settingValue">{{ fontScale }}%</span></header><p class="description">统一调整界面、聊天和节点中的文字大小。</p><uiSlider v-model="fontScale" :min="85" :max="125" :step="5" :marks="{ 85: '较小', 100: '默认', 125: '较大' }" aria-label="字体大小" @change="value => updateUiSettings({ fontScale: value })" /></section>
      <section class="settingSection" aria-labelledby="radiusTitle"><header class="settingHeader"><h3 id="radiusTitle"><icon-border-radius :size="18" aria-hidden="true" />界面圆角</h3><span class="settingValue">{{ radius }} px</span></header><uiSlider v-model="radius" :min="0" :max="16" :step="2" :marks="{ 0: '直角', 8: '默认', 16: '圆润' }" aria-label="界面圆角" @change="value => updateUiSettings({ radius: value })" /></section>
    </div>
    <div class="appearancePreview"><img :src="logoUrl" alt="omnistudio-next" /><div class="previewText"><strong>每一个灵感，都值得被看见</strong><uiTag>预览</uiTag></div></div>
    <footer class="settingsFooter"><uiButton variant="secondary" :icon="IconRestore" @click="updateUiSettings({ ...defaultUiSettings, startupAnimation: uiSettings.startupAnimation })">恢复界面默认设置</uiButton></footer>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, useId, watchEffect } from "vue";
import {
  IconSun,
  IconMoon,
  IconDeviceDesktop,
  IconSunMoon,
  IconPalette,
  IconSparkles,
  IconCheck,
  IconRestore,
} from "@tabler/icons-vue";
import { uiButton, uiRadio, uiColorPicker, uiSlider, uiTag } from "@omnistudio-next/ui";
import logoUrl from "@omnistudio-next/assets/omniStudioNextLogo.svg";
import { defaultUiSettings, uiSettings, updateUiSettings } from "@/stores/settings";

const themeGroupName = "appearanceTheme-" + useId();
const fontScale = ref(uiSettings.value.fontScale);
const radius = ref(uiSettings.value.radius);
watchEffect(() => {
  fontScale.value = uiSettings.value.fontScale;
  radius.value = uiSettings.value.radius;
});

const themes = [
  { value: "light", label: "浅色", description: "明亮清晰", icon: IconSun },
  { value: "dark", label: "深色", description: "沉浸创作", icon: IconMoon },
  { value: "system", label: "跟随系统", description: "自动切换", icon: IconDeviceDesktop },
];
const colors = [
  { value: "#ff6b35", label: "创作橙" },
  { value: "#c3f15a", label: "鲜绿色" },
  { value: "#409eff", label: "天空蓝" },
  { value: "#6366f1", label: "鸢尾紫" },
  { value: "#a855f7", label: "薰衣紫" },
  { value: "#e34b83", label: "蔷薇粉" },
  { value: "#e89524", label: "琥珀橙" },
  { value: "#18a17c", label: "松石绿" },
];
function changeColor(value: string | null) {
  if (value) updateUiSettings({ primaryColor: value });
}

// ACT: 圆心固定用视口中心，实际点击坐标由 captureThemeClickPoint 在 change 前写入。
let themeClickPoint = { x: innerWidth / 2, y: innerHeight / 2 };
function captureThemeClickPoint(event: MouseEvent) {
  themeClickPoint = { x: event.clientX, y: event.clientY };
}
function changeTheme(value: string) {
  const { x, y } = themeClickPoint;
  const root = document.documentElement;
  root.style.setProperty("--themeX", `${x}px`);
  root.style.setProperty("--themeY", `${y}px`);
  root.style.setProperty("--themeR", `${Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))}px`);
  if (!document.startViewTransition) {
    updateUiSettings({ theme: value });
    return;
  }
  document.startViewTransition(async () => {
    updateUiSettings({ theme: value });
    await nextTick();
  });
}
</script>

<style lang="scss" scoped>
.appearanceSettings {
  display: flex; flex-direction: column; gap: 32px; min-width: 0;
  .settingSection { min-width: 0; .settingHeader { display: flex; align-items: center; justify-content: space-between; gap: 16px; h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: var(--uiFontLabel); font-weight: 600; } .settingValue { color: var(--uiTextMuted); font-size: var(--uiFontControl); font-variant-numeric: tabular-nums; } } .description { margin: 8px 0 16px; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.6; } }
  .themeOptions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 16px; :deep(.uiRadio) { min-width: 0; align-items: flex-start; padding: 16px 12px; .radioMark { margin-top: 3px; } } .themeLabel { display: flex; flex-direction: column; gap: 8px; strong { font-size: var(--uiFontLabel); font-weight: 500; } small { color: var(--uiTextMuted); font-size: var(--uiFontControl); } } }
  .colorOptions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; .colorSwatch { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; border: 1px solid var(--uiBorderControl); border-radius: 50%; background: var(--swatchColor); color: #141414; cursor: pointer; &[aria-pressed="true"] { outline: 2px solid var(--uiBorderFocus); outline-offset: 3px; } } .description { margin: 0; } }
  .displayOptions { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
  .appearancePreview { display: flex; flex-wrap: wrap; align-items: center; gap: 20px; padding: 20px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiBackgroundSubtle); img { display: block; width: 168px; height: auto; border-radius: 8px; background: #101010; } .previewText { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; strong { color: var(--uiTextPrimary); font-size: var(--uiFontBody); font-weight: 500; } } }
  .settingsFooter { display: flex; justify-content: flex-end; }
  @media (max-width: 900px) { .displayOptions { grid-template-columns: 1fr; } }
  @media (max-width: 700px) { .themeOptions { grid-template-columns: 1fr; .themeLabel { flex-direction: row; flex-wrap: wrap; align-items: center; } } }
}
</style>

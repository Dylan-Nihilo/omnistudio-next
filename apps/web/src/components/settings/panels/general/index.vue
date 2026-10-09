<template>
  <div class="general">
    <section class="settingSection" aria-labelledby="startupTitle">
      <div class="settingHeader">
        <div class="settingInfo">
          <h3 id="startupTitle">启动动画</h3>
          <p class="description">启动时播放动画。关闭可加快启动速度，可能出现闪屏，下次启动生效。</p>
        </div>
        <uiSwitch
          :modelValue="uiSettings.startupAnimation"
          aria-label="启动动画"
          @change="(value) => updateUiSettings({ startupAnimation: value === true })" />
      </div>
    </section>
    <section class="settingSection" aria-labelledby="canvasCompositingTitle">
      <div class="settingHeader">
        <div class="settingInfo">
          <h3 id="canvasCompositingTitle">画布合成优化</h3>
          <p class="description">优化大量节点时的平移和缩放，可能增加显存占用并导致模糊，立即生效。</p>
        </div>
        <uiSwitch
          :modelValue="generalSettings.canvasCompositingEnabled"
          aria-label="画布合成优化"
          @change="(value) => updateGeneralSettings({ canvasCompositingEnabled: value === true })" />
      </div>
    </section>
    <section class="settingSection" aria-labelledby="canvasEdgeAnimationTitle">
      <div class="settingHeader">
        <div class="settingInfo">
          <h3 id="canvasEdgeAnimationTitle">节点连线动画</h3>
          <p class="description">选中或拖动节点时，与它直接相连的线条显示流动动画。关闭仍保留高亮，立即生效。</p>
        </div>
        <uiSwitch
          :modelValue="generalSettings.canvasEdgeAnimationEnabled"
          aria-label="节点连线动画"
          @change="(value) => updateGeneralSettings({ canvasEdgeAnimationEnabled: value === true })" />
      </div>
    </section>
    <section class="settingSection" aria-labelledby="canvasEdgeColorTitle">
      <div class="settingHeader">
        <div class="settingInfo">
          <h3 id="canvasEdgeColorTitle">节点连线高亮颜色</h3>
          <p class="description">设置选中或拖动节点时，与它直接相连的线条的高亮颜色，立即生效。</p>
        </div>
        <div class="edgeColorControls">
          <uiSelect class="edgeColorSelect" inline :modelValue="generalSettings.canvasEdgeColorMode" :options="edgeColorOptions" aria-label="节点连线颜色模式" @change="value => (value === 'none' || value === 'theme' || value === 'custom') && updateGeneralSettings({ canvasEdgeColorMode: value })" />
          <uiColorPicker
            v-if="generalSettings.canvasEdgeColorMode === 'custom'"
            :modelValue="generalSettings.canvasEdgeColor"
            aria-label="节点连线自选颜色"
            @change="(value) => updateGeneralSettings({ canvasEdgeColor: value || defaultUiSettings.primaryColor })" />
        </div>
      </div>
    </section>
    <canvasShortcuts />
  </div>
</template>

<script setup lang="ts">
import { uiSwitch, uiSelect, uiColorPicker } from "@omnistudio-next/ui";
import { defaultUiSettings, generalSettings, uiSettings, updateGeneralSettings, updateUiSettings } from "@/stores/settings";
import canvasShortcuts from "./canvasShortcuts.vue";
const edgeColorOptions = [{ value: "none", label: "关闭" }, { value: "theme", label: "跟随主题色" }, { value: "custom", label: "自选颜色" }];
</script>

<style lang="scss" scoped>
.general { display: flex; flex-direction: column; gap: 24px; min-width: 0; .settingSection { padding-bottom: 24px; border-bottom: 1px solid var(--uiBorderDefault); .settingHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; :deep(.uiSwitch) { flex-shrink: 0; } .settingInfo { min-width: 0; h3 { margin: 0; color: var(--uiTextPrimary); font-size: var(--uiFontLabel); font-weight: 600; } .description { max-width: 60ch; margin: 8px 0 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; } } .edgeColorControls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; flex-shrink: 0; max-width: 100%; .edgeColorSelect { width: 160px; } } } } @media (max-width: 900px) { .settingSection .settingHeader { flex-wrap: wrap; } } }
</style>

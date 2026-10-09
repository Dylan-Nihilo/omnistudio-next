<template>
  <div class="privacy">
    <section class="settingSection" aria-labelledby="collectionTitle">
      <div class="settingHeader">
        <h3 id="collectionTitle">匿名使用统计</h3>
        <uiSwitch
          :modelValue="privacySettings.dataCollectionEnabled"
          aria-label="匿名使用统计"
          @change="(value) => settings.privacy = { ...privacySettings, dataCollectionEnabled: value === true }" />
      </div>
      <p class="description">帮助我们了解常用功能，改进使用体验。默认开启，可随时关闭。</p>
    </section>

    <section class="settingSection" aria-labelledby="metricsTitle">
      <h3 id="metricsTitle">统计内容</h3>
      <dl class="metricList">
        <div v-for="metric in metrics" :key="metric.label" class="metricItem">
          <dt>{{ metric.label }}</dt>
          <dd>{{ metric.description }}</dd>
        </div>
      </dl>
      <p class="description">统计不包含提示词、对话、文件内容、项目名称、路径、账号或密钥。</p>
    </section>

    <section class="settingSection" aria-labelledby="anonymousIdTitle">
      <h3 id="anonymousIdTitle">匿名 ID</h3>
      <code class="anonymousId">{{ privacySettings.anonymousId || "开启后自动生成" }}</code>
    </section>
  </div>
</template>

<script setup lang="ts">
import { uiSwitch } from "@omnistudio-next/ui";
import { privacySettings, settings } from "@/stores/settings";

const metrics = [
  { label: "使用与回访", description: "随机匿名标识、访问次数与时间" },
  { label: "使用活跃", description: "使用时长和交互次数，不含输入内容" },
  { label: "运行环境", description: "软件版本、桌面或网页端、系统、浏览器和语言" },
  { label: "功能使用", description: "引导、画布与文档的使用情况" },
  { label: "使用规模", description: "项目、模型配置、节点与连线数量，以及节点类型" },
  { label: "Agent 使用", description: "发送次数、完成情况和耗时" },
];
</script>

<style lang="scss" scoped>
.privacy {
  display: flex; flex-direction: column; gap: 32px; min-width: 0;
  .settingSection {
    min-width: 0;
    h3 { margin: 0 0 16px; color: var(--uiTextPrimary); font-size: var(--uiFontLabel); font-weight: 600; }
    .settingHeader { display: flex; align-items: center; justify-content: space-between; gap: 16px; h3 { margin: 0; } }
    .description { max-width: 65ch; margin: 12px 0 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; }
    .metricList { display: flex; flex-direction: column; gap: 16px; margin: 0; .metricItem { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--uiBorderDefault); font-size: var(--uiFontBody); line-height: 1.6; dt { color: var(--uiTextBody); } dd { margin: 0; color: var(--uiTextMuted); } } }
    .anonymousId { display: block; padding: 12px 16px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); color: var(--uiTextBody); overflow-wrap: anywhere; user-select: text; font-size: var(--uiFontControl); }
  }
  @media (max-width: 700px) { .settingSection .metricList .metricItem { grid-template-columns: 1fr; gap: 8px; } }
}
</style>

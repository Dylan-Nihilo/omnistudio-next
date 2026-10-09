<template>
  <div class="platformModelPanel">
    <header class="panelIntro">
      <div>
        <h3>平台文本模型</h3>
        <p>模型由平台统一配置，所有 Workspace 使用同一套可用模型与服务凭证。</p>
      </div>
      <uiButton variant="ghost" :icon="IconRefresh" :loading="models.loading" @click="models.load">刷新</uiButton>
    </header>
    <uiAlert v-if="models.errorMessage" :title="models.errorMessage" tone="error" />
    <p v-if="models.loading && !models.textModels.length" class="listStatus" role="status">正在读取平台模型…</p>
    <p v-else-if="!models.textModels.length" class="listStatus">当前没有可用的文本模型。</p>
    <div v-else class="modelList">
      <uiCard v-for="group in providerGroups" :key="group.providerId" class="modelGroup">
        <header class="groupHeader"><div><h4>{{ group.providerLabel }}</h4><span>{{ group.providerId }}</span></div><uiTag>{{ group.models.length }} 个模型</uiTag></header>
        <ul class="modelItems">
          <li v-for="model in group.models" :key="model.modelId"><modelIcon :model="model.modelId" :size="20" /><div class="modelInfo"><strong>{{ model.label }}</strong><code>{{ model.modelId }}</code></div><uiTag v-for="capability in capabilityLabels(model.capabilities)" :key="capability" tone="neutral">{{ capability }}</uiTag></li>
        </ul>
      </uiCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { uiAlert, uiButton, uiCard, uiTag } from "@omnistudio-next/ui";
import { IconRefresh } from "@tabler/icons-vue";
import { modelIcon } from "@omnistudio-next/model-icons";
import { usePlatformModelsStore } from "@/stores/platformModels";

defineProps<{ visible?: boolean }>();
const models = usePlatformModelsStore();
const providerGroups = computed(() => {
  const groups = new Map<string, { providerId: string; providerLabel: string; models: typeof models.textModels }>();
  for (const model of models.textModels) {
    const group = groups.get(model.providerId) ?? { providerId: model.providerId, providerLabel: model.providerLabel, models: [] };
    group.models.push(model);
    groups.set(model.providerId, group);
  }
  return [...groups.values()];
});

function capabilityLabels(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const labels: Record<string, string> = { vision: "视觉", reasoning: "推理", tools: "工具调用" };
  return Object.entries(value).filter(([, enabled]) => enabled === true).map(([key]) => labels[key] ?? key);
}

onMounted(() => { void models.load(); });
</script>

<style lang="scss" scoped>
.platformModelPanel { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
.panelIntro { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--uiBorderDefault); }
.panelIntro h3 { margin: 0; font-size: var(--uiFontLabel); }
.panelIntro p { max-width: 70ch; margin: 8px 0 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; }
.listStatus { margin: 16px 0; color: var(--uiTextMuted); text-align: center; font-size: var(--uiFontControl); }
.modelList { display: flex; flex-direction: column; gap: 16px; }
.modelGroup { min-width: 0; }
.groupHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.groupHeader h4 { margin: 0; font-size: var(--uiFontTitle); }
.groupHeader span { display: block; margin-top: 4px; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
.modelItems { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
.modelItems li { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); }
.modelInfo { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 4px; }
.modelInfo strong, .modelInfo code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.modelInfo code { color: var(--uiTextMuted); font-size: var(--uiFontControl); }
@media (max-width: 600px) { .panelIntro { flex-wrap: wrap; } }
</style>

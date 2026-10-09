<template>
  <section class="directorPanel" aria-label="动画">
    <header class="chatHeader">
      <icon-sparkles :size="16" aria-hidden="true" />
      <span>方案 <small>{{ plans.length }}</small></span>
    </header>
    <div class="planContent">
      <div v-if="plans.length || tasks.length" class="itemList" aria-label="动画列表">
        <button v-for="plan in plans" :key="plan.id" type="button" class="planItem" :class="{ selected: plan.id === selectedPlanId }" :aria-pressed="plan.id === selectedPlanId" @click="emit('selectPlan', plan.id)">
          <icon-movie :size="18" aria-hidden="true" />
          <div class="itemContent">
            <strong>{{ plan.name }}</strong>
            <span>{{ plan.duration }} 秒 · {{ plan.tracks.length }} 条模型动画</span>
            <template v-if="plan.id === selectedPlanId">
              <span>输入提示词</span>
              <p class="planInstruction">{{ plan.instruction || '此旧方案未保存输入提示词' }}</p>
            </template>
          </div>
          <icon-check v-if="plan.id === selectedPlanId" :size="16" aria-hidden="true" />
        </button>
        <div v-for="task in tasks" :key="task.id" class="planItem taskItem" :aria-busy="!task.error">
          <icon-alert-circle v-if="task.error" :size="18" aria-hidden="true" /><icon-loader-2 v-else class="loadingIcon" :size="18" aria-hidden="true" />
          <div class="itemContent"><strong>{{ task.instruction }}</strong><span v-if="task.error" class="generationError" role="alert">{{ task.error }}</span><span v-else role="status">后台生成中…</span></div>
          <uiIconButton v-if="task.error" :icon="IconArrowBackUp" label="重新编辑指令" @click="emit('editInstruction', task.instruction)" />
        </div>
      </div>
      <template v-else>
        <p>描述模型动作和运镜要求</p>
      </template>
    </div>
    <p class="instructionHint">{{ referenceCount ? `使用 ${referenceCount} 个关键帧生成运镜` : result ? `参考：${result.name}` : '模型动画与运镜同步生成' }}</p>
    <footer class="chatFooter">
      <div class="inputContent"><slot name="input" /></div>
      <div class="inputActions">
        <uiSelect :modelValue="model" class="modelSelect" :options="modelGroups.flatMap(provider => provider.models.map(item => ({ group: provider.label, label: item.label, value: JSON.stringify([item.providerId, item.modelId]) })))" size="small" :loading="modelsLoading" filterable placeholder="选择模型" aria-label="生成模型" @update:modelValue="value => typeof value === 'string' && (model = value)" @visibleChange="$event && emit('loadModels')" />
        <uiButton class="sendButton" :icon="IconSparkles" :disabled="initializing || !prompt.trim() || !model" aria-label="生成动画" @click="sendInstruction">
          生成方案
        </uiButton>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { uiIconButton, uiSelect, uiButton } from "@omnistudio-next/ui";
import { IconLoader2, IconSparkles, IconMovie, IconCheck, IconAlertCircle, IconArrowBackUp } from "@tabler/icons-vue";
import { groupNodeModels, type NodeAiModel } from "@omnistudio-next/nodes-scaffold/runtime";

import type { DirectorPlan, DirectorPlanItem, DirectorGeneration } from "./sceneAnimation";

const props = defineProps<{ result?: DirectorPlan; referenceCount: number; initializing: boolean; plans: DirectorPlanItem[]; selectedPlanId: string; tasks: DirectorGeneration[]; models: NodeAiModel[]; modelsLoading: boolean }>();
const emit = defineEmits<{ editInstruction: [value: string]; selectPlan: [id: string]; send: []; loadModels: [] }>();
const prompt = defineModel<string>("prompt", { default: "" });
const model = defineModel<string>("model", { default: "" });
const modelGroups = computed(() => groupNodeModels(props.models));
function sendInstruction() {
  if (props.initializing || !prompt.value.trim() || !model.value) return;
  emit("send");
}

</script>

<style scoped lang="scss">
.directorPanel { display: flex; flex-direction: column; min-width: 0; min-height: 0; height: 100%; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiBackgroundSubtle); color: var(--uiTextPrimary); overflow: hidden; .chatHeader { display: flex; flex-shrink: 0; align-items: center; gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--uiBorderDefault); font-size: var(--uiFontLabel); small { margin-left: 6px; color: var(--uiTextMuted); } } .planContent { flex: 1; min-height: 0; overflow: auto; padding: 16px; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; .itemList { display: flex; flex-direction: column; gap: 12px; .planItem { display: flex; align-items: flex-start; gap: 12px; width: 100%; padding: 12px; border: 1px solid transparent; border-radius: var(--uiRadiusControl); background: transparent; color: var(--uiTextBody); text-align: left; font: inherit; &:is(button) { cursor: pointer; } &:is(button):hover { background: var(--uiSurfaceHover); } &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: -2px; } &.selected { border-color: var(--uiActionPrimary); background: var(--uiActionSoft); color: var(--uiTextPrimary); } > svg { flex-shrink: 0; margin-top: 3px; } .itemContent { flex: 1; min-width: 0; strong { display: block; font-weight: 600; overflow-wrap: anywhere; } span { display: block; margin-top: 4px; color: var(--uiTextMuted); } .planInstruction { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text; } .generationError { color: var(--uiStatusError); overflow-wrap: anywhere; } } } } p { margin: 12px 0; } .loadingIcon { animation: directorLoading 1.2s linear infinite; } } .instructionHint { flex-shrink: 0; margin: 12px 20px; font-size: var(--uiFontControl); line-height: 1.7; color: var(--uiTextMuted); overflow-wrap: anywhere; } .chatFooter { flex-shrink: 0; padding: 16px; border-top: 1px solid var(--uiBorderDefault); background: var(--uiSurfaceRaised); .inputContent { min-width: 0; :deep(.referenceList) { margin-bottom: 12px; } } .inputActions { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; margin-top: 16px; .modelSelect { min-width: 0; } } } }
@keyframes directorLoading { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .directorPanel .planContent .loadingIcon { animation: none; } }
</style>

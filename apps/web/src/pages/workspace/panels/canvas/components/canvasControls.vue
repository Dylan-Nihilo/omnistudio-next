<template>
  <mini-map v-if="showMap" position="bottom-left" :style="{ bottom: '88px' }" :pannable="true" :zoomable="true" nodeColor="var(--uiSurfaceHover)" maskColor="var(--uiOverlayScrim)" />
  <panel position="bottom-center" class="controlsPanel">
    <nav class="canvasControls nodrag nopan nowheel" aria-label="画布工具">
      <div class="toolGroup">
        <uiTooltip :content="assetsVisible ? '关闭素材库' : '打开素材库'"><uiIconButton :icon="IconFolders" label="素材库" :aria-pressed="assetsVisible" :class="{ isActive: assetsVisible }" @click="assetsVisible = !assetsVisible" /></uiTooltip>
        <uiPopover v-model:visible="undoPopoverVisible" trigger="manual" placement="top-start" :width="180">
          <template #reference><uiTooltip content="整理画布" :disabled="undoPopoverVisible"><uiIconButton :icon="IconSitemap" label="整理画布" :disabled="!canArrange" :loading="arranging" @click="arrangeNodes" /></uiTooltip></template>
          <uiButton class="menuAction" variant="ghost" @click="undoArrange">撤销整理</uiButton>
        </uiPopover>
      </div>
      <div class="toolGroup">
        <uiTooltip :content="showMap ? '隐藏地图' : '显示地图'"><uiIconButton :icon="IconMap" label="显示或隐藏地图" :aria-pressed="showMap" :class="{ isActive: showMap }" @click="showMap = !showMap" /></uiTooltip>
        <uiTooltip :content="snapEnabled ? '关闭网格吸附' : '开启网格吸附'"><uiIconButton :icon="IconMagnet" label="网格吸附" :aria-pressed="snapEnabled" :class="{ isActive: snapEnabled }" @click="snapEnabled = !snapEnabled" /></uiTooltip>
        <uiTooltip :content="showEdges ? '隐藏连线' : '显示连线'"><uiIconButton :icon="IconArrowGuide" label="显示或隐藏连线" :aria-pressed="showEdges" :class="{ isActive: showEdges }" @click="showEdges = !showEdges" /></uiTooltip>
      </div>
      <div class="toolGroup">
        <uiTooltip content="适应视图"><uiIconButton :icon="IconFocusCentered" label="适应视图" @click="fitView()" /></uiTooltip>
        <uiPopover v-model:visible="zoomMenuVisible" placement="top" :width="216">
          <template #reference="{ triggerAttrs }"><uiButton v-bind="triggerAttrs" class="zoomTrigger" variant="ghost" aria-label="缩放菜单" @wheel.stop.prevent="$event.deltaY && applyZoom(Math.min(800, Math.max(20, zoomPercent - Math.sign($event.deltaY))))">{{ zoomPercent }}%</uiButton></template>
          <div class="zoomMenu">
            <uiField label="缩放百分比"><uiNumberInput :modelValue="zoomPercent" :min="20" :max="800" :controls="false" aria-label="缩放百分比" @change="applyZoom" /></uiField>
            <uiButton class="menuAction" variant="ghost" @click="zoomIn()">放大</uiButton>
            <uiButton class="menuAction" variant="ghost" @click="zoomOut()">缩小</uiButton>
            <uiButton class="menuAction" variant="ghost" @click="fitView()">适合屏幕</uiButton>
          </div>
        </uiPopover>
      </div>
      <div class="toolGroup">
        <uiPopover v-model:visible="helpVisible" placement="top-end" :width="216">
          <template #reference="{ triggerAttrs }"><uiIconButton v-bind="triggerAttrs" :icon="IconHelp" label="帮助" /></template>
          <div class="helpMenu">
            <uiButton class="menuAction" variant="ghost" :icon="IconBook" disabled>使用教程</uiButton>
            <uiButton class="menuAction" variant="ghost" :icon="IconBug" disabled>汇报 BUG</uiButton>
            <uiButton class="menuAction" variant="ghost" :icon="IconBrandWechat" disabled>加入交流群</uiButton>
          </div>
        </uiPopover>
      </div>
    </nav>
  </panel>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Panel, useVueFlow, type XYPosition } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import { IconFolders, IconSitemap, IconArrowGuide, IconMap, IconMagnet, IconFocusCentered, IconHelp, IconBook, IconBug, IconBrandWechat } from "@tabler/icons-vue";
import { uiIconButton, uiButton, uiTooltip, uiPopover, uiField, uiNumberInput, useUiFeedback } from "@omnistudio-next/ui";
import { arrangeCanvas } from "../arrangeCanvas";

const feedback = useUiFeedback();
const props = defineProps<{
  canvasId: string;
  directory: string | undefined;
  batchHistory: (action: () => Promise<void>) => Promise<void>;
}>();
const snapEnabled = defineModel<boolean>("snapEnabled", { required: true });
const showEdges = defineModel<boolean>("showEdges", { required: true });
const assetsVisible = defineModel<boolean>("assetsVisible", { default: false });
const showMap = ref(false);
const zoomMenuVisible = ref(false);
const helpVisible = ref(false);
const flow = useVueFlow();
const { viewport, zoomTo, zoomIn, zoomOut, fitView, getNodes, updateNode } = flow;
const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100));
const layoutSnapshot = ref<{ id: string; position: XYPosition }[]>();
const undoPopoverVisible = ref(false);
const arranging = ref(false);
let arrangeController: AbortController | undefined;
const canArrange = computed(() => {
  const nodes = getNodes.value.filter((node) => !node.parentNode);
  return (
    !!props.canvasId &&
    !!props.directory &&
    !arranging.value &&
    nodes.length > 0 &&
    nodes.every((node) => node.dimensions.width > 0 && node.dimensions.height > 0)
  );
});
defineExpose({ arrangeNodes });

watch(
  () => [props.canvasId, props.directory],
  () => {
    arrangeController?.abort();
    layoutSnapshot.value = undefined;
    undoPopoverVisible.value = false;
  },
  { flush: "sync" }
);
onBeforeUnmount(() => arrangeController?.abort());

function applyZoom(value: number | undefined) {
  if (value !== undefined && Number.isFinite(value)) void zoomTo(value / 100);
}

async function arrangeNodes() {
  if (!canArrange.value) return;
  const controller = new AbortController();
  arrangeController = controller;
  arranging.value = true;
  try {
    await props.batchHistory(async () => {
      const { snapshot, arrangedNodeIds } = await arrangeCanvas(flow, controller.signal);
      controller.signal.throwIfAborted();
      if (!arrangedNodeIds.length) return;
      layoutSnapshot.value = snapshot;
      undoPopoverVisible.value = true;
    });
  } catch (error) {
    if (!controller.signal.aborted) feedback.message({ tone: "error", message: error instanceof Error ? error.message : "整理画布失败" });
  } finally {
    arrangeController = undefined;
    arranging.value = false;
  }
}

async function undoArrange() {
  const snapshot = layoutSnapshot.value;
  if (!snapshot) return;
  try {
    await props.batchHistory(async () => {
      const nodeIds = new Set(getNodes.value.map((node) => node.id));
      snapshot.forEach(({ id, position }) => {
        if (nodeIds.has(id)) updateNode(id, { position });
      });
      layoutSnapshot.value = undefined;
      undoPopoverVisible.value = false;
    });
  } catch (error) {
    feedback.message({ tone: "error", message: error instanceof Error ? error.message : "撤销整理失败" });
  }
}
</script>

<style lang="scss" scoped>
.controlsPanel { max-width: calc(100% - 24px); }
.canvasControls {
  display: flex; align-items: center; gap: 4px; max-width: 100%; padding: 6px;
  border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); box-shadow: var(--uiShadowPopover);
  .toolGroup { display: flex; align-items: center; gap: 2px; min-width: 0; padding-inline: 4px; &:not(:last-child) { border-right: 1px solid var(--uiBorderDefault); } .isActive { color: var(--uiActionPrimary); background: var(--uiActionSoft); } .zoomTrigger { min-width: 64px; padding-inline: 8px; font-variant-numeric: tabular-nums; } }
  @media (max-width: 700px) { gap: 0; padding: 4px; .toolGroup { gap: 0; padding-inline: 2px; } }
}
.zoomMenu, .helpMenu { display: flex; flex-direction: column; gap: 8px; .menuAction { width: 100%; justify-content: flex-start; } }
.menuAction { width: 100%; justify-content: flex-start; }
</style>

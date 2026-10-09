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
            <uiButton class="menuAction" variant="ghost" tag="a" :icon="IconBook" href="https://qcn7xdsqgc4z.feishu.cn/docx/RXFqdgR2Xo0dXZxGfd0cZCGgnwf" target="_blank" rel="noopener noreferrer" @click="helpVisible = false">使用教程</uiButton>
            <uiButton class="menuAction" variant="ghost" tag="a" :icon="IconBug" href="https://docs.qq.com/smartsheet/form/EmvmQBrmlPmr%2Fss_vsqk2v%2FvhiGzE?tab=ss_vsqk2v" target="_blank" rel="noopener noreferrer" title="omnistudio-next 需求/BUG反馈表" @click="helpVisible = false">汇报 BUG</uiButton>
            <uiButton class="menuAction" variant="ghost" :icon="IconBrandWechat" @click="showContact('community')">加入交流群</uiButton>
            <uiButton class="menuAction" variant="ghost" :icon="IconBriefcase" @click="showContact('business')">商务合作</uiButton>
          </div>
        </uiPopover>
      </div>
    </nav>
  </panel>
  <uiDialog v-model="contactVisible" :title="contactInfo.title" :width="360">
    <div class="contactContent"><q-r-code :value="contactInfo.url" :size="192" type="svg" color="#000000" bgColor="#ffffff" borderless role="img" :aria-label="`${contactInfo.title}二维码`" /><p class="contactTip">{{ contactInfo.tip }}</p></div>
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { Panel, useVueFlow, type XYPosition } from "@vue-flow/core";
import { MiniMap } from "@vue-flow/minimap";
import { IconFolders, IconSitemap, IconArrowGuide, IconMap, IconMagnet, IconFocusCentered, IconHelp, IconBook, IconBug, IconBrandWechat, IconBriefcase } from "@tabler/icons-vue";
import { uiIconButton, uiButton, uiTooltip, uiPopover, uiDialog, uiField, uiNumberInput, useUiFeedback } from "@omnistudio-next/ui";
import { QRCode } from "tdesign-vue-next";
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
const contactVisible = ref(false);
const contactType = ref<"community" | "business">("community");
const contacts = {
  community: {
    title: "加入交流群",
    url: "https://work.weixin.qq.com/u/vc36adcc89845edcbe?v=5.0.3.63936&bb=85b8d228e8",
    tip: "omnistudio-next 是为爱发电的开源项目。欢迎文明交流、友善反馈；回复可能需要一些时间，请避免责问或命令式沟通，感谢你的理解与尊重。",
  },
  business: {
    title: "商务合作",
    url: "https://work.weixin.qq.com/u/vc0f54596c5837d05a?v=5.0.8.70675",
    tip: "此联系方式仅用于商务合作接洽，不提供问题答疑。使用问题欢迎在交流群交流，需求与 BUG 可通过反馈表提交。感谢理解。",
  },
};
const contactInfo = computed(() => contacts[contactType.value]);
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

function showContact(type: "community" | "business") {
  contactType.value = type;
  helpVisible.value = false;
  contactVisible.value = true;
}

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
.contactContent { display: flex; flex-direction: column; align-items: center; gap: 20px; .contactTip { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; } }
</style>

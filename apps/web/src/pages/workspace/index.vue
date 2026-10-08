<template>
  <main class="workspacePage" :style="{ '--agentWidth': `${agentVisible ? agentWidth : 0}px` }">
    <header ref="headerElement" class="workspaceHeader">
      <div class="projectBrand"><img class="brandLogo" :src="logoUrl" alt="OmniStudio" /><div class="projectInfo"><strong :title="workspaceStore.project?.name">{{ workspaceStore.project?.name }}</strong><span :title="workspaceStore.project?.directory">{{ workspaceStore.project?.directory }}</span></div></div>
      <uiRadioGroup :modelValue="activePanel" class="panelSwitcher" :options="panelOptions" variant="segmented" aria-label="切换面板" @change="switchPanel" />
      <div class="headerActions"><uiButton variant="ghost" :icon="IconMessageCircle" :class="{ isActive: agentVisible }" :aria-expanded="agentVisible" aria-label="Toonflow Agent" aria-controls="agentPanel" @click="agentVisible = !agentVisible">AI 对话</uiButton><workspaceMenu @openSettings="settingsVisible = true" /></div>
    </header>
    <div class="workspaceStage">
      <canvasPanel :key="workspaceStore.project?.directory" ref="canvasPanelRef" class="canvasPanel" :class="{ backgroundPanel: activePanel !== 'canvas' }" :inert="activePanel !== 'canvas'" :aria-hidden="activePanel !== 'canvas'" :active="activePanel === 'canvas'" :settingsVisible="settingsVisible" />
      <keep-alive :max="1"><documentPanel v-if="activePanel === 'document'" :key="workspaceStore.project?.directory" ref="documentPanelRef" :readNode="readDocumentNode" :saveNode="saveDocumentNode" /></keep-alive>
    </div>
    <floatingAgent v-model="agentVisible" :topOffset="headerHeight" @resize="agentWidth = $event" />
    <settings v-model="settingsVisible" />
  </main>
</template>

<script setup lang="ts">
import { defineAsyncComponent, nextTick, onMounted, onScopeDispose, provide, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import axios from "axios";
import { IconLayoutDashboard, IconFileText, IconMessageCircle } from "@tabler/icons-vue";
import { uiRadioGroup, uiButton, useUiFeedback } from "@toonflow/ui";
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
import settings from "@/components/settings/index.vue";
import { useWorkspaceStore } from "@/stores/workspace";
import { registerWorkspaceControl, waitForControlValue } from "@/lib/mcpControl";
import anonymousData from "@/lib/anonymousData";
import canvasPanel from "./panels/canvas/canvasHost.vue";
import workspaceMenu from "./components/workspaceMenu.vue";
import floatingAgent from "./components/floatingAgent.vue";

const documentPanel = defineAsyncComponent(() => import("./panels/document/index.vue"));

const feedback = useUiFeedback();
const headerElement = ref<HTMLElement>();
const headerHeight = ref(0);
watch(headerElement, (element, _previous, onCleanup) => {
  if (!element) return;
  const observer = new ResizeObserver(() => { headerHeight.value = element.getBoundingClientRect().height; });
  observer.observe(element);
  onCleanup(() => observer.disconnect());
}, { flush: "post" });
const activePanel = ref<"canvas" | "document">("canvas");
onMounted(() => anonymousData.track("workspace.canvas"));
const workspaceStore = useWorkspaceStore();
const panelOptions = [
  { label: "画布", value: "canvas", icon: IconLayoutDashboard },
  { label: "文档", value: "document", icon: IconFileText },
];
const agentVisible = ref(true);
const agentWidth = ref(0);
const settingsVisible = ref(false);
const canvasPanelRef = ref<InstanceType<typeof canvasPanel>>();
const documentPanelRef = ref<InstanceType<typeof documentPanel>>();
provide("canvas", () => canvasPanelRef.value?.getCanvasContext());
provide("mentionCanvas", () => canvasPanelRef.value?.mentionSource);
provide("activateCanvasPanel", () => switchPanel("canvas"));

const controlLifetime = new AbortController();
onScopeDispose(() => controlLifetime.abort(new Error("工作区已关闭")));
registerWorkspaceControl({
  getState: () => ({
    directory: workspaceStore.project?.directory ?? null,
    canvasId: canvasPanelRef.value?.canvasId || null,
    panel: activePanel.value,
    tools: canvasPanelRef.value?.canvasReady ? canvasPanelRef.value.getCanvasContext()?.tools ?? [] : [],
    document: documentPanelRef.value?.getDocument(false),
  }),
  flushSave,
  async call(request, signal) {
    const directory = workspaceStore.project?.directory;
    if (!directory) throw new Error("请先打开工作区");
    const callSignal = AbortSignal.any([signal, controlLifetime.signal]);
    const checkDirectory = () => {
      callSignal.throwIfAborted();
      if (directory !== workspaceStore.project?.directory) throw new Error("工作区已切换，本次调用已停止");
    };
    checkDirectory();
    if (request.name === "switchPanel") {
      if (request.args.panel !== "canvas" && request.args.panel !== "document") throw new Error("未知面板");
      if (!(await switchPanel(request.args.panel))) throw new Error("面板切换失败，请检查文档是否保存成功");
      checkDirectory();
      return { panel: activePanel.value };
    }
    if (["getDocument", "openDocument", "writeDocument"].includes(request.name)) {
      if (!(await switchPanel("document"))) throw new Error("文档面板无法打开");
      const panel = await waitForControlValue(() => documentPanelRef.value, callSignal);
      checkDirectory();
      if (request.name === "openDocument") await panel.openDocument(request.args, callSignal);
      if (request.name === "writeDocument") await panel.writeDocument(request.args, callSignal);
      checkDirectory();
      return panel.getDocument();
    }
    if (!(await switchPanel("canvas"))) throw new Error("画布面板无法打开");
    const context = await waitForControlValue(
      () => (canvasPanelRef.value?.canvasReady ? canvasPanelRef.value.getCanvasContext() : undefined),
      callSignal
    );
    checkDirectory();
    return context.call({ name: request.name, args: request.args }, callSignal);
  },
});

async function flushSave() {
  await documentPanelRef.value?.flushSave();
  await canvasPanelRef.value?.flushSave();
}

onBeforeRouteLeave(async () => {
  if (canvasPanelRef.value?.saveBusy) {
    feedback.message({ tone: "warning", message: "画布操作尚未完成，请稍后退出" });
    return false;
  }
  try {
    await flushSave();
    return true;
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error)
      ? error.response?.data?.message || error.message
      : error instanceof Error
      ? error.message
      : "项目保存失败";
    const leave = await feedback.confirm(`无法保存项目：${message}。文件或目录可能已被移动或删除。仍然退出将丢弃尚未保存的修改。`, "项目未保存", {
      danger: true,
      confirmButtonText: "仍然退出",
      cancelButtonText: "留在项目",
      closeOnClickModal: false,
    }).then(
      () => true,
      () => false
    );
    if (leave) {
      documentPanelRef.value?.cancelSave();
      canvasPanelRef.value?.cancelSave();
    }
    return leave;
  }
});

async function switchPanel(value: string | number | boolean) {
  if (value !== "canvas" && value !== "document") return false;
  try {
    if (activePanel.value === "document") await documentPanelRef.value?.flushSave();
    const changed = activePanel.value !== value;
    activePanel.value = value;
    await nextTick();
    if (changed) anonymousData.track(value === "canvas" ? "workspace.canvas" : "workspace.document");
    return true;
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "文本保存失败";
    feedback.message({ tone: "error", message });
    return false;
  }
}

function readDocumentNode(directory: string, canvasPath: string, nodeId: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.readDocumentNode(directory, canvasPath, nodeId);
}

function saveDocumentNode(directory: string, canvasPath: string, nodeId: string, handleId: string, text: string) {
  if (!canvasPanelRef.value) throw new Error("画布尚未就绪");
  return canvasPanelRef.value.saveDocumentNode(directory, canvasPath, nodeId, handleId, text);
}
</script>

<style scoped lang="scss">
.workspacePage {
  display: flex; flex-direction: column; position: relative; width: 100%; height: 100dvh; min-width: 0; overflow: hidden; background: var(--uiBackgroundBase);
  .workspaceHeader { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 20px; flex-shrink: 0; min-height: 72px; padding: 12px 20px; border-bottom: 1px solid var(--uiBorderDefault); background: var(--uiBackgroundSubtle); z-index: var(--uiLayerSticky); .projectBrand { display: flex; align-items: center; gap: 20px; min-width: 0; .brandLogo { display: block; width: 128px; height: auto; flex-shrink: 0; background: #101010; border-radius: var(--uiRadiusControl); } .projectInfo { display: flex; flex-direction: column; gap: 6px; min-width: 0; strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--uiTextPrimary); font-size: var(--uiFontLabel); font-weight: 600; } span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--uiTextMuted); font-size: var(--uiFontControl); } } } .headerActions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; min-width: 0; .isActive { color: var(--uiActionPrimary); background: var(--uiActionSoft); } } }
  .workspaceStage { position: relative; flex: 1; min-width: 0; min-height: 0; margin-right: var(--agentWidth); isolation: isolate; .canvasPanel { position: absolute; inset: 0; &.backgroundPanel { opacity: 0; visibility: hidden; pointer-events: none; } } :deep(.canvasMenu) { margin-left: 0; } :deep(.documentPanel) { height: 100%; min-height: 0; } }
  @media (max-width: 1100px) { .workspaceHeader { gap: 12px; padding-inline: 16px; .projectBrand { gap: 12px; .brandLogo { width: 96px; } } } }
}
</style>

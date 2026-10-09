<template>
  <div class="groupNode" :class="{ selected, resizing: !!resize }">
    <input
      v-if="editingLabel"
      ref="labelInput"
      v-model="labelDraft"
      class="groupLabelInput nodrag nopan"
      aria-label="分组名称"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
      @dblclick.stop
      @keydown.stop
      @keydown.enter="confirmLabel"
      @keydown.esc.prevent="editingLabel = false"
      @blur="saveLabel" />
    <span v-else class="groupLabel" tabindex="0" :title="`${data.label || '分组'}（双击编辑名称）`" @dblclick.stop="editLabel" @keydown.enter.stop.prevent="editLabel">
      {{ data.label || "分组" }}
    </span>
    <button
      v-for="corner in resizeCorners"
      :key="corner.name"
      class="resizeCorner nodrag nopan"
      :class="corner.name"
      type="button"
      :aria-label="`调整分组${corner.label}`"
      @pointerdown.stop.prevent="startResize($event, corner)"
      @pointermove.stop="moveResize"
      @pointerup.stop="finishResize"
      @pointercancel="finishResize"
      @lostpointercapture="finishResize"
      @keydown="resizeWithKeyboard($event, corner)"
      @mousedown.stop
      @click.stop
      @dblclick.stop />
  </div>
</template>

<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useVueFlow, type GraphNode, type NodeProps } from "@vue-flow/core";
import { useUiFeedback } from "@omnistudio-next/ui";

const feedback = useUiFeedback();
const props = defineProps<NodeProps>();
const flow = useVueFlow();
const batchHistory = inject<((action: () => Promise<void>) => Promise<void>) | undefined>("batchCanvasHistory", undefined);
const editingLabel = ref(false);
const labelDraft = ref("");
const labelInput = ref<HTMLInputElement>();
const resizeCorners = [
  { name: "topLeft", label: "左上角", x: -1, y: -1 },
  { name: "topRight", label: "右上角", x: 1, y: -1 },
  { name: "bottomLeft", label: "左下角", x: -1, y: 1 },
  { name: "bottomRight", label: "右下角", x: 1, y: 1 },
] as const;
type ResizeCorner = typeof resizeCorners[number];
const resize = shallowRef<{
  node: GraphNode;
  corner: ResizeCorner;
  element: HTMLElement;
  pointerId: number;
  point: { x: number; y: number };
  position: { x: number; y: number };
  width: number;
  height: number;
  resolve: () => void;
}>();

async function editLabel() {
  labelDraft.value = props.data.label || "分组";
  editingLabel.value = true;
  await nextTick();
  labelInput.value?.select();
}

function saveLabel() {
  if (!editingLabel.value) return;
  const label = labelDraft.value.trim();
  if (label) flow.updateNodeData(props.id, { label });
  editingLabel.value = false;
}

function confirmLabel(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  saveLabel();
}

function startResize(event: PointerEvent, corner: ResizeCorner) {
  if (event.button !== 0 || resize.value) return;
  const node = flow.findNode(props.id);
  if (!node) return;
  const action = () => new Promise<void>(resolve => {
    const element = event.currentTarget as HTMLElement;
    resize.value = {
      node, corner, element, pointerId: event.pointerId,
      point: flow.screenToFlowCoordinate({ x: event.clientX, y: event.clientY }),
      position: { ...node.position }, width: node.dimensions.width, height: node.dimensions.height, resolve,
    };
    node.resizing = true;
    element.setPointerCapture(event.pointerId);
  });
  void (batchHistory ? batchHistory(action) : action()).catch(error => {
    finishResize();
    feedback.message({ tone: "error", message: error instanceof Error ? error.message : "分组缩放失败" });
  });
}

function moveResize(event: PointerEvent) {
  const state = resize.value;
  if (!state || event.pointerId !== state.pointerId) return;
  if (flow.findNode(props.id) !== state.node) return finishResize();
  const point = flow.screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  const width = Math.max(120, state.width + (point.x - state.point.x) * state.corner.x);
  const height = Math.max(80, state.height + (point.y - state.point.y) * state.corner.y);
  const position = {
    x: state.position.x + (state.corner.x < 0 ? state.width - width : 0),
    y: state.position.y + (state.corner.y < 0 ? state.height - height : 0),
  };
  applySize(state.node, position, width, height);
}

function applySize(node: GraphNode, position: { x: number; y: number }, width: number, height: number) {
  const dx = position.x - node.position.x;
  const dy = position.y - node.position.y;
  for (const child of flow.getNodes.value) {
    if (child.parentNode === props.id) flow.updateNode(child.id, { position: { x: child.position.x - dx, y: child.position.y - dy } });
  }
  flow.updateNode(props.id, {
    position,
    style: { ...(typeof node.style === "object" ? node.style : {}), width: `${width}px`, height: `${height}px` },
  });
  node.dimensions = { width, height };
}

function resizeWithKeyboard(event: KeyboardEvent, corner: ResizeCorner) {
  if (event.isComposing || resize.value || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const node = flow.findNode(props.id);
  if (!node) return;
  const step = event.shiftKey ? 1 : 16;
  const width = Math.max(120, node.dimensions.width + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0) * corner.x);
  const height = Math.max(80, node.dimensions.height + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0) * corner.y);
  const position = { x: node.position.x + (corner.x < 0 ? node.dimensions.width - width : 0), y: node.position.y + (corner.y < 0 ? node.dimensions.height - height : 0) };
  const action = () => { applySize(node, position, width, height); return Promise.resolve(); };
  void (batchHistory ? batchHistory(action) : action()).catch(error => {
    feedback.message({ tone: "error", message: error instanceof Error ? error.message : "分组缩放失败" });
  });
}

function finishResize(event?: PointerEvent) {
  const state = resize.value;
  if (!state || (event && event.pointerId !== state.pointerId)) return;
  resize.value = undefined;
  state.node.resizing = false;
  if (state.element.hasPointerCapture(state.pointerId)) state.element.releasePointerCapture(state.pointerId);
  state.resolve();
}

onBeforeUnmount(() => finishResize());

watch(
  () => flow.getNodes.value.filter(node => node.parentNode === props.id),
  children => {
    // ACT: 拖动期间保持分组框不变，松手后由画布统一贴合内容。
    children.forEach(node => { node.expandParent = false; });
  },
  { immediate: true },
);
</script>

<style lang="scss" scoped>
.groupNode {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border: 1px solid var(--uiBorderControl);
  border-radius: var(--uiRadiusControl);
  background: color-mix(in srgb, var(--uiBackgroundSubtle) 25%, transparent);

  &.selected {
    border-color: color-mix(in srgb, var(--uiActionPrimary) 50%, var(--uiBorderControl));
  }

  &:hover,
  &.selected,
  &.resizing {
    .resizeCorner { opacity: 1; }
  }

  .groupLabel,
  .groupLabelInput {
    position: absolute;
    left: 12px;
    top: 8px;
    height: 22px;
    max-width: calc(100% - 24px);
    line-height: 20px;
  }

  .groupLabel {
    color: var(--uiTextMuted);
    font-size: 12px;
    user-select: none;
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .groupLabelInput {
    box-sizing: border-box;
    width: 100%;
    padding: 0 3px;
    border: 1px solid var(--uiActionPrimary);
    border-radius: var(--uiRadiusControl);
    outline: none;
    background: var(--uiSurfaceRaised);
    color: var(--uiTextPrimary);
    font-family: inherit;
    font-size: 12px;
  }

  .resizeCorner {
    position: absolute;
    width: 9px;
    height: 9px;
    padding: 0;
    border: 1px solid var(--uiActionPrimary);
    border-radius: 2px;
    background: var(--uiSurfaceRaised);
    opacity: 0;
    touch-action: none;

    &:focus-visible { opacity: 1; }
    &.topLeft { top: -5px; left: -5px; cursor: nwse-resize; }
    &.topRight { top: -5px; right: -5px; cursor: nesw-resize; }
    &.bottomLeft { bottom: -5px; left: -5px; cursor: nesw-resize; }
    &.bottomRight { bottom: -5px; right: -5px; cursor: nwse-resize; }
  }
}
</style>

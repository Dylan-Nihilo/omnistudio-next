<template>
  <selectionHandle
    v-if="!singleGroupSelected"
    ref="selectionHandleRef"
    @start="startSelectionConnection"
    @release="(event, nodes) => openMenu(event, true, [], undefined, nodes)" />
  <selectionHandle
    v-for="group in groups"
    :key="group.id"
    ref="groupHandleRefs"
    :nodes="[group]"
    @start="startSelectionConnection"
    @release="(event, nodes) => openMenu(event, true, [], undefined, nodes)" />
  <uiDropdown ref="menu" class="nodeMenu" trigger="manual" :anchor="menuAnchor" :items="menuItems" :hideOnClick="false" placement="bottom-start" :aria-label="menuLevel === 'selection' ? '选区操作' : menuLevel === 'arrange' ? '整理选中节点' : menuLevel === 'actions' ? '操作菜单' : '添加节点'" @command="handleCommand" @visibleChange="visible => !visible && clearConnection()" />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, type Component } from "vue";
import { useVueFlow, type ConnectingHandle, type GraphNode, type HandleType } from "@vue-flow/core";
import { isTypeCompatible, useNodeEvent, validateConnection, type NodeHandle } from "@omnistudio-next/nodes-scaffold/runtime";
import { uiDropdown, useUiFeedback, type UiMenuItem } from "@omnistudio-next/ui";
import selectionHandle from "./selectionHandle.vue";
import { getSelectionConnections } from "../selectionConnections";
import { getSelectionRoots, getSelectionTree } from "../selectionNodes";
import { arrangeSelection } from "../arrangeSelection";
import {
  IconClipboard,
  IconCopyPlus,
  IconTrash,
  IconBox,
  IconUpload,
  IconPlus,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconChevronLeft,
  IconLayoutColumns,
  IconLayoutRows,
  IconLayoutGrid,
} from "@tabler/icons-vue";

const feedback = useUiFeedback();
const { remoteNodes = [], pasteNode, uploadFiles, canUndo = false, canRedo = false, selectionBusy = false, batchHistory } = defineProps<{
  remoteNodes?: { type: string; label: string }[];
  pasteNode?: (position: { x: number; y: number }) => Promise<boolean>;
  uploadFiles?: (position: { x: number; y: number }) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  selectionBusy?: boolean;
  batchHistory?: (action: () => Promise<void>) => Promise<void>;
}>();
const emit = defineEmits<{ history: []; undo: []; redo: []; duplicateSelection: [] }>();
const menu = ref<InstanceType<typeof uiDropdown>>();
const menuLevel = ref<"actions" | "nodes" | "selection" | "arrange">("actions");
const selectedNodes = shallowRef<GraphNode[]>([]);
const deleting = ref(false);
const pasting = ref(false);
const directNodes = ref(false);
const menuAnchor = shallowRef({ getBoundingClientRect: () => new DOMRect() });
const flow = useVueFlow();
const { addNodes, screenToFlowCoordinate, onPaneContextMenu, onSelectionContextMenu, onPaneClick, onMoveStart } = flow;
let nodePosition = { x: 0, y: 0 };
type DraggedHandle = { node: GraphNode; id: string; type: HandleType; start: ConnectingHandle };
const pendingHandle = shallowRef<DraggedHandle>();
const pendingGroup = shallowRef<GraphNode[]>([]);
const selectionHandleRef = ref<InstanceType<typeof selectionHandle>>();
const groupHandleRefs = ref<InstanceType<typeof selectionHandle>[]>([]);
const groups = computed(() => flow.getNodes.value.filter(node => node.type === "canvasGroup" && !node.hidden));
const singleGroupSelected = computed(() => flow.getSelectedNodes.value.length === 1 && flow.getSelectedNodes.value[0]?.type === "canvasGroup");
const canArrangeSelection = computed(() => {
  const nodes = getSelectionRoots(selectedNodes.value, flow.getNodes.value);
  return !selectionBusy && !deleting.value && nodes.length > 1
    && nodes.every(node => flow.findNode(node.id) === node && node.draggable !== false
      && Number.isFinite(node.dimensions.width) && node.dimensions.width > 0
      && Number.isFinite(node.dimensions.height) && node.dimensions.height > 0);
});
const nodeOrder: Record<string, number> = { "remote-textNode": 0, "remote-imageNode": 1, "remote-videoNode": 2, "remote-audioNode": 3 };
const filteredNodes = computed(() => {
  const nodes = remoteNodes.map(node => ({
    ...node,
    icon: (flow.nodeTypes?.value?.[node.type] as { icon?: Component } | undefined)?.icon ?? IconBox,
  })).sort((left, right) => (nodeOrder[left.type] ?? 4) - (nodeOrder[right.type] ?? 4));
  if (pendingGroup.value.length) {
    if (!flow.nodesConnectable.value || pendingGroup.value.some(node => flow.findNode(node.id) !== node || node.connectable === false)) return [];
    return nodes.filter(node => {
      const targets = (flow.nodeTypes?.value?.[node.type] as { handles?: NodeHandle[] } | undefined)?.handles?.filter(handle => handle.type === "target") ?? [];
      return pendingGroup.value.every(source => (source.data.handles as NodeHandle[] | undefined)?.some(output =>
        output.type === "source" && targets.some(input => isTypeCompatible(output.dataType, input.dataType))));
    });
  }
  const handle = pendingHandle.value;
  if (!handle) return nodes;
  if (flow.findNode(handle.node.id) !== handle.node || !flow.nodesConnectable.value || handle.node.connectable === false) return [];
  const port = (handle.node.data.handles as NodeHandle[] | undefined)?.find((item) => item.id === handle.id && item.type === handle.type);
  if (!port) return [];
  return nodes.filter((node) => {
    const handles = (flow.nodeTypes?.value?.[node.type] as { handles?: NodeHandle[] } | undefined)?.handles;
    return handles?.some((item) => item.type !== port.type && isTypeCompatible(port.dataType, item.dataType));
  });
});

const menuItems = computed<UiMenuItem[]>(() => {
  if (menuLevel.value === "selection") return [
    { value: "duplicateSelection", label: "创建副本", icon: IconCopyPlus, disabled: selectionBusy || deleting.value || !selectedNodes.value.length },
    { value: "arrange", label: "整理选中节点", icon: IconLayoutGrid, disabled: !canArrangeSelection.value },
    { value: "deleteSelection", label: deleting.value ? "删除中…" : `删除选中节点（${selectedNodes.value.length}）`, icon: IconTrash, divided: true, disabled: selectionBusy || deleting.value || !selectedNodes.value.some(node => node.deletable !== false) },
  ];
  if (menuLevel.value === "arrange") return [
    { value: "selection", label: "返回选区操作", icon: IconChevronLeft },
    { value: "horizontal", label: "水平排列", icon: IconLayoutColumns, divided: true, disabled: !canArrangeSelection.value },
    { value: "vertical", label: "垂直排列", icon: IconLayoutRows, disabled: !canArrangeSelection.value },
    { value: "grid", label: "宫格排列", icon: IconLayoutGrid, disabled: !canArrangeSelection.value },
  ];
  if (menuLevel.value === "actions") return [
    { value: "upload", label: "上传", icon: IconUpload, disabled: !uploadFiles },
    { value: "nodes", label: "添加节点", icon: IconPlus },
    { value: "undo", label: "撤销", icon: IconArrowBackUp, divided: true, disabled: !canUndo },
    { value: "redo", label: "重做", icon: IconArrowForwardUp, disabled: !canRedo },
    { value: "paste", label: pasting.value ? "粘贴中…" : "从剪切板粘贴", icon: IconClipboard, divided: true, disabled: !pasteNode || pasting.value },
  ];
  return [
    { value: "actions", label: directNodes.value ? "添加节点" : "返回操作菜单", icon: directNodes.value ? IconPlus : IconChevronLeft, disabled: directNodes.value },
    ...filteredNodes.value.map(node => ({ value: node.type, label: node.label, icon: node.icon })),
    ...((pendingHandle.value || pendingGroup.value.length) && !filteredNodes.value.length ? [{ value: "empty", label: "没有可连接的节点", disabled: true }] : []),
  ];
});

function clearSelectionHandles() {
  selectionHandleRef.value?.clear();
  groupHandleRefs.value.forEach(handle => handle.clear());
}

function clearConnection() {
  if (pendingHandle.value) {
    pendingHandle.value = undefined;
    flow.endConnection();
  }
  if (pendingGroup.value.length) {
    pendingGroup.value = [];
    clearSelectionHandles();
  }
}

function startSelectionConnection() {
  clearConnection();
  clearSelectionHandles();
  menu.value?.close();
}

onBeforeUnmount(clearConnection);
flow.onConnectStart(() => {
  pendingHandle.value = undefined;
  clearConnection();
  menu.value?.close();
});

flow.onConnectEnd((event) => {
  const handle = flow.connectionStartHandle.value;
  if (!handle || flow.connectionStatus.value === "valid" || !event || event.type === "touchcancel") return;
  const node = flow.findNode(handle.nodeId);
  if (!node || handle.id == null) return;
  const point = "changedTouches" in event ? event.changedTouches[0] : event;
  if (!point) return;
  const target = document.elementFromPoint(point.clientX, point.clientY);
  if (!target?.classList.contains("vue-flow__pane") || !flow.vueFlowRef.value?.contains(target)) return;
  void openMenu(event, true, [], { node, id: handle.id, type: handle.type, start: { ...handle } });
});

async function openMenu(event: MouseEvent | TouchEvent, nodesOnly = false, selection: GraphNode[] = [], handle?: DraggedHandle, group: GraphNode[] = []) {
  event.preventDefault();
  event.stopPropagation();
  emit("history");
  menu.value?.close();
  clearConnection();
  await nextTick();
  if (!menu.value || (handle && flow.findNode(handle.node.id) !== handle.node)) return;
  pendingHandle.value = handle;
  pendingGroup.value = group;
  directNodes.value = nodesOnly;
  selectedNodes.value = [...selection];
  menuLevel.value = selection.length ? "selection" : nodesOnly ? "nodes" : "actions";
  const point = "changedTouches" in event ? event.changedTouches[0] : event;
  if (!point) return;
  const { clientX, clientY } = point;
  nodePosition = screenToFlowCoordinate({ x: clientX, y: clientY });
  menuAnchor.value = { getBoundingClientRect: () => new DOMRect(clientX, clientY, 0, 0) };
  if (handle) {
    const bounds = flow.vueFlowRef.value!.getBoundingClientRect();
    // ACT: VueFlow 在释放后清空拖线；菜单期间复用其预览，避免创建临时节点或边。
    flow.startConnection(handle.start, { x: clientX - bounds.left, y: clientY - bounds.top });
  }
  await nextTick();
  menu.value?.open();
}

onPaneContextMenu(openMenu);
onSelectionContextMenu(({ event, nodes }) => openMenu(event, false, nodes));
onPaneClick(() => menu.value?.close());
onMoveStart(() => menu.value?.close());
flow.onNodeContextMenu(() => {
  clearConnection();
  menu.value?.close();
});
defineExpose({ openMenu, deleteSelection });

async function handleCommand(command: unknown) {
  if (command === "nodes" || command === "actions" || command === "selection" || command === "arrange") {
    if (command === "arrange" && !canArrangeSelection.value) return;
    menuLevel.value = command;
    await nextTick();
    menu.value?.open();
    return;
  }
  if (command === "duplicateSelection") {
    if (selectionBusy || deleting.value || !selectedNodes.value.length) return;
    menu.value?.close();
    emit("duplicateSelection");
    return;
  }
  if (command === "upload") {
    menu.value?.close();
    uploadFiles?.({ ...nodePosition });
    return;
  }
  if (command === "undo" || command === "redo") {
    if (command === "undo" ? !canUndo : !canRedo) return;
    menu.value?.close();
    if (command === "undo") emit("undo");
    else emit("redo");
    return;
  }
  if (batchHistory) {
    try {
      await batchHistory(() => runCommand(command));
    } catch (error) {
      feedback.message({ tone: "error", message: error instanceof Error ? error.message : "画布操作失败" });
    }
    return;
  }
  await runCommand(command);
}

async function runCommand(command: unknown) {
  if (command === "horizontal" || command === "vertical" || command === "grid") {
    if (!canArrangeSelection.value) return;
    arrangeSelection(flow, selectedNodes.value, command);
    menu.value?.close();
    return;
  }
  if (command === "paste") {
    if (!pasteNode || pasting.value) return;
    pasting.value = true;
    try {
      if (await pasteNode({ ...nodePosition })) menu.value?.close();
    } finally {
      pasting.value = false;
    }
    return;
  }
  if (command === "deleteSelection") {
    await deleteSelection();
    return;
  }
  const node = filteredNodes.value.find((option) => option.type === command);
  if (!node) return;
  const handle = pendingHandle.value;
  const group = pendingGroup.value;
  if (handle && flow.findNode(handle.node.id) !== handle.node) return;
  if (group.some(source => flow.findNode(source.id) !== source)) return;
  const id = crypto.randomUUID();
  addNodes({ id, type: node.type, position: { ...nodePosition }, data: { label: node.label } });
  if (!handle && !group.length) {
    flow.removeSelectedElements();
    flow.nodesSelectionActive.value = false;
    const created = flow.findNode(id);
    if (created) flow.addSelectedNodes([created]);
    return menu.value?.close();
  }
  // ACT: 远端节点挂载后才注册端口，沿用画布工具的 nextTick 等待方式。
  await nextTick();
  const created = flow.findNode(id);
  if (group.length) {
    if (!created) return;
    const connections = flow.nodesConnectable.value
      ? getSelectionConnections(group, created, flow.getNodes.value, flow.getEdges.value)
      : undefined;
    if (connections) {
      flow.addEdges(connections);
      flow.removeSelectedElements();
      flow.nodesSelectionActive.value = false;
      clearConnection();
      menu.value?.close();
    } else {
      flow.removeNodes(id, true);
      flow.removeSelectedElements();
      flow.addSelectedNodes(group);
      flow.nodesSelectionActive.value = true;
      feedback.message({ tone: "warning", message: "该节点的接收规则不允许整组选中节点连接" });
    }
    return;
  }
  if (!handle) return;
  if (!created || flow.findNode(handle.node.id) !== handle.node) {
    clearConnection();
    return menu.value?.close();
  }
  const sourceNode = handle.type === "source" ? handle.node : created;
  const targetNode = handle.type === "target" ? handle.node : created;
  const connection = (created.data.handles as NodeHandle[] | undefined)
    ?.filter((item) => item.type !== handle.type)
    .map((item) => ({
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: handle.type === "source" ? handle.id : item.id,
      targetHandle: handle.type === "target" ? handle.id : item.id,
    }))
    .find(
      (item) =>
        flow.nodesConnectable.value &&
        sourceNode.connectable !== false &&
        targetNode.connectable !== false &&
        validateConnection(item, { sourceNode, targetNode, nodes: flow.getNodes.value, edges: flow.getEdges.value })
    );
  if (connection) flow.addEdges(connection);
  else feedback.message({ tone: "warning", message: "节点已创建，但没有兼容的端口可连接" });
  clearConnection();
  menu.value?.close();
}

async function deleteSelection(selection = selectedNodes.value) {
  if (selectionBusy || deleting.value) return;
  const nodes = getSelectionTree(selection.filter(node => node.deletable !== false), flow.getNodes.value).reverse();
  const nodeIds = new Set(nodes.filter(node => node.deletable !== false).map(node => node.id));
  deleting.value = true;
  try {
    for (const node of nodes) {
      if (node.deletable === false || flow.findNode(node.id) !== node) continue;
      if (flow.getNodes.value.some(item => item.parentNode === node.id && !nodeIds.has(item.id))) throw new Error("分组中存在不可删除的节点");
      if (flow.getConnectedEdges(node.id).some((edge) => edge.deletable === false)) throw new Error("节点存在不可删除的连接");
    }
    for (const node of nodes) {
      if (node.deletable === false || flow.findNode(node.id) !== node) continue;
      await useNodeEvent(node.id, flow).emit("delete");
      if (flow.getNodes.value.some(item => item.parentNode === node.id)) throw new Error("分组内容已变化，请重新删除");
      if (flow.findNode(node.id) === node) flow.removeNodes(node.id, true);
    }
    menu.value?.close();
  } catch (error) {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    feedback.message({ tone: "error", message: message || (error instanceof Error ? error.message : "删除选中节点失败") });
  } finally {
    selectedNodes.value = selectedNodes.value.filter((node) => flow.findNode(node.id) === node);
    deleting.value = false;
  }
}
</script>

<style lang="scss" scoped>
.nodeMenu { min-width: 220px; }
</style>

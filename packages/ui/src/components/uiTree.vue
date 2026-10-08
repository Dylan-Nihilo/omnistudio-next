<template>
  <div class="uiTree" role="tree" :aria-label="label" @keydown="handleKeydown">
    <div v-for="(row, index) in rows" :key="valueKey(row.node.value)" class="treeRow" :class="{ isSelected: currentNodeKey === row.node.value, isDisabled: row.node.disabled }" role="treeitem" :tabindex="index === Math.min(focusIndex, rows.length - 1) ? 0 : -1" :aria-level="row.depth + 1" :aria-expanded="isBranch(row.node) ? isExpanded(row.node) : undefined" :aria-selected="currentNodeKey === row.node.value" :aria-disabled="row.node.disabled || undefined" :aria-busy="loading.has(row.node.value) || undefined" :data-tree-index="index" :style="{ paddingInlineStart: 8 + row.depth * 20 + 'px' }" :draggable="draggable && !row.node.disabled && (allowDrag?.(row.node) ?? true)" @focus="focusIndex = index" @click="select(row.node)" @dragstart="startDrag(row.node, $event)" @dragover="dragOver(row.node, $event)" @drop="drop(row.node, $event)" @dragend="dragging = undefined">
      <button class="expandButton" type="button" tabindex="-1" :disabled="!isBranch(row.node) || row.node.disabled" :aria-hidden="!isBranch(row.node) || undefined" :aria-label="isBranch(row.node) ? (isExpanded(row.node) ? '收起 ' + row.node.label : '展开 ' + row.node.label) : undefined" @click.stop="toggle(row.node)">{{ isBranch(row.node) ? isExpanded(row.node) ? '⌄' : '›' : '' }}</button>
      <span class="treeLabel"><slot :node="row.node" :expanded="isExpanded(row.node)" :loading="loading.has(row.node.value)">{{ row.node.label }}</slot></span>
      <button v-if="loadErrors.has(row.node.value)" type="button" class="retryButton" @click.stop="loadNode(row.node)">重试</button>
      <span v-if="loadErrors.has(row.node.value)" class="treeError" role="alert">{{ loadErrors.get(row.node.value) }}</span>
    </div>
    <span v-if="!rows.length && emptyText" class="emptyText">{{ emptyText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import type { UiDropPosition, UiTreeNode, UiValue } from "../types";
import { valueKey } from "../values";
const props = withDefaults(defineProps<{ data: UiTreeNode[]; currentNodeKey?: UiValue; defaultExpandAll?: boolean; expandOnClickNode?: boolean; label?: string; emptyText?: string; load?: (node: UiTreeNode, signal: AbortSignal) => Promise<UiTreeNode[]>; draggable?: boolean; allowDrag?: (node: UiTreeNode) => boolean; allowDrop?: (dragging: UiTreeNode, target: UiTreeNode, position: UiDropPosition) => boolean; filterNodeMethod?: (query: string, node: UiTreeNode) => boolean }>(), { defaultExpandAll: false, expandOnClickNode: true, draggable: false });
const emit = defineEmits<{ nodeClick: [node: UiTreeNode]; "update:currentNodeKey": [value: UiValue]; nodeDrop: [dragging: UiTreeNode, target: UiTreeNode, position: UiDropPosition]; loadError: [node: UiTreeNode, error: unknown] }>();
const expanded = ref(new Set<UiValue>());
const collapsed = ref(new Set<UiValue>());
const children = ref(new Map<UiValue, UiTreeNode[]>());
const loading = ref(new Set<UiValue>());
const loadErrors = ref(new Map<UiValue, string>());
const query = ref("");
const focusIndex = ref(0);
const dragging = ref<UiTreeNode>();
const controller = new AbortController();
function childrenOf(node: UiTreeNode) { return children.value.get(node.value) ?? node.children ?? []; }
function isBranch(node: UiTreeNode) { return node.leaf === false || !!childrenOf(node).length || !!props.load && node.leaf !== true; }
function isExpanded(node: UiTreeNode) { return !!query.value || expanded.value.has(node.value) || props.defaultExpandAll && !!childrenOf(node).length && !collapsed.value.has(node.value); }
const rows = computed(() => {
  const result: { node: UiTreeNode; depth: number; parent?: UiTreeNode }[] = [];
  const matches = new Set<UiValue>();
  function collect(nodes: UiTreeNode[]): boolean {
    let found = false;
    for (const node of nodes) {
      const descendant = collect(childrenOf(node));
      const own = !query.value || (props.filterNodeMethod ? props.filterNodeMethod(query.value, node) : node.label.toLocaleLowerCase().includes(query.value.toLocaleLowerCase()));
      if (own || descendant) { matches.add(node.value); found = true; }
    }
    return found;
  }
  collect(props.data);
  function append(nodes: UiTreeNode[], depth: number, parent?: UiTreeNode) {
    for (const node of nodes) {
      if (!matches.has(node.value)) continue;
      result.push({ node, depth, parent });
      if (isExpanded(node)) append(childrenOf(node), depth + 1, node);
    }
  }
  append(props.data, 0);
  return result;
});
async function loadNode(node: UiTreeNode) {
  if (!props.load || loading.value.has(node.value)) return;
  loading.value.add(node.value); loadErrors.value.delete(node.value);
  try { const result = await props.load(node, controller.signal); if (!controller.signal.aborted) children.value.set(node.value, result); }
  catch (error) { if (!controller.signal.aborted) { loadErrors.value.set(node.value, error instanceof Error ? error.message : "读取目录失败"); emit("loadError", node, error); } }
  finally { loading.value.delete(node.value); }
}
async function toggle(node: UiTreeNode) {
  if (node.disabled || !isBranch(node)) return;
  if (isExpanded(node) && !query.value) { expanded.value.delete(node.value); collapsed.value.add(node.value); }
  else { expanded.value.add(node.value); collapsed.value.delete(node.value); if (props.load && !children.value.has(node.value) && !node.children) await loadNode(node); }
}
function select(node: UiTreeNode) { if (node.disabled) return; emit("update:currentNodeKey", node.value); emit("nodeClick", node); if (props.expandOnClickNode) toggle(node); }
async function focus(index: number, root: HTMLElement) { focusIndex.value = Math.max(0, Math.min(rows.value.length - 1, index)); await nextTick(); root.querySelector<HTMLElement>('[data-tree-index="' + focusIndex.value + '"]')?.focus(); }
async function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || (event.target as HTMLElement).closest("button,input,textarea,select,a,[contenteditable='true']")) return;
  const index = Number((event.target as HTMLElement).dataset.treeIndex), row = rows.value[index];
  if (!row || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
  event.preventDefault(); const root = event.currentTarget as HTMLElement;
  if (event.key === "Enter" || event.key === " ") { select(row.node); return; }
  if (event.key === "ArrowRight") { if (!isExpanded(row.node)) await toggle(row.node); else if (rows.value[index + 1]?.parent === row.node) await focus(index + 1, root); return; }
  if (event.key === "ArrowLeft") { if (isBranch(row.node) && isExpanded(row.node)) await toggle(row.node); else if (row.parent) await focus(rows.value.findIndex(item => item.node === row.parent), root); return; }
  await focus(event.key === "Home" ? 0 : event.key === "End" ? rows.value.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1), root);
}
function position(event: DragEvent): UiDropPosition { const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect(); const ratio = (event.clientY - bounds.top) / bounds.height; return ratio < 0.25 ? "before" : ratio > 0.75 ? "after" : "inside"; }
function startDrag(node: UiTreeNode, event: DragEvent) { if (node.disabled || !props.draggable || props.allowDrag?.(node) === false) { event.preventDefault(); return; } dragging.value = node; event.dataTransfer?.setData("text/plain", valueKey(node.value)); }
function containsNode(parent: UiTreeNode, target: UiTreeNode): boolean { return parent.value === target.value || childrenOf(parent).some(child => containsNode(child, target)); }
function dragOver(node: UiTreeNode, event: DragEvent) { if (dragging.value && !containsNode(dragging.value, node) && !node.disabled && (props.allowDrop?.(dragging.value, node, position(event)) ?? true)) event.preventDefault(); }
function drop(node: UiTreeNode, event: DragEvent) { if (!dragging.value || containsNode(dragging.value, node) || node.disabled || props.allowDrop?.(dragging.value, node, position(event)) === false) return; event.preventDefault(); emit("nodeDrop", dragging.value, node, position(event)); dragging.value = undefined; }
onBeforeUnmount(() => controller.abort());
defineExpose({ expand: (value: UiValue) => { collapsed.value.delete(value); expanded.value.add(value); }, filter: (value: string) => { query.value = value; focusIndex.value = 0; }, reload: (value: UiValue) => children.value.delete(value) });
</script>

<style scoped lang="scss">
.uiTree {
  min-width: 0; font-size: var(--uiFontControl);
  .treeRow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 36px; padding-block: 4px; padding-inline-end: 8px; border-radius: var(--uiRadiusControl); color: var(--uiTextBody); cursor: pointer; &:hover:not(.isDisabled) { background: var(--uiSurfaceHover); } &.isSelected { background: var(--uiActionSoft); color: var(--uiTextPrimary); } &.isDisabled { color: var(--uiStateDisabledText); cursor: not-allowed; } &:focus-visible { outline-offset: -2px; } .expandButton { flex-shrink: 0; width: 22px; height: 26px; padding: 0; border: 0; background: transparent; color: inherit; font-size: 18px; cursor: pointer; &:disabled { cursor: default; } } .treeLabel { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .retryButton { border: 0; background: transparent; color: var(--uiStatusError); font: inherit; cursor: pointer; } .treeError { width: 100%; padding-inline-start: 28px; color: var(--uiStatusError); font-size: var(--uiFontControl); } }
  .emptyText { display: block; padding: 8px; color: var(--uiTextMuted); }
}
</style>

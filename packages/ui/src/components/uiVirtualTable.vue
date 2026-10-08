<template>
  <div ref="viewport" class="uiVirtualTable" role="grid" :aria-label="label" :aria-rowcount="rows.length + 1" :aria-colcount="columns.length" :aria-busy="loading || undefined" :style="{ height: height + 'px' }" @keydown="handleKeydown">
    <div class="tableHeader" role="row" :style="{ gridTemplateColumns, minWidth: minWidth + 'px', height: headerHeight + 'px' }"><div v-for="column in columns" :key="column.key" role="columnheader" :style="{ textAlign: column.align }">{{ column.label }}</div></div>
    <div class="tableBody" role="rowgroup" :style="{ height: virtualizer.getTotalSize() + 'px', minWidth: minWidth + 'px' }">
      <div v-for="item in virtualizer.getVirtualItems()" :key="String(item.key)" class="tableRow" role="row" :aria-rowindex="item.index + 2" :tabindex="item.index === activeIndex ? 0 : -1" :data-row-index="item.index" :style="{ gridTemplateColumns, height: rowHeight + 'px', transform: 'translateY(' + (item.start - headerHeight) + 'px)' }" @focus="activeIndex = item.index">
        <div v-for="column in columns" :key="column.key" class="tableCell" role="gridcell" :style="{ textAlign: column.align }"><slot name="cell" :row="rows[item.index]!" :column="column" :index="item.index"><uiTableCell :row="rows[item.index]!" :column="column" :index="item.index" /></slot></div>
      </div>
    </div>
    <span v-if="!rows.length && emptyText" class="emptyText">{{ emptyText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import uiTableCell from "./uiTableCell";
import type { UiColumn } from "../types";
const props = withDefaults(defineProps<{ rows: Record<string, unknown>[]; columns: UiColumn[]; rowKey?: string; height?: number; rowHeight?: number; headerHeight?: number; label?: string; loading?: boolean; emptyText?: string }>(), { rowKey: "id", height: 320, rowHeight: 38, headerHeight: 36, loading: false });
const viewport = ref<HTMLElement>();
const activeIndex = ref(0);
const gridTemplateColumns = computed(() => props.columns.map(column => column.width == null ? "minmax(120px, 1fr)" : Math.max(0, column.width) + "px").join(" "));
const minWidth = computed(() => props.columns.reduce((total, column) => total + Math.max(0, column.width ?? 120), 0));
const virtualizer = useVirtualizer(computed(() => ({
  count: props.rows.length, getScrollElement: () => viewport.value ?? null, estimateSize: () => props.rowHeight, scrollMargin: props.headerHeight, overscan: 6,
  getItemKey: (index: number) => { const key = props.rows[index]?.[props.rowKey]; return typeof key === "number" || typeof key === "string" ? key : index; },
})));
async function handleKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement).closest("button,input,textarea,select,a,[contenteditable='true']") || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index = Math.min(props.rows.length - 1, Math.max(0, event.key === "Home" ? 0 : event.key === "End" ? props.rows.length - 1 : activeIndex.value + (event.key === "ArrowDown" ? 1 : -1)));
  if (index < 0) return;
  activeIndex.value = index; virtualizer.value.scrollToIndex(index, { align: "auto" }); await nextTick();
  requestAnimationFrame(() => viewport.value?.querySelector<HTMLElement>('[data-row-index="' + index + '"]')?.focus());
}
defineExpose({ scrollToIndex: (index: number) => virtualizer.value.scrollToIndex(index), viewport });
</script>

<style scoped lang="scss">
.uiVirtualTable {
  position: relative; min-width: 0; overflow: auto; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); font-size: var(--uiFontControl); overscroll-behavior: contain;
  .tableHeader { position: sticky; top: 0; z-index: var(--uiLayerSticky); display: grid; align-items: center; background: var(--uiBackgroundSubtle); color: var(--uiTextMuted); border-bottom: 1px solid var(--uiBorderDefault); > div { padding: 0 12px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
  .tableBody { position: relative; .tableRow { position: absolute; inset-inline: 0; top: 0; display: grid; align-items: center; border-bottom: 1px solid var(--uiBorderDefault); &:hover { background: var(--uiSurfaceHover); } &:focus-visible { outline-offset: -2px; } .tableCell { min-width: 0; padding: 0 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } } }
  .emptyText { display: block; padding: 16px; color: var(--uiTextMuted); }
}
</style>

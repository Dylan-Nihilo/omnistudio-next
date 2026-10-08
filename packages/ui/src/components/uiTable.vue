<template>
  <div class="uiTable" :style="{ maxHeight: typeof height === 'number' ? height + 'px' : height }" :aria-busy="loading || undefined">
    <table :aria-label="label">
      <thead><tr><th v-for="column in columns" :key="column.key" scope="col" :style="{ width: column.width ? column.width + 'px' : undefined, textAlign: column.align }">{{ column.label }}</th></tr></thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="rowKey && (typeof row[rowKey] === 'string' || typeof row[rowKey] === 'number') ? String(row[rowKey]) : index">
          <td v-for="column in columns" :key="column.key" :style="{ textAlign: column.align }"><slot name="cell" :row="row" :column="column" :index="index"><uiTableCell :row="row" :column="column" :index="index" /></slot></td>
        </tr>
        <tr v-if="!rows.length && emptyText"><td :colspan="columns.length">{{ emptyText }}</td></tr>
      </tbody>
    </table>
    <uiSkeleton v-if="loading && !rows.length" :rows="3" class="tableSkeleton" />
  </div>
</template>

<script setup lang="ts">
import uiTableCell from "./uiTableCell";
import uiSkeleton from "./uiSkeleton.vue";
import type { UiColumn } from "../types";
withDefaults(defineProps<{ rows: Record<string, unknown>[]; columns: UiColumn[]; rowKey?: string; height?: number | string; label?: string; loading?: boolean; emptyText?: string }>(), { rowKey: "id", loading: false });
</script>

<style scoped lang="scss">
.uiTable {
  min-width: 0; overflow: auto; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl);
  table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--uiFontControl); th { position: sticky; top: 0; z-index: var(--uiLayerSticky); color: var(--uiTextMuted); background: var(--uiBackgroundSubtle); font-weight: 500; } th, td { padding: 10px 12px; border-bottom: 1px solid var(--uiBorderDefault); overflow-wrap: anywhere; } tbody tr:last-child td { border-bottom: 0; } tbody tr:hover { background: var(--uiSurfaceHover); } }
  .tableSkeleton { padding: 16px; }
}
</style>

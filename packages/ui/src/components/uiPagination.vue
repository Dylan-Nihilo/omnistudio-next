<template>
  <nav v-if="!hideOnSinglePage || pages > 1" class="uiPagination" :aria-label="label">
    <button type="button" :disabled="disabled || current <= 1" aria-label="上一页" @click="select(current - 1)">‹</button>
    <template v-for="(page, index) in pageItems" :key="index"><span v-if="page === null" aria-hidden="true">…</span><button v-else type="button" :disabled="disabled" :aria-current="page === current ? 'page' : undefined" :aria-label="'第 ' + page + ' 页'" @click="select(page)">{{ page }}</button></template>
    <button type="button" :disabled="disabled || current >= pages" aria-label="下一页" @click="select(current + 1)">›</button>
    <span v-if="showTotal" class="pageTotal">共 {{ total }} 项</span>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
const props = withDefaults(defineProps<{ currentPage?: number; pageSize?: number; total: number; disabled?: boolean; hideOnSinglePage?: boolean; pagerCount?: number; showTotal?: boolean; label?: string }>(), { currentPage: 1, pageSize: 20, disabled: false, hideOnSinglePage: false, pagerCount: 7, showTotal: false, label: "分页" });
const emit = defineEmits<{ "update:currentPage": [value: number]; change: [value: number] }>();
const pages = computed(() => Math.max(1, Math.ceil(Math.max(0, props.total) / Math.max(1, props.pageSize))));
const current = computed(() => Math.min(pages.value, Math.max(1, props.currentPage)));
const pageItems = computed(() => {
  const count = Math.max(3, Math.floor(props.pagerCount));
  const radius = Math.floor((count - 3) / 2);
  const numbers = [...new Set([1, pages.value, ...Array.from({ length: radius * 2 + 1 }, (_value, index) => current.value - radius + index)].filter(value => value > 0 && value <= pages.value))].sort((a, b) => a - b);
  return numbers.flatMap((value, index): (number | null)[] => index && value - numbers[index - 1]! > 1 ? [null, value] : [value]);
});
function select(value: number) { if (props.disabled) return; const page = Math.min(pages.value, Math.max(1, value)); emit("update:currentPage", page); emit("change", page); }
</script>

<style scoped lang="scss">
.uiPagination {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  button { display: grid; place-items: center; min-width: 32px; min-height: 32px; padding: 4px 8px; border: 1px solid transparent; border-radius: var(--uiRadiusControl); color: var(--uiTextBody); background: var(--uiBackgroundSubtle); font: inherit; cursor: pointer; &[aria-current="page"] { color: var(--uiTextOnAccent); background: var(--uiActionPrimary); } &:hover:not(:disabled) { border-color: var(--uiBorderControl); } &:disabled { color: var(--uiStateDisabledText); cursor: not-allowed; } }
  .pageTotal { margin-inline-start: 8px; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
}
</style>

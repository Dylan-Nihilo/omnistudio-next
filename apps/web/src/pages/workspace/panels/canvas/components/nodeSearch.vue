<template>
  <uiDialog v-model="visible" title="画布节点搜索" :width="560" @opened="nextTick(() => searchInput?.focus())">
    <div class="nodeSearch">
      <uiInput
        ref="searchInput"
        v-model="query"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="visible"
        placeholder="搜索节点名称或类型"
        aria-label="搜索画布节点"
        :aria-controls="searchId"
        :aria-activedescendant="results[activeIndex] ? `${searchId}-${activeIndex}` : undefined"
        clearable
        @keydown="navigateResults"><template #prefix><icon-search :size="18" /></template></uiInput>
      <div :id="searchId" ref="resultList" class="resultList" role="listbox" aria-label="画布节点">
        <button
          v-for="(item, index) in results"
          :id="`${searchId}-${index}`"
          :key="item.node.id"
          class="nodeResult"
          type="button"
          role="option"
          tabindex="-1"
          :aria-selected="activeIndex === index"
          @mouseenter="activeIndex = index"
          @click="selectNode(index)">
          <span class="nodeLabel">{{ item.label }}</span>
          <span class="nodeType">{{ item.node.type === 'canvasGroup' ? '分组' : item.node.type?.replace(/^remote-/, '') }}</span>
        </button>
        <p v-if="!results.length" class="empty">没有匹配的节点</p>
      </div>
    </div>
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { IconSearch } from "@tabler/icons-vue";
import { uiDialog, uiInput } from "@toonflow/ui";

const props = defineProps<{ disabled?: boolean }>();
const flow = useVueFlow();
const visible = ref(false);
const searchId = "canvasSearch-" + useId();
const query = ref("");
const activeIndex = ref(0);
const searchInput = ref<InstanceType<typeof uiInput>>();
const resultList = ref<HTMLElement>();
const results = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase();
  return flow.getNodes.value.filter(node => !node.hidden).map(node => ({
    node, label: String(node.data.label || node.type || "未命名节点"),
  })).filter(item => `${item.label} ${item.node.type} ${item.node.id}`.toLocaleLowerCase().includes(keyword));
});
watch(query, () => { activeIndex.value = 0; });
watch(activeIndex, async index => {
  await nextTick();
  resultList.value?.children[index]?.scrollIntoView({ block: "nearest" });
});
watch(() => props.disabled, disabled => { if (disabled) visible.value = false; });

function open() {
  if (props.disabled) return;
  query.value = "";
  activeIndex.value = 0;
  visible.value = true;
}

function navigateResults(event: Event | KeyboardEvent) {
  if (!(event instanceof KeyboardEvent) || event.isComposing || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "ArrowDown") activeIndex.value = Math.min(activeIndex.value + 1, results.value.length - 1);
  else if (event.key === "ArrowUp") activeIndex.value = Math.max(activeIndex.value - 1, 0);
  else void selectNode(activeIndex.value);
}

async function selectNode(index: number) {
  const node = results.value[index]?.node;
  if (!node || props.disabled) return;
  visible.value = false;
  flow.removeSelectedElements();
  flow.addSelectedNodes([node]);
  flow.nodesSelectionActive.value = false;
  await nextTick();
  await flow.fitView({ nodes: [node.id], padding: 0.4, maxZoom: 1.4, duration: 200 });
}

defineExpose({ open });
</script>

<style lang="scss" scoped>
.nodeSearch {
  display: flex;
  flex-direction: column;
  gap: 16px;

  .resultList {
    max-height: min(360px, 50vh);
    overflow-y: auto;

    .nodeResult {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      width: 100%;
      padding: 14px 12px;
      border: 0;
      border-radius: var(--uiRadiusControl);
      background: transparent;
      color: var(--uiTextPrimary);
      font: inherit;
      text-align: left;
      cursor: pointer;

      &[aria-selected="true"] { background: var(--uiActionSoft); }
      .nodeLabel { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nodeType { flex-shrink: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
    }
    .empty { margin: 24px 0; color: var(--uiTextMuted); text-align: center; }
  }
}
</style>

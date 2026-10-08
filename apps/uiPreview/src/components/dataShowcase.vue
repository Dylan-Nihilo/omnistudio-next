<template>
  <div class="uiStack">
    <section><h2>文件</h2><uiInput v-model="query" clearable aria-label="查找文件" placeholder="查找文件" @input="tree?.filter(query)" /><uiTree ref="tree" :data="folders" v-model:currentNodeKey="selected" :load="loadChildren" draggable :allowDrop="(_from, to, position) => position !== 'inside' || to.leaf === false" label="组件文件" :filterNodeMethod="(text, node) => node.label.toLowerCase().includes(text.toLowerCase())" /></section>
    <section><h2>列表</h2><uiTable :rows="pageRows" :columns="columns" label="组件文件列表" /><uiPagination v-model:currentPage="page" :pageSize="8" :total="rows.length" showTotal /></section>
    <section><h2>长列表</h2><div class="resizeSurface"><uiResizeBox><template #default="{ height }"><uiVirtualTable :rows="rows" :columns="columns" :height="height" label="完整文件列表" /></template></uiResizeBox></div></section>
    <section><h2>详情</h2><uiCollapse v-model="expanded" :items="[{ value: 'files', label: '文件详情' }, { value: 'selection', label: '当前选择' }]"><template #default="{ item }"><span v-if="item.value === 'files'">Vue 组件</span><span v-else>{{ selected }}</span></template></uiCollapse></section>
    <uiLoading :loading="busy" label="读取中"><uiTable :rows="rows.slice(0, 3)" :columns="columns" label="文件" /></uiLoading><uiSwitch v-model="busy">读取中</uiSwitch>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { uiInput, uiTree, uiTable, uiVirtualTable, uiResizeBox, uiPagination, uiCollapse, uiLoading, uiSwitch, type UiColumn, type UiTreeNode, type UiValue } from "@toonflow/ui";
import { componentNames } from "../inventory";
const rows = componentNames.map(name => ({ id: name, name: name + ".vue", kind: "Vue" }));
const columns: UiColumn[] = [{ key: "name", label: "名称" }, { key: "kind", label: "类型", width: 120 }];
const tree = ref<InstanceType<typeof uiTree>>(), query = ref(""), selected = ref<UiValue>("components"), page = ref(1), expanded = ref<UiValue | UiValue[]>(["files"]), busy = ref(false);
const folders: UiTreeNode[] = [{ value: "components", label: "components", leaf: false }, { value: "styles", label: "styles", children: [{ value: "base.scss", label: "base.scss", leaf: true }, { value: "layout.scss", label: "layout.scss", leaf: true }] }];
async function loadChildren(node: UiTreeNode) { return node.value === "components" ? rows.map(row => ({ value: row.id, label: row.name, leaf: true })) : []; }
const pageRows = computed(() => rows.slice((page.value - 1) * 8, page.value * 8));
</script>

<style scoped lang="scss">
.resizeSurface { height: 280px; min-width: 0; }
</style>

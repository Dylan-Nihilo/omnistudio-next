<template>
  <div ref="element" class="uiResizeBox"><slot :width="width" :height="height" /></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
const element = ref<HTMLElement>();
const width = ref(0), height = ref(0);
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver(([entry]) => { if (!entry) return; width.value = entry.contentRect.width; height.value = entry.contentRect.height; });
  if (element.value) observer.observe(element.value);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped lang="scss">
.uiResizeBox { width: 100%; height: 100%; min-width: 0; min-height: 0; }
</style>

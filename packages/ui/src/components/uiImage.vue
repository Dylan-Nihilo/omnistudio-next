<template>
  <span class="uiImage" :class="[$attrs.class, { isPreviewable: !!previewSrcList?.length }]" :style="$attrs.style as StyleValue">
    <img v-show="!failed || !$slots.error" v-bind="{ ...$attrs, class: undefined, style: undefined }" :src="src" :alt="alt" :loading="loading" :style="{ objectFit: fit }" :role="previewSrcList?.length ? 'button' : undefined" :tabindex="previewSrcList?.length ? 0 : undefined" @click="preview" @keydown.enter.prevent="preview" @load="failed = false; emit('load', $event)" @error="failed = true; emit('error', $event)" />
    <slot v-if="failed" name="error" />
    <uiImageViewer v-if="previewSrcList?.length" v-model="viewerOpen" :urls="previewSrcList" :initialIndex="Math.max(0, previewSrcList.indexOf(src))" :title="alt || '图片预览'" />
  </span>
</template>

<script setup lang="ts">
import { ref, watch, type StyleValue } from "vue";
import uiImageViewer from "./uiImageViewer.vue";
defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ src: string; alt: string; fit?: "contain" | "cover" | "fill" | "none" | "scale-down"; loading?: "eager" | "lazy"; previewSrcList?: string[] }>(), { fit: "contain", loading: "lazy" });
const emit = defineEmits<{ load: [event: Event]; error: [event: Event] }>();
const failed = ref(false), viewerOpen = ref(false);
watch(() => props.src, () => { failed.value = false; viewerOpen.value = false; });
function preview() { if (props.previewSrcList?.length && !failed.value) viewerOpen.value = true; }
</script>

<style scoped lang="scss">
.uiImage { display: inline-flex; position: relative; min-width: 0; max-width: 100%; img { display: block; width: 100%; height: 100%; min-width: 0; } &.isPreviewable img { cursor: zoom-in; } }
</style>

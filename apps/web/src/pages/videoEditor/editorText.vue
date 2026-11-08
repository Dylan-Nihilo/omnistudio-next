<template>
  <canvas ref="canvas" class="editorTextCanvas" :width="width" :height="height" aria-hidden="true"></canvas>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { EditorClip } from "./editorModel";
import { drawEditorText, waitForEditorTextFonts } from "./editorText";

const props = defineProps<{ clip: EditorClip; width: number; height: number }>();
const canvas = ref<HTMLCanvasElement>();
let renderVersion = 0;

watch(() => [props.clip.text, props.clip.textColor, props.clip.fontSize, props.clip.textX, props.clip.textY, props.width, props.height], async () => {
  const version = ++renderVersion;
  await waitForEditorTextFonts();
  if (version !== renderVersion || !canvas.value) return;
  drawEditorText(canvas.value, props.clip, props.width, props.height);
}, { immediate: true, flush: "post" });

onBeforeUnmount(() => { renderVersion++; });
</script>

<style scoped>
.editorTextCanvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
</style>

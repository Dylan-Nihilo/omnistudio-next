<template>
  <uiDialog v-model="visible" :title="title" :width="960" @keydown="handleKeydown" @closed="emit('close')">
    <div class="viewerSurface" @pointerdown="startPan" @pointermove="pan" @pointerup="stopPan" @pointercancel="stopPan">
      <img v-if="urls[index]" :src="urls[index]" :alt="title" draggable="false" :style="{ transform: 'translate(' + offset.x + 'px,' + offset.y + 'px) scale(' + zoom + ') rotate(' + rotation + 'deg)' }" @error="emit('error', $event)" />
    </div>
    <template #footer>
      <uiButton variant="secondary" :disabled="index <= 0" @click="index--">上一张</uiButton><span class="imageCounter">{{ urls.length ? index + 1 : 0 }} / {{ urls.length }}</span><uiButton variant="secondary" :disabled="index >= urls.length - 1" @click="index++">下一张</uiButton>
      <uiButton variant="ghost" :disabled="zoom <= 0.25" @click="zoom = Math.max(0.25, zoom - 0.25)">缩小</uiButton><uiButton variant="ghost" :disabled="zoom >= 4" @click="zoom = Math.min(4, zoom + 0.25)">放大</uiButton><uiButton variant="ghost" @click="rotation += 90">旋转</uiButton><uiButton variant="ghost" @click="reset">重置</uiButton>
    </template>
  </uiDialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import uiDialog from "./uiDialog.vue";
import uiButton from "./uiButton.vue";
const props = withDefaults(defineProps<{ urls: string[]; initialIndex?: number; title?: string }>(), { initialIndex: 0, title: "图片预览" });
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ close: []; error: [event: Event] }>();
const index = ref(Math.max(0, Math.min(props.urls.length - 1, props.initialIndex))), zoom = ref(1), rotation = ref(0);
const offset = ref({ x: 0, y: 0 });
let pointer: { id: number; x: number; y: number } | undefined;
function reset() { zoom.value = 1; rotation.value = 0; offset.value = { x: 0, y: 0 }; }
watch([visible, () => props.urls, () => props.initialIndex], () => { index.value = Math.max(0, Math.min(props.urls.length - 1, props.initialIndex)); reset(); });
watch(index, reset);
function handleKeydown(event: KeyboardEvent) { if ((event.target as HTMLElement).closest("input,textarea,select") || event.isComposing) return; if (event.key === "ArrowLeft" && index.value > 0) { event.preventDefault(); index.value--; } else if (event.key === "ArrowRight" && index.value < props.urls.length - 1) { event.preventDefault(); index.value++; } }
function startPan(event: PointerEvent) { if (event.button !== 0) return; event.preventDefault(); pointer = { id: event.pointerId, x: event.clientX - offset.value.x, y: event.clientY - offset.value.y }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
function pan(event: PointerEvent) { if (pointer?.id === event.pointerId) offset.value = { x: event.clientX - pointer.x, y: event.clientY - pointer.y }; }
function stopPan() { pointer = undefined; }
</script>

<style scoped lang="scss">
.viewerSurface { display: flex; align-items: center; justify-content: center; height: min(58dvh, 640px); overflow: hidden; border-radius: var(--uiRadiusControl); background: var(--uiBackgroundCanvas); touch-action: none; cursor: grab; img { display: block; max-width: 100%; max-height: 100%; object-fit: contain; user-select: none; pointer-events: none; } }
.imageCounter { align-self: center; color: var(--uiTextMuted); font-size: var(--uiFontControl); font-variant-numeric: tabular-nums; }
</style>

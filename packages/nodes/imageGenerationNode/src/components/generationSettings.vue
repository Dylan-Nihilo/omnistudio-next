<template>
  <uiPopover placement="top-start" :width="380" :disabled="disabled" title="图片生成设置">
    <template #reference="{ triggerAttrs }"><uiButton v-bind="triggerAttrs" class="settingsButton" variant="ghost" size="small" :disabled="disabled" aria-label="图片生成设置"><span class="ratioShape" :style="ratioStyle(ratio)" aria-hidden="true" /><span>{{ ratio }} · {{ size }} · 1张</span><icon-chevron-up :size="14" aria-hidden="true" /></uiButton></template>
    <div class="generationSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @wheel.stop>
      <uiField label="分辨率"><uiRadioGroup :modelValue="size" :options="sizes.map(value => ({ value, label: value }))" variant="segmented" :disabled="disabled" aria-label="图片分辨率" @update:modelValue="value => typeof value === 'string' && (size = value)" /></uiField>
      <uiField label="比例"><div class="ratioOptions" role="group" aria-label="图片比例"><uiButton v-for="item in ratios" :key="item" class="ratioButton" variant="secondary" :disabled="disabled" :aria-label="`比例 ${item}`" :aria-pressed="ratio === item" @click="ratio = item"><span class="ratioContent"><span class="ratioShape" :style="ratioStyle(item)" aria-hidden="true" /><span>{{ item }}</span></span></uiButton></div></uiField>
    </div>
  </uiPopover>
</template>

<script setup lang="ts">
import { uiButton, uiPopover, uiField, uiRadioGroup } from "@omnistudio-next/ui";
import { IconChevronUp } from "@tabler/icons-vue";

defineProps<{ sizes: string[]; ratios: string[]; disabled?: boolean }>();
const size = defineModel<string>("size", { required: true });
const ratio = defineModel<string>("ratio", { required: true });

function ratioStyle(value: string) {
  const [width = 1, height = 1] = value.split(":").map(Number);
  return { width: `${16 * Math.min(width / height, 1)}px`, height: `${16 * Math.min(height / width, 1)}px` };
}
</script>

<style scoped lang="scss">
.ratioShape { display: inline-block; flex-shrink: 0; border: 1px solid currentColor; border-radius: 2px; box-sizing: border-box; }
.generationSettings { display: flex; flex-direction: column; gap: 24px; text-align: left; .ratioOptions { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; .ratioButton { min-height: 68px; padding: 8px 4px; &[aria-pressed="true"] { color: var(--uiActionPrimary); border-color: var(--uiActionPrimary); background: var(--uiActionSoft); } .ratioContent { display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: var(--uiFontControl); } } } }
</style>

<template>
  <uiPopover placement="top-start" :width="380" :disabled="disabled" title="视频生成设置">
    <template #reference="{ triggerAttrs }"><uiButton v-bind="triggerAttrs" class="settingsButton" variant="ghost" size="small" :disabled="disabled" aria-label="视频生成设置"><span class="ratioShape" :style="ratioStyle(ratio)" aria-hidden="true" /><span>{{ [ratio, resolution, duration ? `${duration}秒` : ''].filter(Boolean).join(' · ') }}</span><icon-chevron-up :size="14" aria-hidden="true" /></uiButton></template>
    <div class="generationSettings nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop @wheel.stop>
      <uiField v-if="modes.length" label="生成模式"><uiSelect :modelValue="mode" :options="modes" :disabled="disabled" aria-label="视频生成模式" @update:modelValue="value => typeof value === 'string' && (mode = value)" /></uiField>
      <div v-if="durations.length || resolutions.length" class="outputOptions"><uiField v-if="durations.length" label="时长"><uiSelect :modelValue="duration" :options="durations.map(value => ({ value, label: `${value}秒` }))" :disabled="disabled" aria-label="视频时长" @update:modelValue="value => typeof value === 'number' && (duration = value)" /></uiField><uiField v-if="resolutions.length" label="分辨率"><uiSelect :modelValue="resolution" :options="resolutions.map(value => ({ value, label: value }))" :disabled="disabled" aria-label="视频分辨率" @update:modelValue="value => typeof value === 'string' && (resolution = value)" /></uiField></div>
      <uiField label="通用比例"><div class="ratioOptions" role="group" aria-label="视频比例"><uiButton v-for="item in ratios" :key="item" class="ratioButton" variant="secondary" :disabled="disabled" :aria-label="`比例 ${item}`" :aria-pressed="ratio === item" @click="ratio = item"><span class="ratioContent"><span class="ratioShape" :style="ratioStyle(item)" aria-hidden="true" /><span>{{ item }}</span></span></uiButton></div></uiField>
      <div v-if="model?.audio === 'optional'" class="audioOption"><span>生成音频</span><uiSwitch v-model="generateAudio" :disabled="disabled" aria-label="生成音频" /></div>
    </div>
  </uiPopover>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { uiButton, uiPopover, uiField, uiSelect, uiSwitch } from "@toonflow/ui";
import { IconChevronUp } from "@tabler/icons-vue";
import type { NodeMediaModel } from "@toonflow/nodes-scaffold/runtime";

const props = defineProps<{ model?: NodeMediaModel; disabled?: boolean; ratios: string[] }>();
const duration = defineModel<number | undefined>("duration", { required: true });
const resolution = defineModel<string>("resolution", { required: true });
const ratio = defineModel<string>("ratio", { required: true });
const mode = defineModel<string>("mode", { required: true });
const generateAudio = defineModel<boolean>("generateAudio", { required: true });
const modeLabels: Record<string, string> = {
  text: "文生视频", singleImage: "单图参考", startEndRequired: "首尾帧必填", endFrameOptional: "尾帧可选", startFrameOptional: "首帧可选",
};
const modes = computed(() => (props.model?.mode ?? []).map(item => ({
  value: JSON.stringify(item),
  label: Array.isArray(item) ? "混合参考" : modeLabels[item] ?? item,
})));
const mappings = computed(() => props.model?.durationResolutionMap ?? []);
const durations = computed(() => [...new Set(mappings.value.flatMap(item => item.duration))].sort((a, b) => a - b));
const resolutions = computed(() => resolutionsFor(duration.value));

function resolutionsFor(value: number | undefined) {
  return [...new Set(mappings.value.filter(item => value !== undefined && item.duration.includes(value)).flatMap(item => item.resolution))];
}

function ratioStyle(value: string) {
  const [width = 1, height = 1] = value.split(":").map(Number);
  return { width: `${16 * Math.min(width / height, 1)}px`, height: `${16 * Math.min(height / width, 1)}px` };
}
</script>

<style scoped lang="scss">
.ratioShape { display: inline-block; flex-shrink: 0; border: 1px solid currentColor; border-radius: 2px; box-sizing: border-box; }
.generationSettings { display: flex; flex-direction: column; gap: 24px; text-align: left; .outputOptions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; } .ratioOptions { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; .ratioButton { min-height: 68px; padding: 8px 4px; &[aria-pressed="true"] { color: var(--uiActionPrimary); border-color: var(--uiActionPrimary); background: var(--uiActionSoft); } .ratioContent { display: flex; flex-direction: column; align-items: center; gap: 10px; font-size: var(--uiFontControl); } } } .audioOption { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 16px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextBody); font-size: var(--uiFontLabel); } }
</style>

<template>
  <uiDialog v-model="visible" :title="model ? '编辑模型' : '添加模型'" :width="760" destroyOnClose :closeOnClickModal="false">
    <div class="modelEditor">
      <section class="modelIdentity">
        <uiField label="显示名称" required><template #default="{ id, required }"><uiInput :id="id" v-model="draft.label" :required="required" clearable aria-label="模型显示名称" /></template></uiField>
        <uiField label="模型 ID" required><template #default="{ id, required }"><uiInput :id="id" v-model="draft.id" :required="required" clearable aria-label="模型 ID" /></template></uiField>
        <uiField label="模型类型"><template #default="{ id }"><uiSelect :id="id" :modelValue="draft.type" :options="typeOptions" aria-label="模型类型" @update:modelValue="value => (value === 'image' || value === 'video' || value === 'audio') && (draft.type = value)" /></template></uiField>
      </section>
      <section v-if="draft.type === 'image'" class="modelSection"><uiField label="图片生成模式" required><uiCheckboxGroup :modelValue="draft.imageMode" :options="imageModes" aria-label="图片生成模式" @update:modelValue="value => draft.imageMode = stringValues(value)" /></uiField></section>
      <template v-if="draft.type === 'video'">
        <section class="modelSection"><uiField label="视频生成模式" required><uiCheckboxGroup :modelValue="draft.videoMode" :options="videoModes" aria-label="视频生成模式" @update:modelValue="value => draft.videoMode = stringValues(value)" /></uiField>
          <div v-if="draft.videoMode.includes('multiReference')" class="referenceModes"><div v-for="item in referenceModes" :key="item.value" class="referenceItem"><uiCheckbox :modelValue="draft.mixedMode.includes(item.value)" @update:modelValue="value => toggleReference(item.value, value)">{{ item.label }}</uiCheckbox><uiNumberInput v-if="draft.mixedMode.includes(item.value)" v-model="draft.mixedModeCount[item.value]" :min="1" :step="1" :precision="0" size="small" :aria-label="`${item.label}数量`" /></div></div>
        </section>
        <section class="modelSection"><uiField label="音频输出"><uiRadioGroup :modelValue="draft.audio" :options="audioOptions" variant="segmented" aria-label="音频输出" @update:modelValue="value => (typeof value === 'boolean' || value === 'optional') && (draft.audio = value)" /></uiField></section>
        <section class="modelSection" aria-labelledby="mappingTitle">
          <header class="mappingTitle"><h3 id="mappingTitle">时长与分辨率</h3><uiButton variant="ghost" size="small" :icon="IconPlus" @click="draft.durationResolutionMap.push({ duration: [], resolution: [] })">添加时长与分辨率</uiButton></header>
          <div class="mappingEditor"><article v-for="(row, index) in draft.durationResolutionMap" :key="index" class="mappingRow"><span class="rowIndex">{{ index + 1 }}</span><uiField label="时长（秒）"><uiTagInput v-model="row.duration" placeholder="输入后按回车" :aria-label="`第 ${index + 1} 组时长`" /></uiField><icon-arrow-right class="mappingArrow" :size="16" aria-hidden="true" /><uiField label="分辨率"><uiTagInput v-model="row.resolution" placeholder="输入后按回车" :aria-label="`第 ${index + 1} 组分辨率`" /></uiField><uiIconButton variant="danger" :icon="IconTrash" :disabled="draft.durationResolutionMap.length === 1" :label="`删除第 ${index + 1} 组时长与分辨率`" @click="draft.durationResolutionMap.splice(index, 1)" /></article></div>
        </section>
      </template>
      <details class="modelOptions"><summary>更多配置（JSON）</summary><uiTextarea v-model="options" :rows="6" resize="vertical" aria-label="模型的更多配置" /></details>
      <uiAlert v-if="formError" :title="formError" tone="error" />
    </div>
    <template #footer><uiButton variant="secondary" @click="visible = false">取消</uiButton><uiButton @click="confirmModel">确定</uiButton></template>
  </uiDialog>
</template>

<script setup lang="ts">
import { uiDialog, uiField, uiInput, uiTextarea, uiSelect, uiCheckbox, uiCheckboxGroup, uiRadioGroup, uiNumberInput, uiTagInput, uiButton, uiIconButton, uiAlert, type UiValue } from "@toonflow/ui";
import { computed, ref, watch } from "vue";
import { IconArrowRight, IconPlus, IconTrash } from "@tabler/icons-vue";
import type { MediaProviderModel } from "./types";

const { model, models } = defineProps<{ model?: MediaProviderModel; models: MediaProviderModel[] }>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ confirmed: [model: MediaProviderModel] }>();
const modelTypes = [
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
];
const typeOptions = computed(() => [...(model?.type === "text" ? [{ value: "text", label: "文本（旧配置）", disabled: true }] : []), ...modelTypes]);
const audioOptions = [{ value: "optional", label: "可选音频" }, { value: true, label: "始终输出音频" }, { value: false, label: "无音频" }];
const imageModes = [
  { value: "text", label: "文生图" },
  { value: "singleImage", label: "单图参考" },
  { value: "multiReference", label: "多图参考" },
];
const videoModes = [
  { value: "singleImage", label: "单图参考" },
  { value: "startEndRequired", label: "首尾帧必填" },
  { value: "endFrameOptional", label: "尾帧可选" },
  { value: "startFrameOptional", label: "首帧可选" },
  { value: "text", label: "文生视频" },
  { value: "multiReference", label: "混合参考" },
];
const referenceModes = [
  { value: "videoReference", label: "视频参考" },
  { value: "imageReference", label: "图片参考" },
  { value: "audioReference", label: "音频参考" },
];
const draft = ref(createDraft());
const options = ref("{}");
const formError = ref("");
let original: Record<string, unknown> = {};
let initialDraft = createDraft();
let initialExtraMode: unknown;

function createDraft() {
  return {
    id: "", label: "", type: "image" as MediaProviderModel["type"],
    imageMode: [] as string[], videoMode: [] as string[], mixedMode: [] as string[],
    mixedModeCount: { videoReference: 1, imageReference: 1, audioReference: 1 } as Record<string, number | undefined>,
    audio: "optional" as "optional" | boolean,
    durationResolutionMap: [{ duration: [] as string[], resolution: [] as string[] }],
  };
}

watch(visible, (isVisible) => {
  if (!isVisible) return;
  draft.value = createDraft();
  formError.value = "";
  original = JSON.parse(JSON.stringify(model ?? {}));
  // ACT: 旧文本模型的扩展字段按原值保留，不再提供专用配置。
  const { id, label, type, ...extra } = original;
  Object.assign(draft.value, { id: id ?? "", label: label ?? "", type: type ?? "image" });
  if (draft.value.type === "image" || draft.value.type === "video") {
    const knownModes = draft.value.type === "image" ? imageModes : videoModes.filter(item => item.value !== "multiReference");
    const selectedModes = draft.value.type === "image" ? draft.value.imageMode : draft.value.videoMode;
    const remainingModes: unknown[] = [];
    for (const mode of Array.isArray(extra.mode) ? extra.mode : []) {
      if (knownModes.some(item => item.value === mode)) {
        selectedModes.push(mode as string);
        continue;
      }
      const references = Array.isArray(mode) ? mode.map(value => String(value).match(/^(videoReference|imageReference|audioReference):([1-9]\d*)$/)) : [];
      if (draft.value.type === "video" && !draft.value.mixedMode.length && references.length && references.every(item => item && Number.isSafeInteger(Number(item[2]))) && new Set(references.map(item => item?.[1])).size === references.length) {
        for (const match of references) {
          draft.value.mixedMode.push(match![1]!);
          draft.value.mixedModeCount[match![1]!] = Number(match![2]);
        }
        selectedModes.push("multiReference");
      } else remainingModes.push(mode);
    }
    if (remainingModes.length) extra.mode = remainingModes;
    else delete extra.mode;
  }
  if (draft.value.type === "video") {
    draft.value.audio = typeof extra.audio === "boolean" ? extra.audio : "optional";
    if (Array.isArray(extra.durationResolutionMap) && extra.durationResolutionMap.length) {
      draft.value.durationResolutionMap = extra.durationResolutionMap.map(row => ({
        duration: Array.isArray(row?.duration) ? row.duration.map(String) : [],
        resolution: Array.isArray(row?.resolution) ? row.resolution.map(String) : [],
      }));
    }
    delete extra.audio;
    delete extra.durationResolutionMap;
  }
  options.value = JSON.stringify(extra, null, 2);
  initialDraft = JSON.parse(JSON.stringify(draft.value));
  initialExtraMode = extra.mode;
}, { immediate: true });

function confirmModel() {
  formError.value = "";
  try {
    const id = draft.value.id.trim();
    const label = draft.value.label.trim();
    if (!label || !id) throw new Error("请填写显示名称和模型 ID");
    if (models.some(item => item !== model && item.id.trim() === id)) throw new Error(`模型 ID 已存在：${id}`);
    let extra: Record<string, unknown>;
    try { extra = JSON.parse(options.value); }
    catch { throw new Error("更多配置不是有效的 JSON"); }
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) throw new Error("更多配置必须是 JSON 对象");
    const fields = ["id", "label", "type", ...(draft.value.type === "video" ? ["audio", "durationResolutionMap"] : [])];
    if (fields.some(field => field in extra)) throw new Error("已有表单项请直接在上方编辑");
    const value: MediaProviderModel = { ...extra, id, label, type: draft.value.type };
    const typeChanged = !model || value.type !== model.type;
    const changed = (...fields: (keyof typeof initialDraft)[]) => typeChanged || fields.some(field => JSON.stringify(draft.value[field]) !== JSON.stringify(initialDraft[field]));
    const modelFields = value.type === "image" ? ["mode"] : value.type === "video" ? ["mode", "audio", "durationResolutionMap"] : [];
    if (!typeChanged) for (const field of modelFields) if (field in original) value[field] = original[field];
    const modeChanged = changed(value.type === "image" ? "imageMode" : "videoMode", "mixedMode", "mixedModeCount") || JSON.stringify(extra.mode) !== JSON.stringify(initialExtraMode);
    if ((value.type === "image" || value.type === "video") && modeChanged) {
      if (extra.mode !== undefined && !Array.isArray(extra.mode)) throw new Error("更多配置中的 mode 必须是数组");
      const modes: unknown[] = value.type === "image" ? [...draft.value.imageMode] : draft.value.videoMode.filter(mode => mode !== "multiReference");
      if (value.type === "video" && draft.value.videoMode.includes("multiReference")) {
        if (!draft.value.mixedMode.length) throw new Error("请选择混合参考的媒体类型");
        modes.push(draft.value.mixedMode.map(reference => {
          const count = draft.value.mixedModeCount[reference];
          if (!Number.isSafeInteger(count) || !count || count < 1) throw new Error("参考数量必须是正整数");
          return `${reference}:${count}`;
        }));
      }
      modes.push(...(extra.mode as unknown[] ?? []));
      if (!modes.length) throw new Error("请至少选择一种生成模式");
      value.mode = modes;
    }
    if (value.type === "video" && changed("audio")) value.audio = draft.value.audio;
    if (value.type === "video" && changed("durationResolutionMap")) {
      if (!draft.value.durationResolutionMap.length) throw new Error("请至少添加一组时长与分辨率");
      value.durationResolutionMap = draft.value.durationResolutionMap.map((row, index) => {
        const duration = row.duration.map(Number);
        const resolution = row.resolution.map(value => value.trim());
        if (!duration.length || duration.some(value => !Number.isFinite(value) || value <= 0)) throw new Error(`第 ${index + 1} 组时长必须是正数`);
        if (!resolution.length || resolution.some(value => !value)) throw new Error(`请填写第 ${index + 1} 组分辨率`);
        return { duration, resolution };
      });
    }
    emit("confirmed", value);
    visible.value = false;
  } catch (error) {
    formError.value = error instanceof Error ? error.message : "模型配置无效";
  }
}
function stringValues(values: UiValue[]) { return values.filter((value): value is string => typeof value === "string"); }
function toggleReference(value: string, checked: boolean) { draft.value.mixedMode = checked ? [...new Set([...draft.value.mixedMode, value])] : draft.value.mixedMode.filter(item => item !== value); }
</script>

<style lang="scss" scoped>
.modelEditor {
  display: flex; flex-direction: column; gap: 24px; min-width: 0;
  .modelIdentity { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; :deep(.uiField:last-child) { grid-column: 1 / -1; } }
  .modelSection { min-width: 0; padding-top: 24px; border-top: 1px solid var(--uiBorderDefault); }
  .referenceModes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-top: 20px; padding: 16px; border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); .referenceItem { min-width: 0; display: flex; flex-direction: column; gap: 8px; } }
  .mappingTitle { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; h3 { margin: 0; font-size: var(--uiFontLabel); } }
  .mappingEditor { display: flex; flex-direction: column; gap: 12px; .mappingRow { display: grid; grid-template-columns: 20px minmax(0, 1fr) 16px minmax(0, 1fr) 36px; align-items: center; gap: 12px; padding: 16px 12px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); .rowIndex, .mappingArrow { color: var(--uiTextMuted); } :deep(.uiField) { min-width: 0; } } }
  .modelOptions { min-width: 0; padding-top: 20px; border-top: 1px solid var(--uiBorderDefault); summary { width: fit-content; margin-bottom: 16px; color: var(--uiTextMuted); cursor: pointer; font-size: var(--uiFontControl); } }
  @media (max-width: 700px) { .modelIdentity { grid-template-columns: 1fr; } .referenceModes { grid-template-columns: 1fr; } .mappingEditor .mappingRow { grid-template-columns: 20px minmax(0, 1fr) 36px; .mappingArrow { display: none; } :deep(.uiField:nth-of-type(2)) { grid-column: 2; } :deep(.uiIconButton) { grid-column: 3; grid-row: 1 / span 2; } } }
}
</style>

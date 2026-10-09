<template>
  <div class="modelPopover">
    <uiPopover v-model:visible="visible" placement="top-start" :width="340" :offset="10" :disabled="disabled">
      <template #reference="{ triggerAttrs }">
        <uiButton class="modelButton" variant="ghost" size="small" :disabled="disabled" v-bind="triggerAttrs" aria-label="模型与推理设置">
          <modelIcon v-if="selectedModelChoice" :model="selectedModelChoice.modelId" :size="14" /><span class="modelName">{{ selectedModelChoice?.label ?? "选择模型" }}</span><span class="reasoningLabel">· {{ reasoningLabel }}</span><icon-chevron-down :size="12" aria-hidden="true" />
        </uiButton>
      </template>
      <div class="modelOptions">
        <uiField label="模型"><template #default="{ id }"><div class="modelSelection"><modelIcon v-if="selectedModelChoice" :model="selectedModelChoice.modelId" :size="18" /><uiSelect :id="id" :modelValue="selectedModel" :options="modelOptions" filterable :disabled="disabled" placeholder="选择模型" aria-label="选择模型" noDataText="请先在设置中添加模型" @update:modelValue="value => typeof value === 'string' && (selectedModel = value)" /></div></template></uiField>
        <uiField label="推理等级"><uiRadioGroup :modelValue="reasoningEffort" :options="reasoningOptions" :disabled="disabled" variant="segmented" block aria-label="推理等级" @update:modelValue="value => typeof value === 'string' && (reasoningEffort = value)" /></uiField>
      </div>
    </uiPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconChevronDown } from "@tabler/icons-vue";
import { uiButton, uiPopover, uiField, uiSelect, uiRadioGroup } from "@omnistudio-next/ui";
import { modelIcon } from "@omnistudio-next/model-icons";
import { usePlatformModelsStore } from "@/stores/platformModels";

const selectedModel = defineModel<string>({ default: "" });
const reasoningEffort = defineModel<string>("reasoningEffort", { default: "" });
const props = withDefaults(defineProps<{ active?: boolean; disabled?: boolean }>(), { active: true, disabled: false });
const visible = ref(false);
const reasoningOptions = [
  { label: "默认", value: "" },
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
];
const platformModels = usePlatformModelsStore();
const modelChoices = computed(() => platformModels.modelChoices);
const modelOptions = computed(() => platformModels.textModels.map(model => ({ value: JSON.stringify([model.providerId, model.modelId]), label: model.label, group: model.providerLabel })));
const selectedModelChoice = computed(() => modelChoices.value.find(item => item.value === selectedModel.value));
const reasoningLabel = computed(() => reasoningOptions.find(item => item.value === reasoningEffort.value)?.label ?? "默认");
watch(selectedModel, () => { reasoningEffort.value = ""; });
void platformModels.load();
watch(modelChoices, items => {
  if (items.length && !items.some(item => item.value === selectedModel.value)) selectedModel.value = items[0]!.value;
}, { immediate: true });
watch(() => !props.active || props.disabled, close => { if (close) visible.value = false; });
</script>

<style lang="scss" scoped>
.modelPopover {
  display: inline-flex; min-width: 0; max-width: 100%;
  .modelButton { min-width: 0; max-width: 100%; padding-inline: 8px; :deep(.buttonLabel) { display: flex; align-items: center; gap: 6px; } svg { flex-shrink: 0; } .modelName { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; } .reasoningLabel { flex-shrink: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
}
.modelOptions { display: flex; flex-direction: column; gap: 20px; min-width: 0; padding: 4px; .modelSelection { display: flex; align-items: center; gap: 8px; min-width: 0; :deep(.uiPopover) { flex: 1; min-width: 0; } } }
</style>

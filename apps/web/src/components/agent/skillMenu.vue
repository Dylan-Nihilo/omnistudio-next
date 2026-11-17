<template>
  <div class="skillMenu" @keydown.capture="handleKeydown">
    <uiPopover :visible="visible" trigger="manual" :anchor="editor?.closest<HTMLElement>('.messageInput') ?? editor" placement="top-start" matchWidth role="listbox" aria-label="技能指令" @update:visible="value => { if (!value) closeMenu(); }">
    <template #reference><uiButton v-if="showButton" class="skillButton" variant="ghost" :disabled="disabled" :aria-expanded="visible" :aria-controls="listId" aria-label="选择技能" title="选择技能" @click="visible ? closeMenu() : openMenu()"><icon-book :size="15" /></uiButton></template>
    <div v-if="visible" class="skillPopup">
      <div class="skillScroll">
        <details v-if="diagnostics.length" class="skillDiagnostics"><summary>有 {{ diagnostics.length }} 条技能加载提示</summary><ul><li v-for="(item, index) in diagnostics" :key="index">{{ item.path }}：{{ item.message }}</li></ul></details>
        <div v-if="skills.length" class="skillFilters">
          <uiSelect :modelValue="selectedStage" :options="stageOptions" size="small" aria-label="按制作阶段筛选技能" @update:modelValue="value => typeof value === 'string' && (selectedStage = value)" />
          <uiSelect :modelValue="selectedScope" :options="scopeOptions" size="small" aria-label="按技能来源筛选" @update:modelValue="value => typeof value === 'string' && (selectedScope = value)" />
        </div>
        <div :id="listId" role="listbox" aria-label="技能指令" :aria-busy="loading">
          <div v-if="loading || loadError || !filteredSkills.length" class="skillStatus" role="status">{{ loading ? "正在加载技能…" : loadError || (skills.length ? "没有匹配的技能" : "暂无可用技能") }}</div>
          <button v-for="(skill, index) in filteredSkills" v-else :id="`${listId}-${index}`" :key="skill.name" class="skillItem" :class="{ active: index === activeIndex }" type="button" role="option" :aria-selected="index === activeIndex" @mouseenter="activeIndex = index" @mousedown.prevent @click="selectSkill(skill.name)">
            <span class="skillName"><icon-book :size="15" />{{ skill.displayName || skill.name }}<code>/skill:{{ skill.name }}</code></span>
            <span class="skillDescription">{{ skill.description }}</span>
            <span class="skillMeta"><span>{{ scopeLabel(skill.scope) }}</span><span>{{ stageLabel(skill.stage) }}</span><span>v{{ skill.version || "未标版本" }}</span></span>
            <span v-if="skill.warnings?.length" class="skillDescription">{{ skill.warnings.join("；") }}</span>
          </button>
        </div>
      </div>
    </div>
    </uiPopover>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import axios from "axios";
import { IconBook } from "@tabler/icons-vue";
import { uiButton, uiPopover, uiSelect } from "@omnistudio-next/ui";

const props = withDefaults(defineProps<{ directory?: string; active: boolean; disabled: boolean; query?: string; editor?: HTMLElement; showButton?: boolean }>(), { showButton: true });
const emit = defineEmits<{ select: [name: string]; dismiss: [] }>();
const listId = useId();
const buttonVisible = ref(false);
const visible = computed(() => props.active && !props.disabled && (buttonVisible.value || props.query !== undefined));
const skills = ref<{ name: string; displayName?: string; description: string; stage?: string; scope?: "workspace" | "account" | "global"; version?: string; warnings?: string[] }[]>([]);
const diagnostics = ref<{ path: string; message: string }[]>([]);
const loading = ref(false);
const loadError = ref("");
const activeIndex = ref(0);
const selectedStage = ref("all");
const selectedScope = ref("all");
const stageLabels: Record<string, string> = {
  scriptAnalysis: "剧本分析",
  storyboard: "分镜",
  assetDesign: "资产设计",
  mediaGeneration: "媒体生成",
  continuity: "连续性",
  reviewQa: "质量检查",
  audioSubtitle: "音频字幕",
  delivery: "交付",
  workflow: "全流程",
};
const scopeOptions = [
  { value: "all", label: "全部来源" },
  { value: "workspace", label: "工作区" },
  { value: "account", label: "个人" },
  { value: "global", label: "全局" },
];
const stageOptions = computed(() => [
  { value: "all", label: "全部阶段" },
  ...[...new Set(skills.value.map(skill => skill.stage).filter((stage): stage is string => !!stage))]
    .sort((left, right) => stageLabel(left).localeCompare(stageLabel(right), "zh-CN"))
    .map(stage => ({ value: stage, label: stageLabel(stage) })),
]);
const filteredSkills = computed(() => {
  const query = (props.query ?? "").toLocaleLowerCase();
  return skills.value.filter(skill => {
    const searchable = `skill:${skill.name} ${skill.displayName ?? ""} ${skill.description} ${skill.stage ?? ""}`.toLocaleLowerCase();
    return searchable.includes(query)
      && (selectedStage.value === "all" || (skill.stage ?? "") === selectedStage.value)
      && (selectedScope.value === "all" || (skill.scope ?? "global") === selectedScope.value);
  });
});

function stageLabel(stage?: string) {
  return stage ? stageLabels[stage] ?? stage : "通用";
}

function scopeLabel(scope?: "workspace" | "account" | "global") {
  return scope === "workspace" ? "工作区" : scope === "account" ? "个人" : "全局";
}

function closeMenu() {
  buttonVisible.value = false;
  emit("dismiss");
}

function openMenu() {
  if (!props.disabled) buttonVisible.value = true;
}

function selectSkill(name: string) {
  emit("select", name);
  closeMenu();
}

function handleKeydown(event: KeyboardEvent) {
  if (!visible.value || event.isComposing || event.keyCode === 229) return;
  if (event.target instanceof Element && event.target.closest(".skillDiagnostics")) return;
  if (event.target instanceof Element && event.target.closest(".skillFilters")) return;
  if (event.key === "Tab" && (event.shiftKey || loading.value || loadError.value || !filteredSkills.value.length)) return closeMenu();
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (!["ArrowUp", "ArrowDown", "Enter", "Tab", "Escape"].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") return closeMenu();
  if (loading.value || loadError.value || !filteredSkills.value.length) return;
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    activeIndex.value = (activeIndex.value + (event.key === "ArrowDown" ? 1 : -1) + filteredSkills.value.length) % filteredSkills.value.length;
  } else selectSkill(filteredSkills.value[activeIndex.value]!.name);
}

watch(filteredSkills, () => { activeIndex.value = 0; });
watch([visible, activeIndex, filteredSkills, loading, loadError], async () => {
  await nextTick();
  const editor = props.editor?.querySelector('[role="textbox"]');
  if (!visible.value && editor?.getAttribute("aria-controls") !== listId) return;
  editor?.setAttribute("aria-haspopup", "listbox");
  editor?.setAttribute("aria-expanded", String(visible.value));
  editor?.setAttribute("aria-controls", listId);
  if (visible.value && !loading.value && !loadError.value && filteredSkills.value.length) {
    const id = `${listId}-${activeIndex.value}`;
    editor?.setAttribute("aria-activedescendant", id);
    document.getElementById(id)?.scrollIntoView({ block: "nearest" });
  } else editor?.removeAttribute("aria-activedescendant");
});

watch([visible, () => props.directory], async ([open, directory], _previous, onCleanup) => {
  if (!open) return closeMenu();
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  loading.value = true;
  loadError.value = "";
  skills.value = [];
  diagnostics.value = [];
  try {
    const { data } = await axios.get("/api/agent/skills", {
      params: { directory }, signal: controller.signal,
      headers: { "x-omnistudio-next-workspace": "1" },
    });
    if (data.code !== 200) throw new Error(data.message || "加载技能失败");
    if (controller.signal.aborted) return;
    skills.value = data.data.skills;
    diagnostics.value = data.data.diagnostics;
  } catch (error) {
    if (!axios.isCancel(error)) loadError.value = axios.isAxiosError(error) ? error.response?.data?.message || "加载技能失败，请重新打开重试" : "加载技能失败，请重新打开重试";
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
});

defineExpose({ handleKeydown, openMenu, closeMenu });
</script>

<style lang="scss" scoped>
.skillMenu {
  flex-shrink: 0;

  .skillButton {
    width: 24px;
    height: 24px;
    padding: 0;
  }

  .skillPopup {
    min-width: 0;
    .skillScroll { max-height: 260px; overflow: auto; overscroll-behavior: contain; .skillDiagnostics { padding: 10px 12px; color: var(--uiTextMuted); font-size: 12px; overflow-wrap: anywhere; summary { cursor: pointer; } ul { margin: 8px 0 0; padding-left: 18px; } } }

    .skillFilters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding: 8px; border-bottom: 1px solid var(--uiBorderDefault); :deep(.uiSelect) { min-width: 0; } :deep(.uiSelect input) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }

    .skillStatus {
      padding: 12px;
      color: var(--uiTextMuted);
    }

    .skillItem {
      display: flex;
      flex-direction: column;
      gap: 4px;
      width: 100%;
      padding: 8px;
      border: none;
      border-radius: var(--uiRadiusControl);
      background: transparent;
      color: var(--uiTextPrimary);
      font: inherit;
      text-align: left;
      overflow-wrap: anywhere;
      cursor: pointer;

      &.active, &:focus-visible {
        background: var(--uiBackgroundSubtle);
      }

      .skillName {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        flex-wrap: wrap;
        code { color: var(--uiTextMuted); font-size: 11px; font-weight: 400; }
      }

      .skillDescription {
        color: var(--uiTextMuted);
        font-size: 12px;
      }

      .skillMeta { display: flex; flex-wrap: wrap; gap: 4px 10px; color: var(--uiTextMuted); font-size: 11px; }
    }
  }
}
</style>

<template>
  <section class="storyboardEditor" :aria-busy="isTableBusy || undefined">
    <p v-if="aiError" class="aiFeedback aiError" role="alert">{{ aiError }}</p>
    <p v-else-if="aiNotice" class="aiFeedback aiNotice" role="status">{{ aiNotice }}</p>
    <header class="tableToolbar" :class="{ editing: isEditing }">
      <label v-if="isEditing" class="tableAiControls">
        <span>AI 文本模型</span>
        <uiSelect :modelValue="props.modelValue" :options="props.modelOptions" :disabled="isTableBusy || !props.modelOptions.length" aria-label="单镜头分析文本模型" @update:modelValue="value => emit('update:modelValue', String(value || ''))" />
      </label>
      <div class="toolbarActions">
        <uiButton v-if="!isEditing && canEdit" size="small" variant="secondary" :disabled="isTableBusy" @click="beginEdit">编辑</uiButton>
        <uiButton v-if="!isEditing && canAdd" size="small" variant="secondary" :disabled="isTableBusy" @click="beginAddShot">添加镜头</uiButton>
        <template v-if="isEditing">
          <uiButton size="small" variant="ghost" :disabled="isTableBusy" @click="cancelEdit">取消</uiButton>
          <uiButton size="small" variant="secondary" :loading="busy" :disabled="isTableBusy || !isDirty" @click="submitEdit">提交</uiButton>
        </template>
      </div>
    </header>
    <div class="storyboardTableViewport" role="region" aria-label="分镜脚本表格，可横向滚动" tabindex="0">
      <table class="storyboardTable">
        <caption class="srOnly">剧集分镜脚本</caption>
        <thead>
          <tr>
            <th scope="col" class="centerColumn shotColumn">序号</th>
            <th scope="col" class="centerColumn durationColumn">时长（秒）</th>
            <th scope="col" class="centerColumn typeColumn">景别</th>
            <th scope="col" class="assetColumn">角色</th>
            <th scope="col" class="sceneColumn">场景</th>
            <th scope="col" class="assetColumn">道具</th>
            <th scope="col" class="lightingColumn">光影</th>
            <th scope="col" class="textColumn">音效</th>
            <th scope="col" class="textColumn">对白</th>
            <th scope="col" class="textColumn">旁白</th>
            <th scope="col" class="directionColumn">镜头控制</th>
            <th scope="col" class="promptColumn">画面描述</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(shot, index) in rows" :key="shot.id || `new-${index}`">
            <td class="centerColumn shotIdentity">
              <strong>{{ String(index + 1).padStart(2, "0") }}</strong>
              <div v-if="isEditing && canEditShot(shot)" class="rowActions">
                <uiIconButton size="small" :icon="IconSparkles" :disabled="isTableBusy || !canEdit || !selectedModel || props.scriptRevision < 1" :label="`AI 分析填充镜头 ${index + 1} 的空字段`" :title="props.scriptRevision < 1 ? '请先保存确认的剧本版本' : `AI 分析填充镜头 ${index + 1} 的空字段`" @click="analyzeShot(index)" />
                <uiIconButton size="small" :icon="IconPlus" :disabled="isTableBusy || !canAdd" :label="`在镜头 ${index + 1} 后新增一行`" :title="`在镜头 ${index + 1} 后新增一行`" @click="addAfter(index)" />
                <uiIconButton size="small" :icon="IconTrash" :disabled="isTableBusy || !canEdit" :label="`删除镜头 ${index + 1}`" :title="`删除镜头 ${index + 1}`" @click="removeShot(index)" />
              </div>
            </td>
            <td class="centerColumn durationValue">
              <uiNumberInput v-if="isEditing && canEditShot(shot)" :modelValue="shot.durationMs / 1000" :min="0" :max="900" :precision="2" :disabled="isTableBusy" :aria-label="`镜头 ${index + 1} 时长（秒）`" @update:modelValue="value => setDuration(shot, value)" />
              <span v-else>{{ formatDuration(shot.durationMs) }}</span>
            </td>
            <td class="centerColumn">
              <uiSelect v-if="isEditing && canEditShot(shot)" :modelValue="shot.shotType || ''" :options="shotTypeOptions(shot.shotType)" :disabled="isTableBusy" aria-label="景别" @update:modelValue="value => shot.shotType = String(value || '')" />
              <span v-else>{{ shot.shotType || missingValue }}</span>
            </td>
            <td class="assetNames">
              <uiSelect v-if="isEditing && canEditShot(shot)" :modelValue="shot.characterAssetIds" :options="characterOptions" multiple filterable :disabled="isTableBusy" placeholder="选择角色" aria-label="角色" @update:modelValue="value => updateAssetIds(shot.characterAssetIds, value)" />
              <span v-else>{{ assetNames(shot.characterAssetIds, "character") }}</span>
            </td>
            <td class="sceneName">
              <div class="sceneCellContent">
                <template v-if="isEditing && canEditShot(shot)">
                  <uiSelect v-if="shot.sceneId || scenes.length" :modelValue="shot.sceneId || newSceneValue" :options="sceneOptions" :disabled="isTableBusy" aria-label="场景" @update:modelValue="value => setScene(shot, String(value || ''))" />
                  <template v-if="!shot.sceneId">
                    <uiNumberInput v-model="shot.sceneNumber" :min="1" :precision="0" :disabled="isTableBusy" aria-label="新场景编号" />
                    <uiInput v-model.trim="shot.sceneTitle" :disabled="isTableBusy" aria-label="新场景名称" />
                  </template>
                </template>
                <span v-else>{{ sceneTitle(shot) }}</span>
              </div>
            </td>
            <td class="assetNames">
              <uiSelect v-if="isEditing && canEditShot(shot)" :modelValue="shot.propAssetIds" :options="propOptions" multiple filterable :disabled="isTableBusy" placeholder="选择道具" aria-label="道具" @update:modelValue="value => updateAssetIds(shot.propAssetIds, value)" />
              <span v-else>{{ assetNames(shot.propAssetIds, "prop") }}</span>
            </td>
            <td class="longText"><button v-if="isEditing && canEditShot(shot)" class="textEditorTrigger" type="button" :disabled="isTableBusy" :aria-label="`编辑镜头 ${index + 1} 光影`" title="编辑光影" @click="openTextEditor(index, shot, 'lighting', '光影', 500)"><span>{{ shot.lighting || missingValue }}</span><component :is="IconEdit" :size="15" aria-hidden="true" /></button><span v-else>{{ shot.lighting || missingValue }}</span></td>
            <td class="longText"><button v-if="isEditing && canEditShot(shot)" class="textEditorTrigger" type="button" :disabled="isTableBusy" :aria-label="`编辑镜头 ${index + 1} 音效`" title="编辑音效" @click="openTextEditor(index, shot, 'soundEffects', '音效', 10000)"><span>{{ shot.soundEffects || missingValue }}</span><component :is="IconEdit" :size="15" aria-hidden="true" /></button><span v-else>{{ shot.soundEffects || missingValue }}</span></td>
            <td class="longText"><button v-if="isEditing && canEditShot(shot)" class="textEditorTrigger" type="button" :disabled="isTableBusy" :aria-label="`编辑镜头 ${index + 1} 对白`" title="编辑对白" @click="openTextEditor(index, shot, 'dialogue', '对白', 10000)"><span>{{ shot.dialogue || missingValue }}</span><component :is="IconEdit" :size="15" aria-hidden="true" /></button><span v-else>{{ shot.dialogue || missingValue }}</span></td>
            <td class="longText"><button v-if="isEditing && canEditShot(shot)" class="textEditorTrigger" type="button" :disabled="isTableBusy" :aria-label="`编辑镜头 ${index + 1} 旁白`" title="编辑旁白" @click="openTextEditor(index, shot, 'narration', '旁白', 10000)"><span>{{ shot.narration || missingValue }}</span><component :is="IconEdit" :size="15" aria-hidden="true" /></button><span v-else>{{ shot.narration || missingValue }}</span></td>
            <td class="longText"><button v-if="isEditing && canEditShot(shot)" class="textEditorTrigger" type="button" :disabled="isTableBusy" :aria-label="`编辑镜头 ${index + 1} 镜头控制`" title="编辑镜头控制" @click="openTextEditor(index, shot, 'camera', '镜头控制', 500)"><span>{{ shot.camera || missingValue }}</span><component :is="IconEdit" :size="15" aria-hidden="true" /></button><span v-else>{{ shot.camera || missingValue }}</span></td>
            <td class="longText promptText"><button v-if="isEditing && canEditShot(shot)" class="textEditorTrigger" type="button" :disabled="isTableBusy" :aria-label="`编辑镜头 ${index + 1} 画面描述`" title="编辑画面描述" @click="openTextEditor(index, shot, 'prompt', '画面描述', 20000)"><span>{{ shot.prompt || missingValue }}</span><component :is="IconEdit" :size="15" aria-hidden="true" /></button><span v-else>{{ shot.prompt || missingValue }}</span></td>
          </tr>
          <tr v-if="!rows.length"><td class="emptyCell" colspan="12">当前剧集还没有镜头</td></tr>
        </tbody>
      </table>
    </div>
    <uiDialog v-model="textEditorVisible" :title="textEditorTitle" width="min(1320px, calc(100vw - 32px))" showFullscreen :closeOnClickModal="false" :closeOnPressEscape="!isTableBusy" :showClose="!isTableBusy" @opened="focusTextEditor" @closed="clearTextEditor">
      <div v-if="textEditor" class="textEditorBody">
        <div class="textEditorContext"><strong>镜头 {{ String(textEditor.shotNumber).padStart(2, "0") }} · {{ textEditor.sceneTitle }}</strong><span>{{ textEditorDraft.length }} / {{ textEditor.maxLength }}</span></div>
        <uiTextarea ref="textEditorInput" v-model="textEditorDraft" class="storyboardTextEditor" :rows="20" resize="vertical" :maxlength="textEditor.maxLength" :disabled="isTableBusy" :aria-label="`镜头 ${textEditor.shotNumber} ${textEditor.label}`" />
      </div>
      <template #footer><div class="textEditorActions"><uiButton variant="secondary" :disabled="isTableBusy" @click="closeTextEditor">取消</uiButton><uiButton :disabled="isTableBusy" @click="applyTextEditor">应用</uiButton></div></template>
    </uiDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import axios from "axios";
import { IconEdit, IconPlus, IconSparkles, IconTrash } from "@tabler/icons-vue";
import { uiButton, uiDialog, uiIconButton, uiInput, uiNumberInput, uiSelect, uiTextarea, useUiFeedback, isUiCancelledError } from "@omnistudio-next/ui";

type StoryboardShot = {
  id?: string;
  sceneId?: string | null;
  sceneNumber?: number;
  sceneTitle?: string;
  durationMs: number;
  shotType: string | null;
  camera: string | null;
  lighting: string | null;
  dialogue: string | null;
  narration: string | null;
  prompt: string | null;
  characterAssetIds: string[];
  propAssetIds: string[];
  soundEffects: string | null;
  status?: "draft" | "ready" | "generating" | "review" | "changesRequested" | "approved";
};
type StoryboardScene = { id: string; episodeId: string; sceneNumber: number; title: string; continuityNotes?: string | null };
type StoryboardAsset = { id: string; name: string; assetType: "character" | "scene" | "prop" };
type SelectOption = { value: string; label: string };

const props = defineProps<{
  shots: StoryboardShot[];
  scenes: StoryboardScene[];
  assets: StoryboardAsset[];
  canEdit: boolean;
  canAdd: boolean;
  busy: boolean;
  projectId: string;
  episodeId: string;
  directory: string;
  scriptRevision: number;
  modelValue: string;
  modelOptions: SelectOption[];
}>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [shots: StoryboardShot[]];
  editingChange: [isEditing: boolean];
}>();

type ApiResponse<T> = { code: number; data: T; message: string };
type ShotAnalysisPatch = Omit<StoryboardShot, "id" | "sceneId" | "sceneNumber" | "sceneTitle">;
type StoryboardTextField = "lighting" | "soundEffects" | "dialogue" | "narration" | "camera" | "prompt";
type TextEditorState = { rowIndex: number; shotNumber: number; sceneTitle: string; field: StoryboardTextField; label: string; maxLength: number };

const missingValue = "—";
const newSceneValue = "__newScene__";
const feedback = useUiFeedback();
const isEditing = ref(false);
const localRows = ref<StoryboardShot[]>([]);
const editSnapshot = ref("");
const aiBusyIndex = ref<number | null>(null);
const aiError = ref("");
const aiNotice = ref("");
const textEditorVisible = ref(false);
const textEditor = ref<TextEditorState>();
const textEditorDraft = ref("");
const textEditorInput = ref<{ focus: () => void }>();
const isDirty = computed(() => isEditing.value && JSON.stringify(localRows.value) !== editSnapshot.value);
const isTableBusy = computed(() => props.busy || aiBusyIndex.value !== null);
const rows = computed(() => isEditing.value ? localRows.value : props.shots.map(cloneShot));
const textEditorTitle = computed(() => textEditor.value ? `编辑镜头 ${String(textEditor.value.shotNumber).padStart(2, "0")} · ${textEditor.value.label}` : "编辑镜头文本");
const scenesById = computed(() => new Map(props.scenes.map(scene => [scene.id, scene])));
const assetsById = computed(() => new Map(props.assets.map(asset => [asset.id, asset])));
const sceneOptions = computed<SelectOption[]>(() => [
  ...props.scenes.map(scene => ({ value: scene.id, label: `${String(scene.sceneNumber).padStart(2, "0")} · ${scene.title}` })),
  { value: newSceneValue, label: "新建场景" },
]);
const characterOptions = computed<SelectOption[]>(() => props.assets.filter(asset => asset.assetType === "character").map(asset => ({ value: asset.id, label: asset.name })));
const propOptions = computed<SelectOption[]>(() => props.assets.filter(asset => asset.assetType === "prop").map(asset => ({ value: asset.id, label: asset.name })));
const selectedModel = computed(() => {
  try {
    const value = JSON.parse(props.modelValue) as unknown;
    return Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string" ? { providerId: value[0], modelId: value[1] } : undefined;
  } catch { return undefined; }
});
function cloneShot(shot: StoryboardShot): StoryboardShot {
  return { ...shot, characterAssetIds: [...(shot.characterAssetIds ?? [])], propAssetIds: [...(shot.propAssetIds ?? [])] };
}

function sceneTitle(shot: StoryboardShot) {
  return shot.sceneId ? scenesById.value.get(shot.sceneId)?.title || missingValue : shot.sceneTitle || missingValue;
}

function formatDuration(durationMs: number) {
  return Number.isFinite(durationMs) && durationMs >= 0 ? (durationMs / 1000).toFixed(2) : missingValue;
}

function canEditShot(shot: StoryboardShot) {
  return props.canEdit && (!shot.status || shot.status === "draft" || shot.status === "ready");
}

function openTextEditor(rowIndex: number, shot: StoryboardShot, field: StoryboardTextField, label: string, maxLength: number) {
  if (!isEditing.value || isTableBusy.value || !canEditShot(shot)) return;
  textEditor.value = { rowIndex, shotNumber: rowIndex + 1, sceneTitle: sceneTitle(shot), field, label, maxLength };
  textEditorDraft.value = shot[field] ?? "";
  textEditorVisible.value = true;
}

function focusTextEditor() {
  void nextTick(() => textEditorInput.value?.focus());
}

function closeTextEditor() {
  if (isTableBusy.value) return;
  textEditorVisible.value = false;
}

function clearTextEditor() {
  textEditor.value = undefined;
  textEditorDraft.value = "";
}

function applyTextEditor() {
  const editor = textEditor.value;
  const shot = editor && localRows.value[editor.rowIndex];
  if (!editor || !shot || isTableBusy.value || !canEditShot(shot)) return;
  shot[editor.field] = textEditorDraft.value;
  textEditorVisible.value = false;
}

function assetNames(assetIds: string[] | null | undefined, assetType: "character" | "prop") {
  const names = (assetIds ?? []).flatMap(id => {
    const asset = assetsById.value.get(id);
    return asset?.assetType === assetType && asset.name.trim() ? [asset.name] : [];
  });
  return names.length ? names.join("、") : missingValue;
}

function shotTypeOptions(currentValue: string | null): SelectOption[] {
  const commonTypes = ["远景", "全景", "中景", "近景", "特写", "大特写"];
  const values = currentValue && !commonTypes.includes(currentValue) ? [...commonTypes, currentValue] : commonTypes;
  return [{ value: "", label: "请选择" }, ...values.map(value => ({ value, label: value }))];
}

function setDuration(shot: StoryboardShot, value: string | number | undefined) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) shot.durationMs = Math.round(seconds * 1000);
}

function updateAssetIds(target: string[], value: unknown) {
  target.splice(0, target.length, ...(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []));
}

function responseData<T>(response: ApiResponse<T>) {
  if (response.code !== 200) throw new Error(response.message || "请求失败");
  return response.data;
}

function errorText(error: unknown) {
  return axios.isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || "连接中断，请刷新后重试"
    : error instanceof Error ? error.message : "操作失败，请重试";
}

function analysisContext(shot: StoryboardShot, includeId = false) {
  const scene = shot.sceneId ? scenesById.value.get(shot.sceneId) : undefined;
  return {
    ...(includeId && shot.id ? { id: shot.id } : {}),
    sceneId: shot.sceneId ?? "",
    sceneNumber: shot.sceneNumber ?? scene?.sceneNumber,
    sceneTitle: shot.sceneTitle ?? scene?.title,
    durationMs: shot.durationMs,
    shotType: shot.shotType,
    camera: shot.camera,
    lighting: shot.lighting,
    characterAssetIds: [...shot.characterAssetIds],
    propAssetIds: [...shot.propAssetIds],
    soundEffects: shot.soundEffects,
    dialogue: shot.dialogue,
    narration: shot.narration,
    prompt: shot.prompt,
  };
}

function fillEmptyFields(target: StoryboardShot, generated: ShotAnalysisPatch) {
  const filled: string[] = [];
  if (target.durationMs <= 0 && generated.durationMs > 0) {
    target.durationMs = generated.durationMs;
    filled.push("时长");
  }
  if (!target.shotType?.trim() && generated.shotType?.trim()) { target.shotType = generated.shotType; filled.push("景别"); }
  if (!target.camera?.trim() && generated.camera?.trim()) { target.camera = generated.camera; filled.push("镜头控制"); }
  if (!target.lighting?.trim() && generated.lighting?.trim()) { target.lighting = generated.lighting; filled.push("光影"); }
  if (!target.characterAssetIds.length && generated.characterAssetIds.length) { target.characterAssetIds.splice(0, target.characterAssetIds.length, ...generated.characterAssetIds); filled.push("角色"); }
  if (!target.propAssetIds.length && generated.propAssetIds.length) { target.propAssetIds.splice(0, target.propAssetIds.length, ...generated.propAssetIds); filled.push("道具"); }
  if (!target.soundEffects?.trim() && generated.soundEffects?.trim()) { target.soundEffects = generated.soundEffects; filled.push("音效"); }
  if (!target.dialogue?.trim() && generated.dialogue?.trim()) { target.dialogue = generated.dialogue; filled.push("对白"); }
  if (!target.narration?.trim() && generated.narration?.trim()) { target.narration = generated.narration; filled.push("旁白"); }
  if (!target.prompt?.trim() && generated.prompt?.trim()) { target.prompt = generated.prompt; filled.push("画面描述"); }
  return filled;
}

async function analyzeShot(index: number) {
  if (!isEditing.value || !props.canEdit || props.scriptRevision < 1 || isTableBusy.value || !selectedModel.value) return;
  const target = localRows.value[index];
  if (!target || !canEditShot(target)) return;
  const model = selectedModel.value;
  const payload = {
    projectId: props.projectId,
    episodeId: props.episodeId,
    providerId: model.providerId,
    modelId: model.modelId,
    shot: analysisContext(target, true),
    previousShot: index > 0 ? analysisContext(localRows.value[index - 1]) : undefined,
    nextShot: index + 1 < localRows.value.length ? analysisContext(localRows.value[index + 1]) : undefined,
  };
  aiBusyIndex.value = index;
  aiError.value = "";
  aiNotice.value = "";
  try {
    const quoteResponse = await axios.post<ApiResponse<{ credits: string; sourceScriptRevision: number }>>("/api/productionProjects/storyboard/quoteShot", payload);
    const quote = responseData(quoteResponse.data);
    try {
      await feedback.confirm(`将根据本集剧本和相邻镜头分析第 ${index + 1} 个镜头，只填充空字段；预计消耗 ${quote.credits} 积分。`, "单镜头 AI 分析", { confirmButtonText: "确认分析", cancelButtonText: "取消" });
    } catch (error) {
      if (!isUiCancelledError(error)) aiError.value = errorText(error);
      return;
    }
    const analysisResponse = await axios.post<ApiResponse<{ sourceScriptRevision: number; shot: ShotAnalysisPatch }>>("/api/productionProjects/storyboard/analyzeShot", {
      ...payload,
      directory: props.directory,
      expectedScriptRevision: quote.sourceScriptRevision,
    });
    const analyzed = responseData(analysisResponse.data);
    const current = localRows.value[index];
    if (current !== target) return;
    const filled = fillEmptyFields(current, analyzed.shot);
    aiNotice.value = filled.length
      ? `镜头 ${index + 1} 已补全：${filled.join("、")}。检查后点“提交”保存。`
      : `镜头 ${index + 1} 没有可填的空字段，现有内容未改变。`;
  } catch (error) {
    aiError.value = errorText(error);
  } finally {
    aiBusyIndex.value = null;
  }
}

function emptyShot(source?: StoryboardShot): StoryboardShot {
  return {
    sceneId: source?.sceneId ?? "",
    sceneNumber: source?.sceneNumber ?? (props.scenes.at(-1)?.sceneNumber ?? 0) + 1,
    sceneTitle: source?.sceneTitle ?? `场景 ${String((props.scenes.at(-1)?.sceneNumber ?? 0) + 1).padStart(2, "0")}`,
    durationMs: 5000,
    shotType: "",
    camera: "",
    lighting: "",
    characterAssetIds: [],
    propAssetIds: [],
    soundEffects: "",
    dialogue: "",
    narration: "",
    prompt: "",
  };
}

function beginEdit() {
  if (!props.canEdit || isTableBusy.value) return;
  localRows.value = props.shots.map(cloneShot);
  editSnapshot.value = JSON.stringify(localRows.value);
  isEditing.value = true;
  emit("editingChange", true);
}

function beginAddShot() {
  if (!props.canAdd || isTableBusy.value) return;
  if (!isEditing.value) {
    localRows.value = props.shots.map(cloneShot);
    editSnapshot.value = JSON.stringify(localRows.value);
    isEditing.value = true;
    emit("editingChange", true);
  }
  const last = localRows.value.at(-1);
  const row = emptyShot(last);
  if (!last && props.scenes.length) {
    const scene = props.scenes.at(-1)!;
    row.sceneId = scene.id;
    row.sceneNumber = scene.sceneNumber;
    row.sceneTitle = scene.title;
  }
  localRows.value.push(row);
}

function addAfter(index: number) {
  if (!props.canAdd || isTableBusy.value) return;
  localRows.value.splice(index + 1, 0, emptyShot(localRows.value[index]));
}

function removeShot(index: number) {
  if (!props.canEdit || isTableBusy.value) return;
  localRows.value.splice(index, 1);
}

function setScene(shot: StoryboardShot, sceneId: string) {
  if (sceneId === newSceneValue) {
    const sceneNumber = (props.scenes.at(-1)?.sceneNumber ?? 0) + 1;
    shot.sceneId = "";
    shot.sceneNumber = sceneNumber;
    shot.sceneTitle = `场景 ${String(sceneNumber).padStart(2, "0")}`;
    return;
  }
  const scene = scenesById.value.get(sceneId);
  if (!scene) return;
  shot.sceneId = scene.id;
  shot.sceneNumber = scene.sceneNumber;
  shot.sceneTitle = scene.title;
}

function submitEdit() {
  if (!isEditing.value || !props.canEdit || isTableBusy.value || !isDirty.value) return;
  emit("save", localRows.value.map(cloneShot));
}

function cancelEdit() {
  if (!isEditing.value || isTableBusy.value) return;
  localRows.value = [];
  editSnapshot.value = "";
  aiError.value = "";
  aiNotice.value = "";
  isEditing.value = false;
  emit("editingChange", false);
}

function finishEdit() {
  localRows.value = [];
  editSnapshot.value = "";
  aiError.value = "";
  aiNotice.value = "";
  isEditing.value = false;
  emit("editingChange", false);
}

defineExpose({ beginAddShot, finishEdit });

watch(() => [props.shots, props.scenes], () => {
  if (!isEditing.value) localRows.value = props.shots.map(cloneShot);
});
</script>

<style scoped lang="scss">
.storyboardEditor { min-width: 0; }
.tableToolbar { display: flex; align-items: center; justify-content: flex-end; gap: 12px; min-height: 34px; margin-bottom: 6px; color: var(--uiTextMuted, #aaa29d); font-size: 11px; &.editing { justify-content: space-between; } }
.tableAiControls { display: grid; grid-template-columns: auto minmax(180px, 240px); align-items: center; gap: 8px; min-width: 0; color: var(--uiTextMuted, #aaa29d); }
.toolbarActions { display: flex; align-items: center; gap: 6px; }
.aiFeedback { margin: 0 0 6px; padding: 7px 9px; border-radius: 5px; font-size: 11px; line-height: 1.5; }
.aiError { color: var(--uiStatusError); background: color-mix(in srgb, var(--uiStatusError) 8%, transparent); }
.aiNotice { color: var(--uiTextMuted); background: var(--uiBackgroundSubtle); }
.storyboardTableViewport { max-width: 100%; max-height: min(72vh, 780px); overflow: auto; border: 1px solid var(--uiBorderDefault, #3b3b3b); border-radius: 8px; background: var(--uiSurfaceRaised, #202020); scrollbar-color: #6d574b #1b1b1b; scrollbar-width: thin; &:focus-visible { outline: 2px solid var(--uiActionPrimary, #ff6637); outline-offset: 2px; }
  .storyboardTable { width: max(100%, 1750px); table-layout: fixed; border-collapse: separate; border-spacing: 0; color: var(--uiTextBody, #e6e2df); font-size: 12px; line-height: 1.5;
    th, td { padding: 8px 7px; border-bottom: 1px solid var(--uiBorderDefault, #353535); }
    th { position: sticky; z-index: 1; top: 0; color: var(--uiTextMuted, #aaa29d); background: #292521; text-align: center; font-size: 11px; font-weight: 600; white-space: nowrap; }
    td { vertical-align: middle; text-align: center; background: #201e1c; }
    tbody tr:nth-child(even) td { background: #242220; }
    tbody tr:hover td { background: color-mix(in srgb, var(--uiActionPrimary, #ff6637) 7%, #242220); }
    tbody tr:last-child td { border-bottom: 0; }
    .centerColumn { text-align: center; vertical-align: middle; }
    .shotColumn { width: 100px; }.durationColumn { width: 140px; }.typeColumn { width: 85px; }.assetColumn { width: 130px; }.sceneColumn { width: 150px; }.lightingColumn { width: 155px; }.textColumn { width: 150px; }.directionColumn { width: 160px; }.promptColumn { width: 300px; }
    .longText, .promptText, .assetNames, .sceneName { overflow-wrap: anywhere; white-space: pre-wrap; }
    .promptText { color: var(--uiTextPrimary, #f4f0ed); }
    .assetNames { color: #e6b08e; }
    .sceneName { color: #ded4ca; }
    .sceneCellContent { display: grid; justify-items: center; gap: 5px; width: 100%; }
    .shotIdentity strong { display: block; color: var(--uiActionPrimary, #ff6637); font-family: ui-monospace, monospace; font-size: 12px; }
    .rowActions { display: flex; justify-content: center; gap: 2px; margin-top: 5px; }
    .durationValue { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .emptyCell { padding: 24px; color: var(--uiTextMuted, #aaa29d); text-align: center; }
    .srOnly { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  }
}
.tableToolbar, .storyboardTable { :deep(input) { min-width: 0; text-align: center; } }
.textEditorTrigger { display: flex; align-items: center; justify-content: space-between; gap: 6px; width: 100%; min-height: 38px; padding: 4px 5px; border: 1px solid transparent; border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: text; &:hover, &:focus-visible { border-color: var(--uiBorderDefault, #555); background: var(--uiBackgroundSubtle, #292725); outline: none; } &:focus-visible { outline: 2px solid var(--uiBorderFocus, #ff6637); outline-offset: 1px; } &:disabled { cursor: wait; } span { display: -webkit-box; min-width: 0; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow-wrap: anywhere; white-space: pre-wrap; } :deep(svg) { flex: 0 0 auto; color: var(--uiTextMuted, #aaa29d); opacity: 0.72; } }
.textEditorBody { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 12px; width: 100%; height: min(68dvh, 760px); min-height: 320px; .textEditorContext { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--uiTextMuted, #aaa29d); font-size: 12px; strong { min-width: 0; color: var(--uiTextPrimary, #f4f0ed); font-size: 13px; overflow-wrap: anywhere; } span { flex: 0 0 auto; font-variant-numeric: tabular-nums; } } .storyboardTextEditor { width: 100%; height: 100%; min-height: 0; color: var(--uiTextPrimary, #f4f0ed); text-align: left; line-height: 1.75; } }
.textEditorActions { display: flex; justify-content: flex-end; gap: 8px; width: 100%; }
:global(dialog.uiDialog.isFullscreen) .textEditorBody { height: calc(100dvh - 176px); }
@media (max-width: 720px) { .tableToolbar { align-items: flex-start; flex-direction: column; }.tableAiControls { grid-template-columns: minmax(0, 1fr); width: 100%; }.toolbarActions { flex-wrap: wrap; } }
</style>

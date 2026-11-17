<template>
  <section class="storyboardDraft" aria-label="分镜生成与审阅" :aria-busy="Boolean(activeRequest)">
    <p v-if="errorMessage" class="draftError" role="alert">{{ errorMessage }}</p>
    <p v-if="isStale" class="draftNotice" role="status">剧本已更新。当前分镜基于 v{{ storedDraft?.sourceScriptRevision }}，请重新生成后再确认。</p>
    <p v-if="isDirty" class="draftStatus" role="status">修改尚未保存。</p>

    <div v-if="loading" class="draftEmpty" role="status">正在读取当前剧集分镜…</div>
    <div v-else-if="!storedDraft" class="draftEmpty">
      <strong>第 {{ props.episodeNumber }} 集尚无分镜</strong>
      <span>选择文本模型后生成，或使用“添加镜头”手动编排。</span>
    </div>
    <template v-else>
      <div class="draftReviewToolbar">
        <div class="draftReviewTitle">
          <strong>第 {{ props.episodeNumber }} 集 · {{ props.episodeTitle }}</strong>
          <span>剧本 v{{ storedDraft.sourceScriptRevision }} · {{ storedDraft.draft.scenes.length }} 个场景 · {{ shotCount }} 个镜头</span>
        </div>
        <div class="draftReviewActions">
          <uiButton v-if="!isEditing" size="small" variant="secondary" :disabled="!canEdit || Boolean(activeRequest)" @click="beginEdit">编辑</uiButton>
          <template v-else>
            <uiButton size="small" variant="ghost" :disabled="Boolean(activeRequest)" @click="cancelEdit">取消</uiButton>
            <uiButton size="small" variant="secondary" :loading="activeRequest === 'save'" :disabled="!canEdit || Boolean(activeRequest) || !isDirty" @click="saveDraft">提交</uiButton>
          </template>
          <uiButton v-if="!isEditing" size="small" :loading="activeRequest === 'confirm'" :disabled="!canConfirm || Boolean(activeRequest)" @click="confirmAndAdvance">确认分镜并进入视频生成</uiButton>
        </div>
      </div>

      <div class="draftTableViewport" role="region" aria-label="待确认分镜表格，可横向滚动" tabindex="0">
        <table class="draftTable">
          <caption class="srOnly">第 {{ props.episodeNumber }} 集分镜脚本</caption>
          <thead>
            <tr>
              <th scope="col" class="shotColumn">序号</th>
              <th scope="col" class="durationColumn">时长（秒）</th>
              <th scope="col" class="typeColumn">景别</th>
              <th scope="col" class="assetColumn">角色</th>
              <th scope="col" class="sceneColumn">场景</th>
              <th scope="col" class="assetColumn">道具</th>
              <th scope="col" class="textColumn">光影</th>
              <th scope="col" class="textColumn">音效</th>
              <th scope="col" class="textColumn">对白</th>
              <th scope="col" class="textColumn">旁白</th>
              <th scope="col" class="directionColumn">镜头控制</th>
            <th scope="col" class="promptColumn">画面描述</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in shotRows" :key="`${row.sceneIndex}-${row.shotIndex}`">
              <td class="shotIdentity">
                <strong>{{ String(rowIndex + 1).padStart(2, '0') }}</strong>
                <div v-if="isEditing" class="rowActions">
                  <uiIconButton size="small" :icon="IconPlus" :disabled="Boolean(activeRequest)" :label="`在镜头 ${rowIndex + 1} 后新增一行`" :title="`在镜头 ${rowIndex + 1} 后新增一行`" @click="addShot(row.sceneIndex, row.shotIndex)" />
                  <uiIconButton size="small" :icon="IconTrash" :disabled="Boolean(activeRequest) || storedDraft.draft.scenes[row.sceneIndex]!.shots.length <= 1" :label="`删除镜头 ${rowIndex + 1}`" :title="`删除镜头 ${rowIndex + 1}`" @click="removeShot(row.sceneIndex, row.shotIndex)" />
                </div>
              </td>
              <td>
                <uiNumberInput v-if="isEditing" :modelValue="durationSeconds(row.shot.durationMs)" :min="1" :max="120" :precision="2" :disabled="Boolean(activeRequest)" :aria-label="`镜头 ${rowIndex + 1} 时长（秒）`" @update:modelValue="value => setDuration(row.shot, value)" />
                <span v-else class="numericValue">{{ durationSeconds(row.shot.durationMs).toFixed(2) }}</span>
              </td>
              <td><uiSelect v-if="isEditing" :modelValue="row.shot.shotType" :options="shotTypeOptions(row.shot.shotType)" :disabled="Boolean(activeRequest)" aria-label="景别" @update:modelValue="value => row.shot.shotType = String(value || '')" /><span v-else>{{ displayValue(row.shot.shotType) }}</span></td>
              <td><uiSelect v-if="isEditing" :modelValue="row.shot.characterAssetNames" :options="characterOptions" multiple filterable :disabled="Boolean(activeRequest)" placeholder="选择角色" aria-label="角色" @update:modelValue="value => updateNames(row.shot.characterAssetNames, value)" /><span v-else>{{ displayNames(row.shot.characterAssetNames) }}</span></td>
              <td class="sceneCell">
                <uiSelect v-if="isEditing" :modelValue="row.sceneIndex" :options="sceneOptions" :disabled="Boolean(activeRequest) || storedDraft.draft.scenes[row.sceneIndex]!.shots.length <= 1" aria-label="场景" @update:modelValue="value => moveShot(row.sceneIndex, row.shotIndex, Number(value))" />
                <template v-if="row.shotIndex === 0">
                  <uiInput v-if="isEditing" v-model.trim="storedDraft.draft.scenes[row.sceneIndex]!.title" aria-label="场景标题" maxlength="200" :disabled="Boolean(activeRequest)" />
                  <span v-else class="sceneTitle">{{ storedDraft.draft.scenes[row.sceneIndex]?.title || '未命名场景' }}</span>
                  <uiTextarea v-if="isEditing" v-model.trim="storedDraft.draft.scenes[row.sceneIndex]!.continuityNotes" aria-label="场景连续性说明" :rows="1" resize="vertical" maxlength="5000" :disabled="Boolean(activeRequest)" />
                  <small v-else-if="storedDraft.draft.scenes[row.sceneIndex]?.continuityNotes" class="sceneNotes">{{ storedDraft.draft.scenes[row.sceneIndex]?.continuityNotes }}</small>
                </template>
                <span v-else>{{ storedDraft.draft.scenes[row.sceneIndex]?.title || '未命名场景' }}</span>
              </td>
              <td><uiSelect v-if="isEditing" :modelValue="row.shot.propAssetNames" :options="propOptions" multiple filterable :disabled="Boolean(activeRequest)" placeholder="选择道具" aria-label="道具" @update:modelValue="value => updateNames(row.shot.propAssetNames, value)" /><span v-else>{{ displayNames(row.shot.propAssetNames) }}</span></td>
              <td><uiTextarea v-if="isEditing" v-model.trim="row.shot.lighting" aria-label="光影" :rows="2" resize="vertical" maxlength="500" :disabled="Boolean(activeRequest)" /><span v-else>{{ displayValue(row.shot.lighting) }}</span></td>
              <td><uiTextarea v-if="isEditing" v-model.trim="row.shot.soundEffects" aria-label="音效" :rows="2" resize="vertical" maxlength="10000" :disabled="Boolean(activeRequest)" /><span v-else>{{ displayValue(row.shot.soundEffects) }}</span></td>
              <td><uiTextarea v-if="isEditing" v-model.trim="row.shot.dialogue" aria-label="对白" :rows="2" resize="vertical" maxlength="10000" :disabled="Boolean(activeRequest)" /><span v-else>{{ displayValue(row.shot.dialogue) }}</span></td>
              <td><uiTextarea v-if="isEditing" v-model.trim="row.shot.narration" aria-label="旁白" :rows="2" resize="vertical" maxlength="10000" :disabled="Boolean(activeRequest)" /><span v-else>{{ displayValue(row.shot.narration) }}</span></td>
              <td><uiTextarea v-if="isEditing" v-model.trim="row.shot.camera" aria-label="镜头控制" :rows="2" resize="vertical" maxlength="500" :disabled="Boolean(activeRequest)" /><span v-else>{{ displayValue(row.shot.camera) }}</span></td>
              <td><uiTextarea v-if="isEditing" v-model.trim="row.shot.prompt" aria-label="画面描述" :rows="3" resize="vertical" maxlength="20000" :disabled="Boolean(activeRequest)" /><span v-else>{{ displayValue(row.shot.prompt) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <uiButton v-if="isEditing" size="small" variant="secondary" :disabled="Boolean(activeRequest)" @click="addScene">添加场景</uiButton>
    </template>
    <footer class="generationDock" aria-label="AI 分镜生成">
      <div class="generationDockTitle"><strong>分镜脚本 AI 生成</strong><span>按消耗计费</span></div>
      <label class="draftModelControl">
        <span>文本模型</span>
        <uiSelect v-model="selectedModelValue" :options="modelOptions" :disabled="Boolean(activeRequest) || isEditing || !modelOptions.length" />
      </label>
      <div class="draftQuote" role="status" aria-live="polite">
        <span v-if="quoting">正在预估积分…</span>
        <span v-else-if="quoteError">积分预估失败</span>
        <span v-else-if="quoteCurrent">预计 {{ quoteCurrent.credits }} 积分</span>
        <span v-else>待预估</span>
        <button v-if="quoteError" type="button" :disabled="Boolean(activeRequest)" @click="quoteDraft">重试</button>
      </div>
      <uiButton v-if="!storedDraft || isStale" variant="secondary" :loading="activeRequest === 'generate'" :disabled="!canGenerate || !quoteCurrent || quoteSnapshot !== quoteKey || Boolean(activeRequest)" @click="generateDraft">
        {{ storedDraft ? '重新生成' : 'AI 生成分镜脚本' }}
      </uiButton>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import axios from "axios";
import { IconPlus, IconTrash } from "@tabler/icons-vue";
import { uiButton, uiIconButton, uiInput, uiNumberInput, uiSelect, uiTextarea, useUiFeedback, isUiCancelledError } from "@omnistudio-next/ui";
import { useAuthStore } from "@/stores/auth";
import { usePlatformModelsStore } from "@/stores/platformModels";
import { getModelSelectionLabel } from "@omnistudio-next/model-icons";

type StoryboardShot = { durationMs: number; shotType: string; camera: string; lighting: string; characterAssetNames: string[]; propAssetNames: string[]; soundEffects: string; dialogue: string; narration: string; prompt: string };
type StoryboardScene = { title: string; continuityNotes: string; shots: StoryboardShot[] };
type StoryboardDraft = { scenes: StoryboardScene[] };
type StoredDraft = { id: string; revision: number; sourceScriptRevision: number; teamVersion: string; skillVersion: string; providerId: string; modelId: string; status: string; draft: StoryboardDraft };
type ApiResponse<T> = { code: number; data: T; message: string };

const props = defineProps<{ projectId: string; episodeId: string; episodeNumber: number; episodeTitle: string; canEdit: boolean; canAdvance: boolean; locked: boolean; modelValue: string; characterOptions: { value: string; label: string }[]; propOptions: { value: string; label: string }[] }>();
const emit = defineEmits<{
  "update:modelValue": [value: string];
  draftChange: [hasDraft: boolean];
  editingChange: [isEditing: boolean];
  restoreEpisode: [episodeId: string];
  confirmedAndAdvance: [];
}>();
const auth = useAuthStore();
const platformModels = usePlatformModelsStore();
const feedback = useUiFeedback();
const selectedModelValue = computed({ get: () => props.modelValue, set: (value: string) => emit("update:modelValue", value) });
const storedDraft = ref<StoredDraft>();
const currentScriptRevision = ref(0);
const savedDraftSnapshot = ref("");
const loading = ref(false);
const activeRequest = ref<"generate" | "save" | "confirm" | "">("");
const errorMessage = ref("");
const quoting = ref(false);
const quoteError = ref("");
const quoteCurrent = ref<{ credits: string; textBudget?: { input: number; output: number } }>();
const quoteSnapshot = ref("");
const isEditing = ref(false);
const restoringEpisode = ref(false);
let loadSequence = 0;
let quoteSequence = 0;

const modelOptions = computed(() => platformModels.textModels.map(model => ({ value: JSON.stringify([model.providerId, model.modelId]), label: getModelSelectionLabel(model) })));
const shotRows = computed(() => storedDraft.value?.draft.scenes.flatMap((scene, sceneIndex) => scene.shots.map((shot, shotIndex) => ({ sceneIndex, shotIndex, shot }))) ?? []);
const sceneOptions = computed(() => storedDraft.value?.draft.scenes.map((scene, index) => ({ value: index, label: `${String(index + 1).padStart(2, "0")} · ${scene.title}` })) ?? []);
const selectedModel = computed(() => {
  try {
    const value = JSON.parse(selectedModelValue.value) as unknown;
    return Array.isArray(value) && typeof value[0] === "string" && typeof value[1] === "string" ? { providerId: value[0], modelId: value[1] } : undefined;
  } catch { return undefined; }
});
const isStale = computed(() => Boolean(storedDraft.value && storedDraft.value.sourceScriptRevision !== currentScriptRevision.value));
const isDirty = computed(() => Boolean(storedDraft.value && JSON.stringify(storedDraft.value.draft) !== savedDraftSnapshot.value));
const shotCount = computed(() => storedDraft.value?.draft.scenes.reduce((count, scene) => count + scene.shots.length, 0) ?? 0);
const canEdit = computed(() => Boolean(props.canEdit && !props.locked && storedDraft.value));
const canGenerate = computed(() => Boolean(props.canEdit && !props.locked && !loading.value && selectedModel.value && (!storedDraft.value || isStale.value) && !isEditing.value && !isDirty.value));
const canConfirm = computed(() => Boolean(canEdit.value && props.canAdvance && !isStale.value && !isDirty.value && storedDraft.value?.draft.scenes.length));
const quoteKey = computed(() => selectedModel.value ? JSON.stringify([props.projectId, props.episodeId, currentScriptRevision.value, selectedModel.value.providerId, selectedModel.value.modelId]) : "");

function updateNames(target: string[], value: unknown) {
  target.splice(0, target.length, ...(Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : []));
}

function shotTypeOptions(currentValue: string): { value: string; label: string }[] {
  const commonTypes = ["全景", "远景", "中景", "近景", "特写", "大特写"];
  const values = currentValue && !commonTypes.includes(currentValue) ? [...commonTypes, currentValue] : commonTypes;
  return [{ value: "", label: "请选择" }, ...values.map(value => ({ value, label: value }))];
}

function displayNames(names: string[]) {
  return names.length ? names.join("、") : "—";
}

function displayValue(value: string) {
  return value.trim() || "—";
}

function durationSeconds(durationMs: number) {
  return durationMs / 1000;
}

function setDuration(shot: StoryboardShot, value: string | number | undefined) {
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) shot.durationMs = Math.round(seconds * 1000);
}

function emptyShot(): StoryboardShot {
  return { durationMs: 5000, shotType: "", camera: "", lighting: "", characterAssetNames: [], propAssetNames: [], soundEffects: "", dialogue: "", narration: "", prompt: "" };
}

function emptyScene(): StoryboardScene {
  return { title: "", continuityNotes: "", shots: [emptyShot()] };
}

function markSaved(draft: StoredDraft) {
  storedDraft.value = draft;
  savedDraftSnapshot.value = JSON.stringify(draft.draft);
  emit("draftChange", draft.status === "pending");
}

function responseData<T>(response: ApiResponse<T>) {
  if (response.code !== 200) throw new Error(response.message || "请求失败");
  return response.data;
}

function errorText(error: unknown) {
  return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "连接中断，请刷新后重试" : error instanceof Error ? error.message : "操作失败，请重试";
}

async function loadDraft() {
  const episodeId = props.episodeId;
  const sequence = ++loadSequence;
  storedDraft.value = undefined;
  savedDraftSnapshot.value = "";
  currentScriptRevision.value = 0;
  errorMessage.value = "";
  isEditing.value = false;
  emit("draftChange", false);
  emit("editingChange", false);
  loading.value = true;
  try {
    const [draftResponse, scriptResponse] = await Promise.all([
      axios.get<ApiResponse<{ draft: StoredDraft | null }>>("/api/productionProjects/storyboard/getDraft", { params: { projectId: props.projectId, episodeId } }),
      axios.get<ApiResponse<{ revision: number }>>("/api/productionProjects/script/document", { params: { projectId: props.projectId } }),
    ]);
    if (sequence !== loadSequence) return;
    currentScriptRevision.value = responseData(scriptResponse.data).revision;
    const { draft } = responseData(draftResponse.data);
    if (draft?.status === "pending") markSaved(draft);
  } catch (error) {
    if (sequence === loadSequence) errorMessage.value = errorText(error);
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

async function quoteDraft() {
  const key = quoteKey.value;
  if (!key || !props.canEdit || props.locked) {
    quoteCurrent.value = undefined;
    quoteSnapshot.value = "";
    return;
  }
  const sequence = ++quoteSequence;
  quoting.value = true;
  quoteError.value = "";
  quoteCurrent.value = undefined;
  quoteSnapshot.value = "";
  try {
    const { data } = await axios.post<ApiResponse<{ credits: string; textBudget?: { input: number; output: number } }>>("/api/productionProjects/storyboard/quote", {
      projectId: props.projectId,
      episodeId: props.episodeId,
      providerId: selectedModel.value!.providerId,
      modelId: selectedModel.value!.modelId,
    });
    if (sequence !== quoteSequence || key !== quoteKey.value) return;
    quoteCurrent.value = responseData(data);
    quoteSnapshot.value = key;
  } catch (error) {
    if (sequence === quoteSequence) quoteError.value = errorText(error);
  } finally {
    if (sequence === quoteSequence) quoting.value = false;
  }
}

async function initialize() {
  await platformModels.load();
  const defaultModel = platformModels.defaultModels.text;
  if (!selectedModelValue.value && defaultModel) selectedModelValue.value = JSON.stringify([defaultModel.providerId, defaultModel.modelId]);
  if (!selectedModelValue.value && platformModels.textModels[0]) selectedModelValue.value = JSON.stringify([platformModels.textModels[0].providerId, platformModels.textModels[0].modelId]);
  await loadDraft();
}

async function generateDraft() {
  if (!canGenerate.value || !selectedModel.value || !quoteCurrent.value || quoteSnapshot.value !== quoteKey.value) return;
  const message = storedDraft.value
    ? `重新生成将替换第 ${props.episodeNumber} 集当前未确认的分镜。预计消耗 ${quoteCurrent.value.credits} 积分。`
    : `生成第 ${props.episodeNumber} 集分镜预计消耗 ${quoteCurrent.value.credits} 积分。`;
  try {
    await feedback.confirm(message, storedDraft.value ? "重新生成分镜" : "生成分镜", { confirmButtonText: "确认生成", cancelButtonText: "取消" });
  } catch (error) {
    if (!isUiCancelledError(error)) errorMessage.value = errorText(error);
    return;
  }
  activeRequest.value = "generate";
  errorMessage.value = "";
  try {
    const { data } = await axios.post<ApiResponse<{ draft: StoredDraft }>>("/api/productionProjects/storyboard/generateDraft", {
      projectId: props.projectId,
      episodeId: props.episodeId,
      directory: auth.personalDirectory,
      providerId: selectedModel.value.providerId,
      modelId: selectedModel.value.modelId,
    });
    markSaved(responseData(data).draft);
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    activeRequest.value = "";
  }
}

function beginEdit() {
  if (!canEdit.value) return;
  isEditing.value = true;
  emit("editingChange", true);
}

function cancelEdit() {
  if (!storedDraft.value) return;
  if (isDirty.value) storedDraft.value.draft = JSON.parse(savedDraftSnapshot.value) as StoryboardDraft;
  isEditing.value = false;
  emit("editingChange", false);
}

async function saveDraft() {
  if (!canEdit.value || !storedDraft.value || !isDirty.value || activeRequest.value) return;
  activeRequest.value = "save";
  errorMessage.value = "";
  try {
    const { data } = await axios.put<ApiResponse<{ draft: StoredDraft }>>("/api/productionProjects/storyboard/saveDraft", {
      projectId: props.projectId,
      episodeId: props.episodeId,
      expectedDraftRevision: storedDraft.value.revision,
      draft: storedDraft.value.draft,
    });
    markSaved(responseData(data).draft);
    isEditing.value = false;
    emit("editingChange", false);
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    activeRequest.value = "";
  }
}

async function confirmAndAdvance() {
  if (!canConfirm.value || !storedDraft.value || activeRequest.value) return;
  activeRequest.value = "confirm";
  errorMessage.value = "";
  try {
    const { data } = await axios.post<ApiResponse<{ created: { scenes: number; shots: number } }>>("/api/productionProjects/storyboard/confirmDraft", {
      projectId: props.projectId,
      episodeId: props.episodeId,
      expectedScriptRevision: storedDraft.value.sourceScriptRevision,
      expectedDraftRevision: storedDraft.value.revision,
      draft: storedDraft.value.draft,
    });
    const { created } = responseData(data);
    feedback.message({ tone: "success", message: `已确认 ${created.scenes} 个场景、${created.shots} 个镜头` });
    emit("confirmedAndAdvance");
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    activeRequest.value = "";
  }
}

function addScene() {
  const scenes = storedDraft.value?.draft.scenes;
  if (!scenes) return;
  scenes.push({ ...emptyScene(), title: `场景 ${String(scenes.length + 1).padStart(2, "0")}` });
}

function removeScene(index: number) {
  if (!storedDraft.value || storedDraft.value.draft.scenes.length <= 1) return;
  storedDraft.value.draft.scenes.splice(index, 1);
}

function addShot(sceneIndex: number, shotIndex: number) {
  const scene = storedDraft.value?.draft.scenes[sceneIndex];
  if (!scene) return;
  scene.shots.splice(shotIndex + 1, 0, emptyShot());
}

function removeShot(sceneIndex: number, shotIndex: number) {
  const scene = storedDraft.value?.draft.scenes[sceneIndex];
  if (!scene || scene.shots.length <= 1) return;
  scene.shots.splice(shotIndex, 1);
}

function moveShot(sceneIndex: number, shotIndex: number, targetSceneIndex: number) {
  const scenes = storedDraft.value?.draft.scenes;
  if (!scenes || sceneIndex === targetSceneIndex || !scenes[targetSceneIndex]) return;
  const [shot] = scenes[sceneIndex]!.shots.splice(shotIndex, 1);
  scenes[targetSceneIndex]!.shots.push(shot!);
}

defineExpose({ reload: loadDraft });

watch(selectedModelValue, () => { void quoteDraft(); });
watch(() => props.episodeId, async (episodeId, previousEpisodeId) => {
  if (restoringEpisode.value) {
    restoringEpisode.value = false;
    return;
  }
  if (previousEpisodeId && isEditing.value && isDirty.value) {
    try {
      await feedback.confirm("切换剧集将放弃本集尚未保存的修改。", "切换剧集", { confirmButtonText: "放弃修改", cancelButtonText: "继续编辑" });
    } catch (error) {
      if (isUiCancelledError(error)) {
        restoringEpisode.value = true;
        emit("restoreEpisode", previousEpisodeId);
        return;
      }
      errorMessage.value = errorText(error);
      return;
    }
  }
  if (episodeId) await loadDraft();
});
watch([() => props.projectId, currentScriptRevision, selectedModelValue], () => { void quoteDraft(); });
onMounted(() => { void initialize(); });
onBeforeUnmount(() => {
  emit("draftChange", false);
  emit("editingChange", false);
});
</script>

<style lang="scss" scoped>
.storyboardDraft {
  display: grid;
  gap: 10px;
  margin: 10px 0 14px;

  .draftReviewToolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
  .draftModelControl { display: grid; grid-template-columns: auto minmax(180px, 270px); align-items: center; gap: 8px; color: var(--uiTextMuted); font-size: 11px; }
  .draftQuote { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; color: var(--uiTextMuted); font-size: 11px; white-space: nowrap; button { padding: 0; border: 0; color: var(--uiActionPrimary); background: transparent; cursor: pointer; font: inherit; } }
  .draftError, .draftNotice, .draftStatus { margin: 0; padding: 8px 10px; border-radius: 5px; font-size: 11px; line-height: 1.5; }
  .draftError { color: var(--uiStatusError); background: color-mix(in srgb, var(--uiStatusError) 8%, transparent); }
  .draftNotice { color: var(--uiStatusWarning); background: color-mix(in srgb, var(--uiStatusWarning) 9%, transparent); }
  .draftStatus { color: var(--uiTextMuted); background: var(--uiBackgroundSubtle); }
  .draftEmpty { display: grid; gap: 4px; padding: 15px 4px; color: var(--uiTextMuted); font-size: 11px; strong { color: var(--uiTextBody); font-size: 12px; } }
  .draftReviewToolbar { justify-content: space-between; min-height: 36px; }
  .draftReviewTitle { display: grid; gap: 3px; min-width: 0; strong { overflow: hidden; color: var(--uiTextPrimary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; } span { color: var(--uiTextMuted); font-size: 10px; } }
  .draftReviewActions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }
  .draftTableViewport { max-width: 100%; max-height: min(58vh, 620px); overflow: auto; border: 1px solid var(--uiBorderDefault); border-radius: 6px; background: var(--uiSurfaceRaised); scrollbar-width: thin; &:focus-visible { outline: 2px solid var(--uiActionPrimary); outline-offset: 2px; } }
  .draftTable { width: max(100%, 1780px); table-layout: fixed; border-collapse: separate; border-spacing: 0; color: var(--uiTextBody); font-size: 11px; line-height: 1.5;
    th, td { padding: 8px; border-bottom: 1px solid var(--uiBorderDefault); vertical-align: top; }
    thead th { position: sticky; z-index: 1; top: 0; color: var(--uiTextMuted); background: var(--uiSurfaceRaised); text-align: left; white-space: nowrap; font-size: 10px; }
    tbody > tr:last-child td { border-bottom: 0; }
    td > span { display: block; min-height: 24px; overflow-wrap: anywhere; white-space: pre-wrap; }
    .shotColumn { width: 100px; }.durationColumn { width: 100px; }.typeColumn { width: 85px; }.assetColumn { width: 130px; }.sceneColumn { width: 150px; }.textColumn { width: 145px; }.directionColumn { width: 160px; }.promptColumn { width: 280px; }
    .shotIdentity { color: var(--uiTextPrimary); font-weight: 600; white-space: nowrap; strong { display: block; } }.rowActions { display: flex; justify-content: center; gap: 2px; margin-top: 5px; }.numericValue { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .sceneCell { display: grid; gap: 5px; }.sceneTitle { font-weight: 600; }.sceneNotes { display: -webkit-box; overflow: hidden; color: var(--uiTextMuted); font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
  }
  .generationDock { position: sticky; z-index: 3; bottom: 0; display: flex; align-items: center; gap: 12px; margin: 0 -12px -8px; padding: 10px 12px; border-top: 1px solid var(--uiBorderDefault); background: var(--uiSurfaceRaised); box-shadow: 0 -6px 16px color-mix(in srgb, #000 14%, transparent); }
  .generationDockTitle { display: grid; gap: 2px; min-width: 125px; strong { color: var(--uiTextPrimary); font-size: 12px; } span { color: var(--uiTextMuted); font-size: 10px; } }
  .draftModelControl { grid-template-columns: auto minmax(180px, 250px); }
  .draftQuote { flex: 1; }
  .srOnly { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
}

@media (max-width: 720px) {
  .storyboardDraft {
    .draftReviewToolbar { align-items: flex-start; }
    .draftReviewTitle { width: 100%; }
    .draftReviewActions { justify-content: flex-start; width: 100%; }
    .draftTableViewport { max-height: 54vh; }
    .generationDock { align-items: stretch; flex-wrap: wrap; gap: 8px; }
    .generationDockTitle { width: 100%; }
    .draftModelControl { grid-template-columns: minmax(0, 1fr); flex: 1 1 100%; width: 100%; }
    .draftQuote { min-width: 120px; }
  }
}
</style>

<template>
  <section class="productionVideoWorkspace" aria-label="视频生成工作区">
    <header class="workspaceToolbar">
      <div class="episodeControl">
        <label for="videoWorkspaceEpisode">当前剧集</label>
        <uiSelect
          id="videoWorkspaceEpisode"
          class="episodeSelect"
          :modelValue="activeEpisodeId"
          :options="episodeOptions"
          inline
          :disabled="!episodes.length"
          aria-label="当前剧集"
          @update:modelValue="value => typeof value === 'string' && setEpisode(value)"
        />
      </div>
      <div class="toolbarMeta">
        <span class="ratioBadge">项目画幅 {{ props.aspectRatio || "未设置" }}</span>
        <uiButton
          v-if="canDeliverCut"
          variant="secondary"
          size="small"
          :disabled="!currentVariants.length"
          @click="openEditor"
        >
          剪辑本集
        </uiButton>
      </div>
    </header>

    <div class="workspaceGrid">
      <aside class="assetRail" aria-label="本集主体资产">
        <div class="sectionHeading">
          <div>
            <span class="eyebrow">ASSETS</span>
            <h2>主体资产</h2>
          </div>
          <span class="itemCount">{{ currentAssets.length }}</span>
        </div>
        <div class="assetGroups">
          <section v-for="group in assetGroups" :key="group.type" class="assetGroup">
            <h3>
              {{ group.label }}
              <span>{{ group.items.length }}</span>
            </h3>
            <button
              v-for="asset in group.items"
              :key="asset.id"
              class="assetCard"
              type="button"
              :title="asset.referencePath ? `插入 @${asset.name}` : `插入文本引用 @${asset.name}`"
              @mousedown.prevent
              @click="insertAsset(asset)"
            >
              <span class="assetThumbnail">
                <img
                  v-if="assetPreviewUrls[asset.id]"
                  :src="assetPreviewUrls[asset.id]"
                  :alt="`${asset.name}参考图`"
                />
                <icon-photo-off v-else :size="24" aria-hidden="true" />
                <span class="assetCardTitle">{{ asset.name }}</span>
              </span>
              <icon-at
                v-if="asset.referencePath && isImageMime(asset.referenceMimeType) && supportsImageReferences"
                :size="16"
                class="assetMentionIcon"
                aria-hidden="true"
              />
            </button>
            <p v-if="!group.items.length" class="groupEmpty">本集暂无{{ group.label }}</p>
          </section>
        </div>
        <p v-if="!supportsImageReferences && selectedModel" class="capabilityNote">
          当前模型未公布图片参考能力
        </p>
      </aside>

      <div class="mainWorkspace">
        <div class="topWorkspace">
          <section class="composerPanel" aria-label="镜头生成设置">
            <div class="sectionHeading composerHeading">
              <div>
                <span class="eyebrow">PROMPT</span>
                <h2>生成描述</h2>
              </div>
              <div class="composerActions">
                <button
                  class="iconButton"
                  type="button"
                  title="提及本集资产"
                  aria-label="提及本集资产"
                  @mousedown.prevent
                  @click="insertAt"
                >
                  <icon-at :size="17" />
                </button>
                <button
                  class="iconButton"
                  type="button"
                  title="清空提示词"
                  aria-label="清空提示词"
                  @click="clearPrompt"
                >
                  <icon-x :size="17" />
                </button>
              </div>
            </div>

            <div class="promptComposerFrame">
              <div class="promptHeader">
                <div class="shotControl">
                  <uiSelect
                    :modelValue="selectedShotId"
                    :options="shotOptions"
                    aria-label="镜头"
                    size="small"
                    :disabled="!currentEpisodeShots.length"
                    @update:modelValue="value => typeof value === 'string' && setShot(value)"
                  />
                </div>
                <span class="mentionHint">输入 <b>@</b> 引用本集资产</span>
              </div>

              <div
                class="promptEditorShell"
                :class="{ isEmpty: !promptText }"
                @click="editor?.commands.focus()"
                @keydown.capture="handleMentionKeys"
              >
                <editor-content :editor="editor" />
                <span v-if="!promptText" class="promptPlaceholder">
                  描述镜头画面、动作、机位与情绪，输入 @ 可引用本集资产
                </span>
                <div v-if="mentionOpen" class="mentionMenu" role="listbox" aria-label="本集资产">
                  <button
                    v-for="(asset, index) in mentionOptions"
                    :key="asset.id"
                    class="mentionOption"
                    type="button"
                    role="option"
                    :aria-selected="mentionIndex === index"
                    :class="{ isActive: mentionIndex === index }"
                    @mousedown.prevent
                    @mouseenter="mentionIndex = index"
                    @click="chooseMention(asset)"
                  >
                    <img v-if="assetPreviewUrls[asset.id]" :src="assetPreviewUrls[asset.id]" alt="" />
                    <span v-else class="mentionFallback">
                      <icon-photo-off :size="16" aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{{ asset.name }}</strong>
                      <small>
                        {{ assetTypeLabel(asset.assetType) }}{{ asset.referencePath ? " · 可附参考图" : " · 仅文本设定" }}
                      </small>
                    </span>
                  </button>
                  <p v-if="!mentionOptions.length" class="mentionEmpty">没有匹配的本集资产</p>
                </div>
              </div>

              <p
                v-if="capabilityMessage || referenceGateMessage || referenceAssets.length > imageReferenceLimit"
                class="capabilityNote"
                role="status"
              >
                {{ capabilityMessage || referenceGateMessage || `当前模型最多支持 ${imageReferenceLimit} 张图片参考，请删除多余引用或切换模型` }}
              </p>
              <div class="promptToolbar">
                <div class="toolbarSettings">
                  <uiPopover
                    v-model:visible="modelVisible"
                    placement="top-start"
                    :width="360"
                    :disabled="!videoModels.length"
                    role="dialog"
                    aria-label="视频模型"
                  >
                    <template #reference="{ triggerAttrs }">
                      <button
                        type="button"
                        class="settingTrigger modelTrigger"
                        v-bind="triggerAttrs"
                        :disabled="!videoModels.length"
                        aria-label="选择视频模型"
                      >
                        <modelIcon v-if="selectedModel" :model="selectedModel.modelId" :provider="selectedModel.providerId" :size="20" class="modelMark" aria-hidden="true" />
                        <icon-movie v-else :size="18" class="modelMark" aria-hidden="true" />
                        <span>{{ selectedModel ? getModelSelectionLabel(selectedModel) : "选择模型" }}</span>
                        <icon-chevron-down :size="13" />
                      </button>
                    </template>
                    <div class="modelMenu">
                      <h3>视频模型</h3>
                      <button
                        v-for="model in videoModels"
                        :key="modelKey(model)"
                        type="button"
                        class="modelOption"
                        :class="{ isSelected: selectedModelKey === modelKey(model) }"
                        :aria-pressed="selectedModelKey === modelKey(model)"
                        @click="setModel(modelKey(model)); modelVisible = false"
                      >
                        <modelIcon :model="model.modelId" :provider="model.providerId" :size="22" class="modelMark" aria-hidden="true" />
                        <span class="modelOptionContent"><strong>{{ getModelSelectionLabel(model) }}</strong><span v-if="getMediaModelCapabilities(model)">{{ getMediaModelCapabilities(model) }}</span></span>
                        <icon-check
                          v-if="selectedModelKey === modelKey(model)"
                          :size="17"
                          class="selectedMark"
                        />
                      </button>
                    </div>
                  </uiPopover>
                  <span class="toolbarDivider" aria-hidden="true"></span>
                  <uiPopover
                    v-model:visible="parametersVisible"
                    placement="top-start"
                    :width="310"
                    role="dialog"
                    aria-label="视频生成参数"
                  >
                    <template #reference="{ triggerAttrs }">
                      <button
                        type="button"
                        class="settingTrigger parameterTrigger"
                        v-bind="triggerAttrs"
                        aria-label="设置视频参数"
                      >
                        <icon-clock :size="17" />
                        <span>{{ duration ? `${duration}s` : "时长" }}</span>
                        <span>{{ resolution || "分辨率" }}</span>
                        <span v-if="aspectRatio">{{ aspectRatio }}</span>
                        <icon-chevron-down :size="13" />
                      </button>
                    </template>
                    <div class="parameterMenu">
                      <section>
                        <h3>视频时长</h3>
                        <div class="parameterOptions durationOptions">
                          <button
                            v-for="value in durationOptions"
                            :key="value"
                            type="button"
                            :class="{ isSelected: duration === value }"
                            :aria-pressed="duration === value"
                            @click="duration = value"
                          >
                            {{ value }}s
                          </button>
                        </div>
                      </section>
                      <section>
                        <h3>分辨率</h3>
                        <div class="parameterOptions">
                          <button
                            v-for="value in resolutionOptions"
                            :key="value"
                            type="button"
                            :class="{ isSelected: resolution === value }"
                            :aria-pressed="resolution === value"
                            @click="resolution = value"
                          >
                            {{ value }}
                          </button>
                        </div>
                      </section>
                      <section v-if="aspectRatio">
                        <h3>项目画幅</h3>
                        <div class="projectRatio">{{ aspectRatio }}</div>
                      </section>
                      <label class="audioControl" :class="{ isDisabled: !audioCapability.available || audioCapability.required }">
                        <input v-model="generateAudio" type="checkbox" :disabled="!audioCapability.available || audioCapability.required" />
                        <span>同步生成音频</span>
                        <small v-if="audioCapability.required">模型要求</small>
                      </label>
                    </div>
                  </uiPopover>
                </div>
                <div class="toolbarActions">
                  <div class="quoteSummary" role="status" aria-live="polite" title="根据当前参数自动预估，实际费用以任务结算为准">
                    <icon-coins :size="17" />
                    <strong v-if="quoteIsCurrent">{{ formatCredits(quoteCredits) }}</strong>
                    <span v-if="quoteIsCurrent">积分</span>
                    <span v-else>{{ quoting ? "预估中…" : quoteError ? "预估失败" : "待完善参数" }}</span>
                    <button v-if="quoteError" type="button" class="quoteRetry" :disabled="quoting || !canQuote" @click="quoteGeneration">重试</button>
                  </div>
                  <button
                    v-if="canGenerate"
                    type="button"
                    class="generateButton"
                    :disabled="generating || !canSubmit"
                    :aria-label="generating ? '正在生成视频' : '生成视频片段'"
                    :title="quoteIsCurrent ? '生成视频片段' : '等待当前参数积分预估'"
                    @click="submitGeneration"
                  >
                    <icon-arrow-up :size="21" />
                  </button>
                </div>
              </div>
              <p v-if="quoteError" class="workspaceError" role="alert">{{ quoteError }}</p>
              <p v-if="errorMessage" class="workspaceError" role="alert">{{ errorMessage }}</p>
              <div class="submitRow">
                <span v-if="!currentEpisodeShots.length" class="submitHint">本集暂无镜头</span>
                <span v-else-if="!canGenerate" class="submitHint">当前账号或项目状态不允许生成</span>
                <span v-else-if="selectedShot && !isSelectedShotEligible" class="submitHint">
                  当前镜头{{ statusLabel(selectedShot.status) }}，不可再次生成
                </span>
                <span v-else-if="referenceGateMessage" class="submitHint">{{ referenceGateMessage }}</span>
                <span v-else-if="!quoteIsCurrent" class="submitHint">{{ quoting ? '正在自动预估当前参数积分' : quoteError ? '积分预估失败，请重试' : '完善参数后自动显示积分预估' }}</span>
              </div>
            </div>
          </section>
          <section class="previewPanel" aria-label="片段预览">
            <div class="sectionHeading previewHeading">
              <div>
                <span class="eyebrow">PREVIEW</span>
                <h2>片段预览</h2>
              </div>
              <span v-if="selectedVariant" class="previewStatus">
                {{ statusLabel(selectedVariant.status) }}
              </span>
            </div>
            <div class="videoStage">
              <video
                v-if="selectedVariant && variantUrl"
                :key="selectedVariant.id"
                :src="variantUrl"
                controls
                playsinline
                preload="metadata"
                :aria-label="`${shotLabel(selectedVariant.shotId)} 视频预览`"
              />
              <div v-else class="previewEmpty">
                <icon-movie :size="34" />
                <strong>{{ currentVariants.length ? "选择下方片段预览" : "等待生成片段" }}</strong>
              </div>
            </div>
            <div v-if="selectedVariant" class="previewMetadata">
              <strong>{{ shotLabel(selectedVariant.shotId) }} · 版本 {{ selectedVariant.attemptNumber }}</strong>
              <span>{{ selectedVariant.filePath.split("/").pop() }}</span>
            </div>
            <uiButton
              v-if="selectedVariant && canDeliverCut"
              class="editSelectedButton"
              variant="secondary"
              @click="$emit('editVariant', selectedVariant)"
            >
              <icon-scissors :size="16" />在剪辑台打开此片段
            </uiButton>
          </section>
        </div>
        <section class="candidatePanel" aria-label="本集生成片段">
          <div class="sectionHeading candidateHeading">
            <div>
              <span class="eyebrow">TAKES</span>
              <h2>生成片段</h2>
            </div>
            <span class="itemCount">{{ currentVariants.length }}</span>
          </div>
          <div ref="candidateScroller" class="candidateScroller">
            <button
              v-for="variant in currentVariants"
              :key="variant.id"
              :ref="element => bindCandidateCard(element, variant.id)"
              class="candidateCard"
              :class="{ isSelected: selectedVariantId === variant.id }"
              type="button"
              :aria-pressed="selectedVariantId === variant.id"
              @click="selectVariant(variant.id)"
            >
              <span class="candidateThumbnail">
                <img
                  v-if="variantThumbnails[variant.id]"
                  :src="variantThumbnails[variant.id]"
                  :alt="`${shotLabel(variant.shotId)} 版本 ${variant.attemptNumber} 缩略图`"
                />
                <span v-else class="thumbnailPlaceholder">
                  <icon-movie :size="20" />
                  <small>{{ variantThumbErrors[variant.id] || "读取视频帧…" }}</small>
                </span>
                <span class="playMark"><icon-player-play :size="15" /></span>
                <span v-if="variantDurations[variant.id]" class="candidateDuration">
                  {{ formatClipDuration(variantDurations[variant.id]) }}
                </span>
                <span class="candidateStatusTag" :class="candidateStatusClass(variant.status)">
                  {{ statusLabel(variant.status) }}
                </span>
              </span>
              <span class="candidateCaption">
                <strong>{{ shotLabel(variant.shotId) }}</strong>
                <small class="candidateVersion">V{{ String(variant.attemptNumber).padStart(2, "0") }}</small>
              </span>
            </button>
            <div v-if="!currentVariants.length" class="candidateEmpty">
              <icon-movie :size="22" />
              <span>本集生成的候选片段会显示在这里</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import axios from "axios";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Node, type Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/vue-3";
import { IconArrowUp, IconAt, IconCheck, IconChevronDown, IconClock, IconCoins, IconMovie, IconPlayerPlay, IconPhotoOff, IconScissors, IconX } from "@tabler/icons-vue";
import { getMediaModelCapabilities, getModelSelectionLabel, modelIcon } from "@omnistudio-next/model-icons";
import { uiButton, uiPopover, uiSelect } from "@omnistudio-next/ui";
import { usePlatformModelsStore } from "@/stores/platformModels";
import type { PlatformModel } from "@/lib/platformModels";
import { formatCredits } from "@/lib/creditFormat";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { createTimelineThumbnailGenerator } from "@/pages/videoEditor/editorThumbnails";

export type ProductionVideoAsset = {
  id: string;
  assetType: "character" | "scene" | "prop";
  name: string;
  description?: string | null;
  visualDescription?: string | null;
  episodeIds: string[];
  referencePath: string | null;
  referenceMimeType: string | null;
  referenceStatus: "none" | "generating" | "succeeded" | "failed";
};

export type ProductionVideoEpisode = { id: string; episodeNumber: number; title: string };
export type ProductionVideoScene = { id: string; episodeId: string; sceneNumber: number; title: string };
export type ProductionVideoShot = {
  id: string;
  sceneId: string;
  shotNumber: number;
  durationMs: number;
  prompt: string | null;
  status: string;
  shotType?: string | null;
  camera?: string | null;
  lighting?: string | null;
  dialogue?: string | null;
  narration?: string | null;
  soundEffects?: string | null;
  characterAssetIds?: string[];
  propAssetIds?: string[];
};
export type ProductionVideoVariant = { id: string; shotId: string; attemptNumber: number; filePath: string; mimeType: string; mediaType: string; status: string };

type VideoDurationResolution = { duration?: number[]; resolution?: string[] };
type VideoCapability = PlatformModel & {
  mode?: Array<string | string[]>;
  durationResolutionMap?: VideoDurationResolution[];
  audio?: boolean | "optional" | "required" | "none";
};
type ApiResponse<T> = { code: number; data: T; message: string };
const props = withDefaults(defineProps<{
  projectId: string;
  episodes: ProductionVideoEpisode[];
  scenes: ProductionVideoScene[];
  shots: ProductionVideoShot[];
  assets: ProductionVideoAsset[];
  variants: ProductionVideoVariant[];
  directory: string;
  activeEpisodeId: string;
  canGenerate: boolean;
  canDeliverCut: boolean;
  assetPreviewUrls: Record<string, string>;
  aspectRatio?: string;
}>(), { aspectRatio: "" });

const emit = defineEmits<{
  "update:activeEpisodeId": [episodeId: string];
  refreshed: [];
  editEpisode: [];
  editVariant: [variant: ProductionVideoVariant];
}>();

const platformModels = usePlatformModelsStore();
const thumbnailGenerator = createTimelineThumbnailGenerator();
const candidateScroller = ref<HTMLElement>();
const editor = useEditor({
  extensions: [StarterKit, Node.create({
    name: "productionAssetReference",
    inline: true,
    group: "inline",
    atom: true,
    selectable: false,
    addAttributes() { return { id: {}, name: {}, thumbnail: {} }; },
    parseHTML() { return [{ tag: "span[data-production-asset]" }]; },
    renderHTML({ node, HTMLAttributes }) {
      const children = [];
      if (node.attrs.thumbnail) children.push(["img", { src: node.attrs.thumbnail, alt: "", draggable: "false" }]);
      children.push(["span", {}, `@${node.attrs.name}`]);
      return ["span", { ...HTMLAttributes, "data-production-asset": node.attrs.id, class: "assetReference", contenteditable: "false" }, ...children];
    },
    renderText({ node }) { return `@${node.attrs.name}`; },
  })],
  content: "",
  editorProps: { attributes: { class: "promptEditor", role: "textbox", "aria-label": "镜头视频生成提示词", "aria-multiline": "true" } },
  onUpdate: ({ editor: currentEditor }) => {
    updateMentionQuery(currentEditor);
  },
  onSelectionUpdate: ({ editor: currentEditor }) => updateMentionQuery(currentEditor),
});

const selectedShotId = ref("");
const selectedModelKey = ref("");
const modelVisible = ref(false);
const parametersVisible = ref(false);
const duration = ref<number>();
const resolution = ref("");
const generateAudio = ref(false);
const mentionOpen = ref(false);
const mentionQuery = ref("");
const mentionIndex = ref(0);
const mentionRange = ref<{ from: number; to: number }>();
const quoteCredits = ref("");
const quoteSnapshot = ref("");
const quoteError = ref("");
const quoting = ref(false);
const generating = ref(false);
const errorMessage = ref("");
const variantUrl = ref("");
const selectedVariantId = ref("");
const variantThumbnails = ref<Record<string, string>>({});
const variantDurations = ref<Record<string, number>>({});
const variantThumbErrors = ref<Record<string, string>>({});
let variantRelease: (() => void) | undefined;
let previewSequence = 0;
let thumbnailObserver: IntersectionObserver | undefined;
let quoteSequence = 0;
let quoteTimer: ReturnType<typeof setTimeout> | undefined;
let quoteController: AbortController | undefined;
const candidateElements = new Map<string, Element>();
const thumbnailControllers = new Map<string, AbortController>();

const videoModels = computed(() => platformModels.mediaModels.filter(model => (model.mediaType ?? model.type) === "video") as VideoCapability[]);
const selectedModel = computed(() => videoModels.value.find(model => modelKey(model) === selectedModelKey.value));
const videoCapabilities = computed(() => selectedModel.value?.durationResolutionMap?.filter(item => Array.isArray(item.duration) && Array.isArray(item.resolution)) ?? []);
const durationOptions = computed(() => [...new Set(videoCapabilities.value.flatMap(item => item.duration ?? []).filter(value => Number.isFinite(value) && value > 0))].sort((a, b) => a - b));
const resolutionOptions = computed(() => [...new Set(videoCapabilities.value.filter(item => item.duration?.includes(duration.value ?? -1)).flatMap(item => item.resolution ?? []))]);
const referenceMode = computed(() => selectedModel.value?.mode?.find((mode): mode is string[] => Array.isArray(mode) && mode.some(value => /^imageReference:[1-9]\d{0,2}$/.test(value))));
const supportedScalarModes = computed(() => selectedModel.value?.mode?.filter((mode): mode is string => typeof mode === "string") ?? []);
const imageReferenceLimit = computed(() => {
  const value = referenceMode.value?.find(item => item.startsWith("imageReference:"));
  if (!value && supportedScalarModes.value.includes("singleImage")) return 1;
  const limit = value ? Number(value.split(":")[1]) : 0;
  return Number.isSafeInteger(limit) ? limit : 0;
});
const supportsImageReferences = computed(() => imageReferenceLimit.value > 0);
const requestMode = computed(() => {
  if (referenceAssets.value.length > 1) return referenceMode.value;
  if (referenceAssets.value.length === 1) return referenceMode.value ?? (supportedScalarModes.value.includes("singleImage") ? "singleImage" : undefined);
  return supportedScalarModes.value.includes("text") ? "text" : undefined;
});
const audioCapability = computed(() => {
  const value = selectedModel.value?.audio;
  return { available: value === true || value === "optional" || value === "required", required: value === true || value === "required" };
});
const capabilityMessage = computed(() => !selectedModel.value ? "请先配置平台视频模型" : !durationOptions.value.length || !resolutionOptions.value.length ? "该模型未公布可用时长与分辨率，无法准确报价" : !requestMode.value ? "该模型未公布当前输入方式的支持能力" : "");
const currentEpisodeScenes = computed(() => props.scenes.filter(scene => scene.episodeId === props.activeEpisodeId));
const currentEpisodeSceneIds = computed(() => new Set(currentEpisodeScenes.value.map(scene => scene.id)));
const sceneById = computed(() => new Map(currentEpisodeScenes.value.map(scene => [scene.id, scene])));
const currentEpisodeShots = computed(() => props.shots.filter(shot => currentEpisodeSceneIds.value.has(shot.sceneId)).sort((left, right) => (sceneById.value.get(left.sceneId)?.sceneNumber ?? 0) - (sceneById.value.get(right.sceneId)?.sceneNumber ?? 0) || left.shotNumber - right.shotNumber));
const episodeOptions = computed(() => props.episodes.map(episode => ({ value: episode.id, label: `第 ${episode.episodeNumber} 集 · ${episode.title}` })));
const shotOptions = computed(() => currentEpisodeShots.value.map(shot => ({ value: shot.id, label: `${shotLabel(shot.id)} · ${formatDuration(shot.durationMs / 1000)}` })));
const eligibleShots = computed(() => currentEpisodeShots.value.filter(shot => ["draft", "ready", "changesRequested"].includes(shot.status)));
const selectedShot = computed(() => currentEpisodeShots.value.find(shot => shot.id === selectedShotId.value));
const isSelectedShotEligible = computed(() => eligibleShots.value.some(shot => shot.id === selectedShotId.value));
const currentAssets = computed(() => props.assets.filter(asset => !asset.episodeIds.length || asset.episodeIds.includes(props.activeEpisodeId)));
const assetGroups = computed(() => ([
  { type: "character" as const, label: "角色", items: currentAssets.value.filter(asset => asset.assetType === "character") },
  { type: "scene" as const, label: "场景", items: currentAssets.value.filter(asset => asset.assetType === "scene") },
  { type: "prop" as const, label: "道具", items: currentAssets.value.filter(asset => asset.assetType === "prop") },
]));
const promptText = computed(() => editor.value?.getText({ blockSeparator: "\n" }).trim() ?? "");
const mentionedAssetIds = computed(() => {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const node = value as { type?: string; attrs?: { id?: string } };
    if (node.type === "productionAssetReference" && node.attrs?.id) ids.add(node.attrs.id);
    Object.values(value).forEach(visit);
  };
  visit(editor.value?.getJSON());
  return ids;
});
const requiredReferenceAssets = computed(() => {
  const ids = new Set([...(selectedShot.value?.characterAssetIds ?? []), ...(selectedShot.value?.propAssetIds ?? []), ...mentionedAssetIds.value]);
  return props.assets.filter(asset => ids.has(asset.id));
});
const missingReferenceAssets = computed(() => requiredReferenceAssets.value.filter(asset => asset.referenceStatus !== "succeeded" || !asset.referencePath || !isImageMime(asset.referenceMimeType)));
const missingReferenceAssetIds = computed(() => {
  const found = new Set(requiredReferenceAssets.value.map(asset => asset.id));
  return [...new Set([...(selectedShot.value?.characterAssetIds ?? []), ...(selectedShot.value?.propAssetIds ?? []), ...mentionedAssetIds.value])].filter(id => !found.has(id));
});
const referenceGateMessage = computed(() => {
  if (missingReferenceAssets.value.length) return `请先生成镜头关联参考图：${missingReferenceAssets.value.map(asset => asset.name).join("、")}`;
  if (missingReferenceAssetIds.value.length) return "镜头关联资产不存在，请先修复主体资产或分镜关联";
  return "";
});
const referenceAssets = computed(() => requiredReferenceAssets.value.filter(asset => asset.referenceStatus === "succeeded" && asset.referencePath && isImageMime(asset.referenceMimeType)));
const currentEpisodeShotOrder = computed(() => new Map(currentEpisodeShots.value.map((shot, index) => [shot.id, index])));
const currentVariants = computed(() => props.variants.filter(variant => variant.mediaType === "video" && variant.status !== "rejected" && currentEpisodeShotOrder.value.has(variant.shotId)).sort((left, right) => currentEpisodeShotOrder.value.get(left.shotId)! - currentEpisodeShotOrder.value.get(right.shotId)! || left.attemptNumber - right.attemptNumber));
const selectedVariant = computed(() => currentVariants.value.find(variant => variant.id === selectedVariantId.value));
const quoteKey = computed(() => JSON.stringify({ projectId: props.projectId, shotId: selectedShotId.value, directory: props.directory, providerId: selectedModel.value?.providerId, modelId: selectedModel.value?.modelId, duration: duration.value, resolution: resolution.value, ratio: props.aspectRatio, generateAudio: generateAudio.value, mode: requestMode.value, references: referenceAssets.value.map(asset => [asset.id, asset.referencePath, asset.referenceMimeType]), requiredReferences: requiredReferenceAssets.value.map(asset => [asset.id, asset.referenceStatus]), videoBillingKind: "textImageToVideo" }));
const quoteIsCurrent = computed(() => !!quoteCredits.value && quoteSnapshot.value === quoteKey.value);
const canQuote = computed(() => Boolean(selectedModel.value && duration.value && resolution.value));
const canSubmit = computed(() => Boolean(props.canGenerate && isSelectedShotEligible.value && selectedShot.value && selectedModel.value && promptText.value && duration.value && resolution.value && quoteIsCurrent.value && !capabilityMessage.value && !referenceGateMessage.value && (!referenceAssets.value.length || supportsImageReferences.value) && referenceAssets.value.length <= imageReferenceLimit.value));
const mentionOptions = computed(() => {
  const query = mentionQuery.value.trim().toLocaleLowerCase();
  return currentAssets.value.filter(asset => !query || `${asset.name} ${asset.description ?? ""}`.toLocaleLowerCase().includes(query));
});

watch(videoModels, models => {
  if (!models.some(model => modelKey(model) === selectedModelKey.value)) {
    const preferred = platformModels.defaultModels.video;
    const defaultModel = models.find(model => model.providerId === preferred?.providerId && model.modelId === preferred?.modelId) ?? models[0];
    selectedModelKey.value = defaultModel ? modelKey(defaultModel) : "";
  }
}, { immediate: true });
watch(selectedModel, (model, previousModel) => {
  const firstDuration = durationOptions.value[0];
  if (!durationOptions.value.includes(duration.value ?? -1)) duration.value = selectedShot.value && firstDuration ? durationOptions.value.reduce((nearest, value) => Math.abs(value - selectedShot.value!.durationMs / 1000) < Math.abs(nearest - selectedShot.value!.durationMs / 1000) ? value : nearest) : firstDuration;
  if (!resolutionOptions.value.includes(resolution.value)) resolution.value = resolutionOptions.value[0] ?? "";
  const audio = model?.audio;
  if (!model || audio !== "optional" || !previousModel || modelKey(model) !== modelKey(previousModel) || previousModel.audio !== audio) generateAudio.value = audio === true || audio === "required" || audio === "optional";
}, { immediate: true });
watch(duration, () => { if (!resolutionOptions.value.includes(resolution.value)) resolution.value = resolutionOptions.value[0] ?? ""; });
watch(currentEpisodeShots, shots => {
  if (!shots.some(shot => shot.id === selectedShotId.value)) selectedShotId.value = eligibleShots.value[0]?.id ?? shots[0]?.id ?? "";
}, { immediate: true });
watch([selectedShotId, () => props.activeEpisodeId, editor], () => {
  const shot = selectedShot.value;
  const prompt = shot ? [
    shot.prompt?.trim(),
    shot.shotType?.trim() ? `景别：${shot.shotType.trim()}` : "",
    shot.camera?.trim() ? `机位与运镜：${shot.camera.trim()}` : "",
    shot.lighting?.trim() ? `光影：${shot.lighting.trim()}` : "",
    shot.dialogue?.trim() ? `对白：${shot.dialogue.trim()}` : "",
    shot.narration?.trim() ? `旁白：${shot.narration.trim()}` : "",
    shot.soundEffects?.trim() ? `音效：${shot.soundEffects.trim()}` : "",
  ].filter(Boolean).join("\n") : "";
  editor.value?.commands.setContent({ type: "doc", content: prompt.split("\n").map(text => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) })) });
  if (shot && durationOptions.value.length) duration.value = durationOptions.value.reduce((nearest, value) => Math.abs(value - shot.durationMs / 1000) < Math.abs(nearest - shot.durationMs / 1000) ? value : nearest);
  errorMessage.value = "";
});
watch(currentVariants, variants => {
  if (!variants.some(variant => variant.id === selectedVariantId.value)) selectedVariantId.value = variants[0]?.id ?? "";
  void nextTick(observeCandidateCards);
}, { immediate: true });
watch([selectedVariant, () => props.directory], ([variant]) => { void loadVariantPreview(variant); }, { immediate: true });
watch(() => props.activeEpisodeId, () => {
  selectedVariantId.value = currentVariants.value[0]?.id ?? "";
});
watch([quoteKey, canQuote], () => {
  quoteSequence++;
  quoteController?.abort();
  if (quoteTimer) clearTimeout(quoteTimer);
  quoteTimer = undefined;
  quoteCredits.value = "";
  quoteSnapshot.value = "";
  quoteError.value = "";
  quoting.value = canQuote.value;
  if (canQuote.value) quoteTimer = setTimeout(() => { quoteTimer = undefined; void quoteGeneration(); }, 300);
}, { immediate: true });

onMounted(() => {
  if (!platformModels.mediaModels.length) void platformModels.load();
  thumbnailObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = (entry.target as HTMLElement).dataset.variantId;
      const variant = currentVariants.value.find(item => item.id === id);
      if (variant) void loadVariantThumbnail(variant);
    }
  }, { root: candidateScroller.value, rootMargin: "80px", threshold: 0.01 });
  observeCandidateCards();
});

onBeforeUnmount(() => {
  previewSequence++;
  quoteSequence++;
  quoteController?.abort();
  if (quoteTimer) clearTimeout(quoteTimer);
  variantRelease?.();
  thumbnailObserver?.disconnect();
  thumbnailGenerator.dispose();
  thumbnailControllers.forEach(controller => controller.abort());
  thumbnailControllers.clear();
});

function modelKey(model: VideoCapability) { return JSON.stringify([model.providerId, model.modelId]); }
function setEpisode(episodeId: string) { emit("update:activeEpisodeId", episodeId); }
function setShot(shotId: string) { selectedShotId.value = shotId; }
function assetTypeLabel(type: ProductionVideoAsset["assetType"]) { return type === "character" ? "角色" : type === "scene" ? "场景" : "道具"; }
function isImageMime(value?: string | null): value is string { return !!value && /^image\/[a-z0-9.+-]+$/i.test(value); }
function formatDuration(value: number) { return `${Number.isInteger(value) ? value : value.toFixed(1)} 秒`; }
function formatClipDuration(value: number) {
  if (!Number.isFinite(value) || value < 0) return "";
  const totalSeconds = Math.round(value);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
function statusLabel(status: string) {
  return ({ draft: "草稿", ready: "待生成", generating: "生成中", review: "待审片", changesRequested: "需重拍", approved: "已批准", candidate: "待审片", rejected: "已驳回" } as Record<string, string>)[status] ?? status;
}
function candidateStatusClass(status: string) {
  if (status === "approved") return "isApproved";
  if (status === "rejected" || status === "changesRequested") return "isRejected";
  if (status === "generating") return "isGenerating";
  return "isPending";
}
function shotLabel(shotId: string) {
  const shot = currentEpisodeShots.value.find(shot => shot.id === shotId);
  const scene = shot ? sceneById.value.get(shot.sceneId) : undefined;
  return `场${String(scene?.sceneNumber ?? "--").padStart(2, "0")} · 镜${String(shot?.shotNumber ?? "--").padStart(2, "0")}`;
}

function updateMentionQuery(currentEditor: Editor) {
  const selection = currentEditor.state.selection;
  if (!selection.empty || !selection.$from.parent.isTextblock) { mentionOpen.value = false; return; }
  const beforeCursor = selection.$from.parent.textBetween(0, selection.$from.parentOffset, "\n", "\uFFFC");
  const match = beforeCursor.match(/@([^\s@]*)$/u);
  if (!match) { mentionOpen.value = false; return; }
  mentionQuery.value = match[1] ?? "";
  mentionRange.value = { from: selection.from - mentionQuery.value.length - 1, to: selection.from };
  mentionIndex.value = 0;
  mentionOpen.value = true;
}

function insertAt() {
  editor.value?.chain().focus().insertContent("@").run();
}

function insertAsset(asset: ProductionVideoAsset) {
  editor.value?.chain().focus().insertContent({ type: "productionAssetReference", attrs: { id: asset.id, name: asset.name, thumbnail: props.assetPreviewUrls[asset.id] ?? "" } }).insertContent(" ").run();
  mentionOpen.value = false;
}

function chooseMention(asset: ProductionVideoAsset) {
  const range = mentionRange.value;
  if (!range) return insertAsset(asset);
  editor.value?.chain().focus().deleteRange(range).insertContent({ type: "productionAssetReference", attrs: { id: asset.id, name: asset.name, thumbnail: props.assetPreviewUrls[asset.id] ?? "" } }).insertContent(" ").run();
  mentionOpen.value = false;
}

function clearPrompt() {
  editor.value?.commands.clearContent();
  errorMessage.value = "";
}

function handleMentionKeys(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  if (!mentionOpen.value) return;
  if (event.key === "Escape") { event.preventDefault(); mentionOpen.value = false; return; }
  if (event.key === "ArrowDown" && mentionOptions.value.length) { event.preventDefault(); mentionIndex.value = (mentionIndex.value + 1) % mentionOptions.value.length; return; }
  if (event.key === "ArrowUp" && mentionOptions.value.length) { event.preventDefault(); mentionIndex.value = (mentionIndex.value + mentionOptions.value.length - 1) % mentionOptions.value.length; return; }
  if (event.key === "Enter" && mentionOptions.value.length) { event.preventDefault(); chooseMention(mentionOptions.value[mentionIndex.value]!); }
}

function setModel(value: string) { selectedModelKey.value = value; }

async function quoteGeneration() {
  if (!canQuote.value || !selectedModel.value || !duration.value || !resolution.value) return;
  const currentSequence = ++quoteSequence;
  const requestedKey = quoteKey.value;
  quoteController?.abort();
  const controller = new AbortController();
  quoteController = controller;
  quoting.value = true;
  quoteError.value = "";
  quoteSnapshot.value = "";
  quoteCredits.value = "";
  try {
    const { data } = await axios.post<ApiResponse<{ credits: string }>>("/api/billing/quote", {
      providerId: selectedModel.value.providerId,
      modelId: selectedModel.value.modelId,
      mediaType: "video",
      units: duration.value,
      size: resolution.value,
      videoBillingKind: "textImageToVideo",
    }, { signal: controller.signal });
    if (currentSequence !== quoteSequence || requestedKey !== quoteKey.value || !canQuote.value) return;
    if (data.code !== 200 || typeof data.data?.credits !== "string") throw new Error(data.message || "无法获取当前参数报价");
    quoteCredits.value = data.data.credits;
    quoteSnapshot.value = requestedKey;
  } catch (error) {
    if (!controller.signal.aborted && currentSequence === quoteSequence && requestedKey === quoteKey.value) quoteError.value = errorText(error);
  } finally {
    if (currentSequence === quoteSequence) quoting.value = false;
  }
}

async function submitGeneration() {
  const shot = selectedShot.value;
  const model = selectedModel.value;
  if (generating.value || !shot || !model || !canSubmit.value || !duration.value || !resolution.value || !quoteIsCurrent.value) return;
  generating.value = true;
  errorMessage.value = "";
  try {
    const prompt = [promptText.value, referenceAssets.value.length ? `参考图对应资产：\n${referenceAssets.value.map((asset, index) => `参考图${index + 1}：${assetTypeLabel(asset.assetType)}「${asset.name}」；${asset.visualDescription || asset.description || ""}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
    await axios.post("/api/productionProjects/shots/generate", {
      projectId: props.projectId,
      shotId: shot.id,
      directory: props.directory,
      mediaType: "video",
      providerId: model.providerId,
      modelId: model.modelId,
      prompt,
      images: referenceAssets.value.map(asset => ({ path: asset.referencePath!, mimeType: asset.referenceMimeType! })),
      ratio: props.aspectRatio || undefined,
      duration: duration.value,
      resolution: resolution.value,
      ...(audioCapability.value.available ? { generateAudio: generateAudio.value } : {}),
      ...(requestMode.value ? { mode: requestMode.value } : {}),
    }, { headers: { "Idempotency-Key": crypto.randomUUID() } });
    emit("refreshed");
  } catch (error) {
    errorMessage.value = errorText(error);
  } finally {
    generating.value = false;
  }
}

function openEditor() { emit("editEpisode"); }
function selectVariant(variantId: string) {
  const variant = currentVariants.value.find(variant => variant.id === variantId);
  if (!variant) return;
  selectedVariantId.value = variant.id;
  setShot(variant.shotId);
}

async function loadVariantPreview(variant?: ProductionVideoVariant) {
  const currentSequence = ++previewSequence;
  variantRelease?.();
  variantRelease = undefined;
  variantUrl.value = "";
  if (!variant || !props.directory) return;
  let release: (() => void) | undefined;
  try {
    const preview = useWorkspaceFiles(props.directory).acquireUrl(variant.filePath, variant.mimeType);
    release = preview.release;
    const url = await preview.url;
    if (currentSequence !== previewSequence) { preview.release(); return; }
    variantRelease = preview.release;
    variantUrl.value = url;
  } catch (error) {
    release?.();
    if (currentSequence === previewSequence) errorMessage.value = errorText(error);
  }
}

function bindCandidateCard(value: unknown, variantId: string) {
  const element = value instanceof Element ? value : null;
  const previous = candidateElements.get(variantId);
  if (previous && previous !== element) thumbnailObserver?.unobserve(previous);
  if (!element) { candidateElements.delete(variantId); return; }
  candidateElements.set(variantId, element);
  (element as HTMLElement).dataset.variantId = variantId;
  thumbnailObserver?.observe(element);
}

function observeCandidateCards() {
  thumbnailObserver?.disconnect();
  for (const [id, element] of candidateElements) {
    if (currentVariants.value.some(variant => variant.id === id)) thumbnailObserver?.observe(element);
  }
}

async function loadVariantThumbnail(variant: ProductionVideoVariant) {
  if (variantThumbnails.value[variant.id] || variantThumbErrors.value[variant.id] || thumbnailControllers.has(variant.id)) return;
  const controller = new AbortController();
  thumbnailControllers.set(variant.id, controller);
  let release: (() => void) | undefined;
  try {
    const preview = useWorkspaceFiles(props.directory).acquireUrl(variant.filePath, variant.mimeType);
    release = preview.release;
    const url = await preview.url;
    if (controller.signal.aborted) return;
    const frame = await thumbnailGenerator.getFrameInfo(url, 0, controller.signal);
    if (!controller.signal.aborted) {
      variantThumbnails.value[variant.id] = frame.imageUrl;
      if (Number.isFinite(frame.duration) && frame.duration > 0) variantDurations.value[variant.id] = frame.duration;
    }
  } catch {
    if (!controller.signal.aborted) variantThumbErrors.value[variant.id] = "缩略图不可用";
  } finally {
    release?.();
    thumbnailControllers.delete(variant.id);
  }
}

function errorText(error: unknown) {
  return axios.isAxiosError(error) && typeof error.response?.data?.message === "string" ? error.response.data.message : error instanceof Error ? error.message : "操作失败，请稍后重试";
}
</script>

<style scoped lang="scss">
.productionVideoWorkspace {
  --workbenchBg: var(--uiBackgroundCanvas);
  --workbenchPanel: var(--uiBackgroundSubtle);
  --workbenchRaised: var(--uiSurfaceRaised);
  --workbenchLine: var(--uiBorderDefault);
  --workbenchText: var(--uiTextPrimary);
  --workbenchMuted: var(--uiTextMuted);
  --workbenchAccent: var(--uiActionPrimary);
  --workbenchWarm: var(--uiStatusWarning);
  overflow: hidden;
  color: var(--workbenchText);
  border: 1px solid var(--workbenchLine);
  border-radius: 8px;
  background: var(--workbenchBg);

  .workspaceToolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 54px; padding: 8px 16px; border-bottom: 1px solid var(--workbenchLine); }
  .episodeControl, .toolbarMeta { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .episodeControl label { color: var(--workbenchMuted); font-size: 12px; }
  .iconButton:focus-visible, .assetCard:focus-visible, .candidateCard:focus-visible, .settingTrigger:focus-visible, .quoteRetry:focus-visible, .generateButton:focus-visible { outline: 2px solid var(--workbenchAccent); outline-offset: 2px; }
  .episodeControl {
    .episodeSelect { width: min(320px, 48vw); }
    :deep(.uiSelect) { min-height: 34px; border-radius: 5px; }
    :deep(.uiSelect input) { min-height: 32px; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  }
  .episodeControl, .shotControl {
    :deep(.popoverPanel) { padding: 5px; border-radius: 6px; }
    :deep(.selectOption) { min-height: 33px; padding: 7px 9px; border-radius: 4px; font-size: 12px; line-height: 1.5; }
    :deep(.selectOption.isSelected) { color: var(--workbenchAccent); }
    :deep(.selectOption.isActive:not(.isSelected)) { background: var(--uiSurfaceHover); }
  }
  .ratioBadge { padding: 6px 9px; color: var(--uiTextBody); border: 1px solid var(--workbenchLine); border-radius: 4px; font-size: 11px; white-space: nowrap; }
  .workspaceGrid { display: grid; grid-template-columns: minmax(240px, 270px) minmax(0, 1fr); min-height: 640px; }
  .assetRail, .mainWorkspace, .topWorkspace, .composerPanel, .previewPanel { min-width: 0; }
  .assetRail { max-height: 760px; padding: 17px 12px; overflow-y: auto; border-right: 1px solid var(--workbenchLine); }
  .sectionHeading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 40px; }
  .sectionHeading h2 { margin: 2px 0 0; color: var(--workbenchText); font-size: 14px; font-weight: 650; }
  .eyebrow { color: var(--uiTextMuted); font-size: 9px; font-weight: 700; letter-spacing: 1px; }
  .itemCount { display: inline-grid; min-width: 23px; height: 23px; place-items: center; color: var(--workbenchMuted); border: 1px solid var(--workbenchLine); border-radius: 12px; font-size: 11px; font-variant-numeric: tabular-nums; }
  .assetGroups { display: grid; gap: 19px; margin-top: 15px; }
  .assetGroup { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-content: start; gap: 8px; }
  .assetGroup h3, .groupEmpty { grid-column: 1 / -1; }
  .assetGroup h3 { display: flex; align-items: center; justify-content: space-between; margin: 0 2px 1px; color: var(--uiTextBody); font-size: 11px; font-weight: 650; }
  .assetGroup h3 span { color: var(--uiTextMuted); font-variant-numeric: tabular-nums; }
  .assetCard { position: relative; display: block; width: 100%; min-width: 0; padding: 0; overflow: hidden; color: inherit; text-align: left; border: 1px solid var(--uiBorderDefault); border-radius: 5px; background: var(--uiSurfaceRaised); cursor: pointer; }
  .assetCard:hover { border-color: var(--uiBorderFocus); }
  .assetThumbnail { position: relative; display: grid; width: 100%; aspect-ratio: 4 / 3; place-items: center; overflow: hidden; color: var(--uiTextBody); background: var(--uiBackgroundSubtle); }
  .assetThumbnail::after { position: absolute; inset: 35% 0 0; background: linear-gradient(transparent, #000b); content: ""; pointer-events: none; }
  .assetThumbnail > img { width: 100%; height: 100%; object-fit: cover; }
  .assetCardTitle { position: absolute; z-index: 1; right: 7px; bottom: 6px; left: 7px; overflow: hidden; color: white; font-size: 10px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
  .assetMentionIcon { position: absolute; z-index: 2; top: 5px; right: 5px; display: grid; width: 23px; height: 23px; place-items: center; color: white; border: 1px solid #ffffff66; border-radius: 4px; background: #111b; }
  .groupEmpty, .capabilityNote { margin: 7px 4px 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.5; }
  .capabilityNote { padding: 8px 9px; border-left: 2px solid var(--workbenchWarm); background: var(--uiStatusWarningSoft); }
  .mainWorkspace { display: grid; min-width: 0; grid-template-rows: minmax(0, 1fr) auto; }
  .topWorkspace { display: grid; min-height: 460px; grid-template-columns: minmax(360px, 1.05fr) minmax(320px, 0.95fr); border-bottom: 1px solid var(--workbenchLine); }
  .composerPanel { display: flex; flex-direction: column; padding: 16px; border-right: 1px solid var(--workbenchLine); }
  .composerHeading { flex: 0 0 auto; margin-bottom: 11px; }
  .composerActions { display: flex; gap: 5px; }
  .iconButton { display: grid; width: 31px; height: 31px; place-items: center; color: var(--uiTextBody); border: 1px solid var(--workbenchLine); border-radius: 5px; background: var(--uiBackgroundSubtle); cursor: pointer; }
  .iconButton:hover { color: var(--workbenchAccent); border-color: var(--uiBorderFocus); }
  .promptComposerFrame { display: flex; flex: 1; min-height: 350px; flex-direction: column; padding: 11px 12px 9px; border: 1px solid var(--uiBorderControl); border-radius: 7px; background: var(--uiBackgroundBase); }
  .promptHeader { display: flex; align-items: center; justify-content: space-between; gap: 9px; min-height: 35px; padding-bottom: 8px; border-bottom: 1px solid var(--uiBorderDefault); }
  .shotControl {
    width: 205px; min-width: 0; max-width: 100%;
    :deep(.uiSelect) { min-height: 29px; padding-right: 6px; padding-left: 7px; border-color: transparent; border-radius: 4px; background: transparent; }
    :deep(.uiSelect:hover) { border-color: var(--uiBorderControl); background: var(--uiSurfaceHover); }
    :deep(.uiSelect input) { min-height: 27px; font-size: 11px; text-overflow: ellipsis; }
    :deep(.selectOption) { font-size: 11px; }
  }
  .mentionHint { flex: 0 0 auto; color: var(--uiTextMuted); font-size: 10px; }
  .mentionHint b { color: var(--workbenchAccent); }
  .promptEditorShell { position: relative; flex: 1; min-height: 180px; max-height: 360px; padding: 11px 2px; overflow-y: auto; cursor: text; }
  .promptEditorShell:focus-within { outline: none; }
  .promptEditorShell :deep(.promptEditor) { min-height: 155px; outline: none; color: var(--uiTextPrimary); font-size: 13px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
  .promptEditorShell :deep(.promptEditor p) { margin: 0 0 7px; }
  .promptEditorShell :deep(.assetReference) { display: inline-flex; align-items: center; gap: 5px; margin: 0 2px; padding: 2px 6px 2px 3px; color: var(--uiTextPrimary); border: 1px solid color-mix(in srgb, var(--uiActionPrimary) 30%, var(--uiBorderDefault)); border-radius: 4px; background: var(--uiActionSoft); vertical-align: baseline; }
  .promptEditorShell :deep(.assetReference img) { width: 20px; height: 20px; border-radius: 2px; object-fit: cover; }
  .promptPlaceholder { position: absolute; top: 11px; left: 2px; max-width: calc(100% - 8px); color: var(--uiTextMuted); font-size: 12px; line-height: 1.65; pointer-events: none; }
  .mentionMenu { position: absolute; z-index: 4; top: 36px; left: 0; width: min(320px, 100%); max-height: 260px; padding: 5px; overflow-y: auto; border: 1px solid var(--uiBorderControl); border-radius: 6px; background: var(--uiSurfaceRaised); box-shadow: 0 12px 32px #0008; }
  .mentionOption { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 46px; padding: 5px 7px; color: inherit; text-align: left; border: 0; border-radius: 4px; background: transparent; cursor: pointer; }
  .mentionOption:hover, .mentionOption.isActive { background: var(--uiSurfaceHover); }
  .mentionOption img, .mentionFallback { display: grid; flex: 0 0 34px; width: 34px; height: 34px; place-items: center; overflow: hidden; color: var(--uiTextBody); border: 1px solid var(--uiBorderDefault); border-radius: 3px; object-fit: cover; }
  .mentionOption > span:last-child { display: grid; gap: 3px; min-width: 0; }
  .mentionOption strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
  .mentionOption small, .mentionEmpty { color: var(--uiTextMuted); font-size: 10px; }
  .mentionEmpty { padding: 8px; }
  .promptToolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 42px; padding-top: 8px; border-top: 1px solid var(--uiBorderDefault); }
  .toolbarSettings, .toolbarActions { display: flex; align-items: center; min-width: 0; gap: 7px; }
  .toolbarSettings { flex: 1; }
  .settingTrigger { display: inline-flex; align-items: center; min-width: 0; min-height: 31px; gap: 6px; padding: 0 7px; color: var(--uiTextBody); border: 0; border-radius: 4px; background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
  .settingTrigger:hover, .settingTrigger[aria-expanded="true"] { color: var(--workbenchAccent); background: var(--uiSurfaceHover); }
  .settingTrigger > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .modelTrigger { max-width: 190px; }
  .modelTrigger .modelMark { flex: 0 0 auto; color: var(--workbenchAccent); }
  .parameterTrigger { max-width: 100%; }
  .toolbarDivider { width: 1px; height: 19px; flex: 0 0 auto; background: var(--workbenchLine); }
  .quoteSummary { display: inline-flex; align-items: center; min-height: 31px; gap: 5px; padding: 0 8px; color: var(--uiTextMuted); border: 1px solid var(--uiBorderDefault); border-radius: 5px; background: var(--uiBackgroundSubtle); font-size: 10px; white-space: nowrap;
    strong { color: var(--workbenchAccent); font-size: 12px; font-variant-numeric: tabular-nums; }
    .quoteRetry { padding: 2px 4px; color: var(--workbenchAccent); border: 0; border-radius: 3px; background: transparent; font: inherit; cursor: pointer; &:hover:not(:disabled) { background: var(--uiSurfaceHover); } &:disabled { cursor: not-allowed; opacity: 0.5; } }
  }
  .generateButton { display: grid; width: 33px; height: 33px; flex: 0 0 auto; place-items: center; color: var(--uiTextOnAccent); border: 0; border-radius: 50%; background: var(--workbenchAccent); cursor: pointer; }
  .generateButton:hover:not(:disabled) { filter: brightness(1.08); }
  .generateButton:disabled { cursor: not-allowed; opacity: 0.42; }
  .workspaceError { margin: 9px 0 0; color: var(--uiStatusError); font-size: 11px; }
  .submitRow { display: flex; align-items: center; min-height: 22px; margin-top: 4px; }
  .submitHint { color: var(--uiTextMuted); font-size: 10px; }
  .previewPanel { display: flex; min-height: 0; flex-direction: column; padding: 16px; }
  .previewHeading { flex: 0 0 auto; margin-bottom: 10px; }
  .previewStatus { padding: 4px 7px; color: var(--uiTextBody); border: 1px solid var(--uiBorderDefault); border-radius: 3px; font-size: 10px; }
  .videoStage { display: grid; flex: 1; min-height: 260px; max-height: 470px; place-items: center; overflow: hidden; border: 1px solid var(--uiBorderDefault); border-radius: 5px; background: var(--uiBackgroundBase); }
  .videoStage video { display: block; width: 100%; max-height: 470px; aspect-ratio: 16 / 9; object-fit: contain; background: var(--uiBackgroundBase); }
  .previewEmpty { display: grid; justify-items: center; gap: 10px; color: var(--uiTextMuted); }
  .previewEmpty strong { color: var(--uiTextBody); font-size: 12px; font-weight: 500; }
  .previewMetadata { display: grid; gap: 5px; padding: 11px 2px 3px; }
  .previewMetadata strong { color: var(--uiTextPrimary); font-size: 11px; font-weight: 550; }
  .previewMetadata span { overflow: hidden; color: var(--uiTextMuted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .editSelectedButton { align-self: flex-start; margin-top: 10px; }
  .candidatePanel { min-width: 0; min-height: 178px; padding: 13px 16px 10px; }
  .candidateHeading { margin-bottom: 8px; }
  .candidateScroller { display: flex; gap: 9px; min-height: 115px; padding: 1px 1px 8px; overflow-x: auto; overscroll-behavior-inline: contain; scrollbar-color: var(--uiBorderControl) transparent; }
  .candidateCard { flex: 0 0 146px; width: 146px; padding: 0; overflow: hidden; color: inherit; text-align: left; border: 1px solid var(--uiBorderDefault); border-radius: 5px; background: var(--uiBackgroundSubtle); cursor: pointer; }
  .candidateCard.isSelected { border-color: var(--workbenchAccent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--uiActionPrimary) 28%, transparent); }
  .candidateThumbnail { position: relative; display: block; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; background: var(--uiBackgroundBase); }
  .candidateThumbnail > img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .thumbnailPlaceholder { display: grid; width: 100%; height: 100%; place-content: center; justify-items: center; gap: 5px; color: var(--uiTextMuted); }
  .thumbnailPlaceholder small { font-size: 9px; }
  .playMark { position: absolute; right: 6px; bottom: 6px; display: grid; width: 24px; height: 24px; place-items: center; color: white; border: 1px solid #ffffff4a; border-radius: 50%; background: #111a; opacity: 0.84; }
  .candidateDuration { position: absolute; bottom: 6px; left: 6px; padding: 2px 5px; color: #fff; border-radius: 3px; background: #111c; font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1.3; }
  .candidateCaption { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 5px 6px; padding: 7px 8px; }
  .candidateCaption strong { min-width: 0; overflow: hidden; font-size: 10px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; }
  .candidateStatusTag { position: absolute; top: 5px; right: 5px; display: inline-flex; align-items: center; justify-content: center; min-height: 19px; padding: 1px 6px; color: #e5c78f; border: 1px solid #655431; border-radius: 4px; background: #332b1deb; font-size: 9px; line-height: 1.25; white-space: nowrap; }
  .candidateStatusTag.isApproved { color: #a8d99e; border-color: #3d5940; background: #253127; }
  .candidateStatusTag.isRejected { color: #ed9d91; border-color: #653d39; background: #352321; }
  .candidateStatusTag.isGenerating { color: #a8c8e8; border-color: #3a536a; background: #202e3b; }
  .candidateVersion { justify-self: end; color: var(--uiTextMuted); font-size: 9px; font-variant-numeric: tabular-nums; }
  .candidateEmpty { display: grid; flex: 1; min-height: 100px; place-content: center; justify-items: center; gap: 7px; color: var(--uiTextMuted); font-size: 10px; }
}

.modelMenu, .parameterMenu { color: var(--uiTextPrimary); }
.modelMenu h3, .parameterMenu h3 { margin: 0 0 9px; color: var(--uiTextPrimary); font-size: 12px; font-weight: 650; }
.modelMenu { display: grid; gap: 5px; }
.modelOption { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 9px 8px; color: inherit; text-align: left; border: 1px solid transparent; border-radius: 5px; background: transparent; cursor: pointer; }
.modelOption:hover { background: var(--uiSurfaceHover); }
.modelOption.isSelected { border-color: color-mix(in srgb, var(--uiActionPrimary) 40%, var(--uiBorderDefault)); background: var(--uiActionSoft); }
.modelOption .modelMark { flex: 0 0 auto; color: var(--uiActionPrimary); }
.modelOption .modelOptionContent { display: grid; flex: 1; min-width: 0; gap: 4px; }
.modelOption strong { min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.modelOptionContent > span { color: var(--uiTextMuted); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.selectedMark { flex: 0 0 auto; color: var(--uiActionPrimary); }
.parameterMenu { display: grid; gap: 15px; }
.parameterMenu section { display: grid; gap: 7px; }
.parameterMenu h3 { margin: 0; }
.parameterOptions { display: flex; flex-wrap: wrap; gap: 6px; }
.parameterOptions button, .projectRatio { display: inline-grid; min-width: 54px; min-height: 31px; padding: 0 9px; place-items: center; color: var(--uiTextBody); border: 1px solid var(--uiBorderControl); border-radius: 4px; background: var(--uiBackgroundSubtle); font: inherit; font-size: 11px; cursor: pointer; }
.parameterOptions button:hover { border-color: var(--uiBorderFocus); }
.parameterOptions button.isSelected { color: var(--uiActionPrimary); border-color: var(--uiActionPrimary); background: var(--uiActionSoft); }
.projectRatio { justify-self: start; color: var(--uiTextMuted); border-style: dashed; cursor: default; }
.audioControl { display: flex; align-items: center; gap: 7px; min-height: 35px; color: var(--uiTextBody); font-size: 11px; }
.audioControl input { width: 15px; height: 15px; accent-color: var(--uiActionPrimary); }
.audioControl small { margin-left: auto; color: var(--uiTextMuted); font-size: 9px; }
.audioControl.isDisabled { color: var(--uiStateDisabledText); cursor: not-allowed; input { cursor: not-allowed; } }

@media (max-width: 1120px) {
  .productionVideoWorkspace {
    .workspaceGrid { grid-template-columns: minmax(205px, 235px) minmax(0, 1fr); }
    .topWorkspace { min-height: 0; grid-template-columns: minmax(0, 1fr); }
    .composerPanel { min-height: 450px; border-right: 0; border-bottom: 1px solid var(--workbenchLine); }
    .previewPanel { min-height: 390px; }
    .videoStage { min-height: 240px; }
  }
}

@media (max-width: 760px) {
  .productionVideoWorkspace {
    .workspaceToolbar { align-items: flex-start; flex-direction: column; gap: 8px; padding: 10px 12px; }
    .episodeControl { width: 100%; }
    .episodeControl .episodeSelect { width: auto; flex: 1; }
    .toolbarMeta { width: 100%; justify-content: space-between; }
    .workspaceGrid { display: flex; flex-direction: column; }
    .assetRail { max-height: 260px; padding: 12px; border-right: 0; border-bottom: 1px solid var(--workbenchLine); }
    .assetGroups { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .assetGroup { gap: 6px; }
    .assetGroup h3 { font-size: 10px; }
    .assetGroup h3 span { font-size: 9px; }
    .groupEmpty { font-size: 9px; }
    .assetMentionIcon { top: 3px; right: 3px; width: 20px; height: 20px; }
    .topWorkspace { display: flex; flex-direction: column; }
    .composerPanel { min-height: 430px; padding: 13px 12px; }
    .promptComposerFrame { min-height: 335px; padding-right: 9px; padding-left: 9px; }
    .promptToolbar { align-items: flex-start; flex-direction: column; }
    .toolbarSettings, .toolbarActions { width: 100%; }
    .toolbarSettings { justify-content: flex-start; }
    .toolbarActions { justify-content: flex-end; }
    .modelTrigger { max-width: min(190px, 45vw); }
    .parameterTrigger { overflow: hidden; }
    .previewPanel { min-height: 330px; padding: 13px 12px; border-top: 1px solid var(--workbenchLine); }
    .videoStage { min-height: 190px; }
    .candidatePanel { padding-right: 12px; padding-left: 12px; }
    .candidateEmpty { min-width: 100%; }
  }
}

@media (max-width: 420px) {
  .productionVideoWorkspace {
    .assetGroups { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .assetRail { max-height: 320px; }
    .promptHeader { align-items: flex-start; flex-direction: column; padding-bottom: 7px; }
    .mentionHint { align-self: flex-end; }
    .settingTrigger { gap: 4px; padding-right: 4px; padding-left: 4px; font-size: 10px; }
    .toolbarDivider { margin: 0 1px; }
    .quoteSummary { padding: 0 6px; }
  }
}
</style>

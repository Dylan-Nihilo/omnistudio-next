<template>
  <div class="storyboardTableViewport" role="region" aria-label="分镜脚本表格，可横向滚动" tabindex="0">
    <table class="storyboardTable">
      <caption class="srOnly">剧集分镜脚本</caption>
      <thead>
        <tr>
          <th scope="col" class="centerColumn shotColumn">镜头</th>
          <th scope="col" class="centerColumn durationColumn">时长（秒）</th>
          <th scope="col" class="centerColumn typeColumn">景别</th>
          <th scope="col" class="centerColumn assetColumn">角色</th>
          <th scope="col" class="centerColumn sceneColumn">场景</th>
          <th scope="col" class="centerColumn assetColumn">道具</th>
          <th scope="col" class="centerColumn lightingColumn">光影</th>
          <th scope="col" class="textColumn">音效</th>
          <th scope="col" class="textColumn">对白</th>
          <th scope="col" class="textColumn">旁白</th>
          <th scope="col" class="centerColumn directionColumn">镜头控制</th>
          <th scope="col" class="promptColumn">画面描述</th>
          <th scope="col" class="centerColumn statusColumn">状态</th>
          <th scope="col" class="centerColumn actionColumn">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="shot in shots" :key="shot.id">
          <td class="centerColumn shotIdentity">
            <strong>{{ shotIdentifier(shot) }}</strong>
            <small>{{ sceneTitle(shot.sceneId) }}</small>
          </td>
          <td class="centerColumn durationValue">{{ formatDuration(shot.durationMs) }}</td>
          <td class="centerColumn">{{ shot.shotType || missingValue }}</td>
          <td class="centerColumn assetNames">{{ assetNames(shot.characterAssetIds, 'character') }}</td>
          <td class="centerColumn sceneName">{{ sceneTitle(shot.sceneId) }}</td>
          <td class="centerColumn assetNames">{{ assetNames(shot.propAssetIds, 'prop') }}</td>
          <td class="centerColumn longText">{{ shot.lighting || missingValue }}</td>
          <td class="longText">{{ shot.soundEffects || missingValue }}</td>
          <td class="longText">{{ shot.dialogue || missingValue }}</td>
          <td class="longText">{{ shot.narration || missingValue }}</td>
          <td class="centerColumn longText">{{ shot.camera || missingValue }}</td>
          <td class="longText">
            <div class="promptCell">
              <div class="promptText">{{ isPromptExpanded(shot.id) ? shot.prompt : promptPreview(shot.prompt) }}</div>
              <button
                v-if="shouldCollapsePrompt(shot.prompt)"
                class="promptToggle"
                type="button"
                :aria-expanded="isPromptExpanded(shot.id)"
                @click.stop="togglePrompt(shot.id)"
              >
                {{ isPromptExpanded(shot.id) ? "收起" : "展开" }}
              </button>
            </div>
          </td>
          <td class="centerColumn">
            <span class="statusBadge" :class="`status${shot.status}`">{{ statusLabel(shot.status) }}</span>
          </td>
          <td class="centerColumn">
            <uiButton v-if="canEdit" size="small" variant="secondary" :disabled="busy" :aria-label="`编辑 ${shotIdentifier(shot)} 分镜`" @click="emit('edit', shot.id)">编辑</uiButton>
            <span v-else class="missingValue">{{ missingValue }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { uiButton } from "@omnistudio-next/ui";

type ShotStatus = "draft" | "ready" | "generating" | "review" | "changesRequested" | "approved";
type StoryboardShot = {
  id: string;
  sceneId: string;
  shotNumber: number;
  durationMs: number;
  shotType: string | null;
  camera: string | null;
  lighting: string | null;
  dialogue: string | null;
  narration: string | null;
  prompt: string | null;
  status: ShotStatus;
  characterAssetIds?: string[] | null;
  propAssetIds?: string[] | null;
  soundEffects?: string | null;
};
type StoryboardScene = { id: string; title: string; sceneNumber?: number };
type StoryboardAsset = { id: string; name: string; assetType: "character" | "scene" | "prop" };

const props = defineProps<{
  shots: StoryboardShot[];
  scenes: StoryboardScene[];
  assets: StoryboardAsset[];
  canEdit: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{ edit: [shotId: string] }>();

const missingValue = "—";
const expandedPromptIds = ref(new Set<string>());
const scenesById = computed(() => new Map(props.scenes.map(scene => [scene.id, scene])));
const assetsById = computed(() => new Map(props.assets.map(asset => [asset.id, asset])));
const statusLabels: Record<ShotStatus, string> = {
  draft: "草稿",
  ready: "待生成",
  generating: "生成中",
  review: "待审片",
  changesRequested: "需重拍",
  approved: "已批准",
};

function sceneTitle(sceneId: string) {
  return scenesById.value.get(sceneId)?.title || missingValue;
}

function shotIdentifier(shot: StoryboardShot) {
  const scene = scenesById.value.get(shot.sceneId);
  const sceneNumber = scene?.sceneNumber;
  const sceneLabel = typeof sceneNumber === "number" && Number.isFinite(sceneNumber)
    ? String(sceneNumber).padStart(2, "0")
    : scene?.title || missingValue;
  return `场 ${sceneLabel} · 镜 ${String(shot.shotNumber).padStart(2, "0")}`;
}

function formatDuration(durationMs: number) {
  return Number.isFinite(durationMs) && durationMs > 0 ? (durationMs / 1000).toFixed(2) : missingValue;
}

function assetNames(assetIds: string[] | null | undefined, assetType: "character" | "prop") {
  if (!assetIds?.length) return missingValue;
  const names = assetIds.flatMap(id => {
    const asset = assetsById.value.get(id);
    return asset?.assetType === assetType && asset.name.trim() ? [asset.name] : [];
  });
  return names.length ? names.join("、") : missingValue;
}

function statusLabel(status: ShotStatus) {
  return statusLabels[status] ?? status;
}

function isPromptExpanded(shotId: string) {
  return expandedPromptIds.value.has(shotId);
}

function shouldCollapsePrompt(prompt: string | null) {
  return typeof prompt === "string" && prompt.length > 80;
}

function promptPreview(prompt: string | null) {
  if (!prompt) return missingValue;
  return shouldCollapsePrompt(prompt) ? `${prompt.slice(0, 80).replace(/\s+/gu, " ")}…` : prompt;
}

function togglePrompt(shotId: string) {
  const expanded = new Set(expandedPromptIds.value);
  if (expanded.has(shotId)) expanded.delete(shotId);
  else expanded.add(shotId);
  expandedPromptIds.value = expanded;
}
</script>

<style scoped lang="scss">
.storyboardTableViewport {
  max-width: 100%;
  max-height: min(72vh, 780px);
  overflow: auto;
  border: 1px solid var(--uiBorderDefault, #3b3b3b);
  border-radius: 8px;
  background: var(--uiSurfaceRaised, #202020);
  scrollbar-color: #6d574b #1b1b1b;
  scrollbar-width: thin;
  &:focus-visible { outline: 2px solid var(--uiActionPrimary, #ff6637); outline-offset: 2px; }
  .storyboardTable {
    width: max(100%, 2500px);
    table-layout: fixed;
    border-collapse: separate;
    border-spacing: 0;
    color: var(--uiTextBody, #e6e2df);
    font-size: 12px;
    line-height: 1.55;

    th, td { padding: 12px 10px; border-bottom: 1px solid var(--uiBorderDefault, #353535); }
    th {
      position: sticky;
      z-index: 1;
      top: 0;
      color: var(--uiTextMuted, #aaa29d);
      background: #292521;
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    td { vertical-align: top; background: #201e1c; }
    tbody tr:nth-child(even) td { background: #242220; }
    tbody tr:hover td { background: color-mix(in srgb, var(--uiActionPrimary, #ff6637) 7%, #242220); }
    tbody tr:last-child td { border-bottom: 0; }
    .centerColumn { text-align: center; vertical-align: middle; }
    .shotColumn { width: 150px; }
    .durationColumn { width: 90px; }
    .typeColumn { width: 120px; }
    .assetColumn { width: 180px; }
    .sceneColumn { width: 190px; }
    .lightingColumn { width: 190px; }
    .textColumn { width: 190px; }
    .directionColumn { width: 220px; }
    .promptColumn { width: 360px; }
    .statusColumn { width: 110px; }
    .actionColumn { width: 90px; }
    .longText, .promptText, .assetNames, .sceneName { overflow-wrap: anywhere; white-space: pre-wrap; }
    .promptCell { display: grid; gap: 5px; }
    .promptText { color: var(--uiTextPrimary, #f4f0ed); }
    .promptToggle { justify-self: end; padding: 0; color: var(--uiActionPrimary, #ff6637); border: 0; background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
    .promptToggle:hover { text-decoration: underline; }
    .assetNames { color: #e6b08e; }
    .sceneName { color: #ded4ca; }
    .shotIdentity strong, .shotIdentity small { display: block; }
    .shotIdentity strong { color: var(--uiActionPrimary, #ff6637); font-family: ui-monospace, monospace; font-size: 12px; overflow-wrap: anywhere; }
    .shotIdentity small { margin-top: 4px; color: var(--uiTextMuted, #aaa29d); font-size: 11px; white-space: normal; }
    .durationValue { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .statusBadge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 24px;
      padding: 2px 9px;
      border: 1px solid #3b4a39;
      border-radius: 5px;
      color: #a8d99e;
      background: #273226;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.25;
      white-space: nowrap;
      &.statusgenerating, &.statusreview, &.statuschangesRequested { border-color: #624b36; color: #f0b477; background: #35281d; }
      &.statusapproved { border-color: #3d5940; color: #a8d99e; background: #253127; }
      &.statusdraft, &.statusready { border-color: #45413b; color: #c5bdb5; background: #2b2824; }
    }
    .missingValue { color: #898079; }
    .srOnly { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  }
}
</style>

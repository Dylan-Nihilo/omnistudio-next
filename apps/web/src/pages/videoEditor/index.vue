<template>
  <main class="videoEditor">
    <header class="editorHeader">
      <div class="headerProject">
        <button class="iconButton backButton" type="button" aria-label="返回画布" title="返回画布" @click="router.push('/workspace')"><iconArrowLeft :size="18" /></button>
        <div class="projectTitle"><strong>剪辑台</strong><span>{{ workspaceStore.project?.name || "未命名项目" }}</span></div>
      </div>
      <div class="headerActions">
        <span class="saveStatus" :class="{ hasError: saveError }" role="status">{{ saveError || (projectLoading ? "正在读取" : saveBusy || savePending ? "正在保存" : "已保存") }}</span>
        <button class="exportButton" type="button" :disabled="!canExport || exportBusy" @click="exportTimeline"><iconDownload :size="17" />{{ exportBusy ? "正在导出" : "导出视频" }}</button>
      </div>
    </header>

    <div v-if="!directory" class="noProject">
      <iconMovie :size="34" />
      <h1>请先打开一个工作区</h1>
      <p>剪辑项目将保存在当前工作区的素材目录中。</p>
      <button class="secondaryButton" type="button" @click="router.push('/home')">选择工作区</button>
    </div>

    <template v-else>
      <div class="editorBody">
        <aside class="mediaPanel">
          <nav class="sideTabs" aria-label="剪辑资源">
            <button v-for="tab in panelTabs" :key="tab.id" class="sideTab" :class="{ isActive: activeTab === tab.id }" type="button" :aria-pressed="activeTab === tab.id" @click="activeTab = tab.id">
              <component :is="tab.icon" :size="18" /><span>{{ tab.label }}</span>
            </button>
          </nav>
          <section v-if="activeTab === 'media' || activeTab === 'audio'" class="assetPanel">
            <div class="panelHeading"><div><h2>{{ activeTab === "audio" ? "音频素材" : "媒体素材" }}</h2><span>{{ visibleAssets.length }} 个素材</span></div><button class="iconButton" type="button" aria-label="导入媒体" title="导入媒体" :disabled="importBusy" @click="fileInput?.click()"><iconUpload :size="18" /></button></div>
            <div class="assetFilters"><input v-model="assetSearch" type="search" placeholder="搜索素材" aria-label="搜索素材" /><div class="filterSwitch"><button type="button" :class="{ isActive: mediaFilter === 'all' }" @click="mediaFilter = 'all'">全部</button><button type="button" :class="{ isActive: mediaFilter === 'video' }" @click="mediaFilter = 'video'">视频</button><button type="button" :class="{ isActive: mediaFilter === 'audio' }" @click="mediaFilter = 'audio'">音频</button></div></div>
            <input ref="fileInput" class="hiddenInput" type="file" accept="video/*,audio/*" multiple @change="importFiles" />
            <div class="assetList" @dragover.prevent>
              <div v-for="asset in visibleAssets" :key="asset.id" class="assetRow" draggable="true" @dragstart="dragAsset($event, asset)" @dblclick="addAssetToTimeline(asset)">
                <div class="assetIcon" :class="asset.kind"><iconVideo v-if="asset.kind === 'video'" :size="20" /><iconMusic v-else :size="20" /></div>
                <div class="assetInfo"><strong :title="asset.name">{{ asset.name }}</strong><span>{{ formatTime(asset.duration) }} · {{ asset.kind === 'video' ? '视频' : '音频' }}</span></div>
                <button class="tinyAction" type="button" :aria-label="`添加${asset.name}到时间线`" title="添加到时间线" @click="addAssetToTimeline(asset)"><iconPlus :size="16" /></button>
              </div>
              <div v-if="!visibleAssets.length && !importBusy" class="assetEmpty"><iconPhotoVideo :size="25" /><span>{{ assetSearch ? "没有匹配的素材" : "导入视频或音频开始剪辑" }}</span></div>
              <div v-if="importBusy" class="assetHint" role="status">正在导入素材…</div>
            </div>
            <div class="dropHint" @click="fileInput?.click()" @drop.prevent="dropFiles" @dragover.prevent>拖入媒体文件，或点击导入</div>
          </section>

          <section v-else-if="activeTab === 'text'" class="textPanel">
            <div class="panelHeading"><div><h2>文字</h2><span>添加文字片段</span></div></div>
            <label class="fieldLabel" for="textDraft">文字内容</label>
            <textarea id="textDraft" v-model="textDraft" rows="4" maxlength="120" placeholder="输入要显示的文字"></textarea>
            <button class="wideButton" type="button" :disabled="!textDraft.trim()" @click="addTextClip"><iconTextSize :size="17" />添加到时间线</button>
            <p class="featureNote">文字按时间线位置显示，并烧录到导出画面。</p>
          </section>

          <section v-else class="settingsPanel">
            <div class="panelHeading"><div><h2>项目设置</h2><span>预览与输出画幅</span></div></div>
            <label class="fieldLabel" for="aspectRatio">画面比例</label>
            <select id="aspectRatio" v-model="aspectRatio"><option value="16:9">横屏 16:9</option><option value="9:16">竖屏 9:16</option><option value="1:1">方形 1:1</option><option value="4:3">经典 4:3</option></select>
            <label class="fieldLabel" for="frameRate">帧率</label>
            <select id="frameRate" v-model.number="frameRate"><option :value="24">24 fps</option><option :value="25">25 fps</option><option :value="30">30 fps</option><option :value="60">60 fps</option></select>
            <p class="featureNote">导出使用所选画幅与帧率，素材等比适配，空白处填充黑色。</p>
          </section>
        </aside>

        <section class="previewArea" aria-label="视频预览">
          <div class="previewTopline"><div class="previewTitle"><span class="liveDot"></span><span>预览</span><span class="previewDimensions">{{ aspectRatio }} · {{ frameRate }} fps</span></div><span class="playheadReadout">{{ formatTime(currentTime) }} / {{ formatTime(timelineDuration) }}</span></div>
          <div class="previewStage" :class="`ratio${aspectRatio.replace(':', '')}`">
            <video ref="videoElement" v-if="activeVideoAsset" class="previewVideo" :src="previewUrl || undefined" muted playsinline preload="auto" @loadedmetadata="syncPlayers"></video>
            <audio v-for="clip in activeSoundClips" :key="clip.id" :ref="element => setAudioElement(clip.id, element)" class="hiddenAudio" :src="audioUrls[clip.id] || undefined" preload="auto" @loadedmetadata="syncPlayers"></audio>
            <div v-if="activeTextClip" class="previewText">{{ activeTextClip.text }}</div>
            <div v-if="!activeVideoAsset" class="previewEmpty"><iconMovie :size="38" /><span>{{ clips.some(clip => clip.track === 'video') ? "当前时间没有视频画面" : "将视频素材添加到时间线" }}</span></div>
            <div v-if="previewError" class="previewMessage" role="alert">{{ previewError }}</div>
          </div>
          <div class="transportBar">
            <button class="transportButton" type="button" :aria-label="isPlaying ? '暂停' : '播放'" :title="isPlaying ? '暂停' : '播放'" @click="togglePlayback"><iconPlayerPause v-if="isPlaying" :size="21" /><iconPlayerPlay v-else :size="21" /></button>
            <input class="previewRange" type="range" min="0" :max="timelineDuration || 1" step="0.01" :value="currentTime" aria-label="播放位置" @input="seekFromRange" />
            <span class="transportTime">{{ formatTime(currentTime) }} <i>/</i> {{ formatTime(timelineDuration) }}</span>
            <button class="transportButton" type="button" aria-label="跳转到时间线开头" title="跳转到开头" @click="currentTime = 0"><iconPlayerSkipBack :size="18" /></button>
          </div>
        </section>

        <aside class="inspectorPanel">
          <div class="panelHeading"><div><h2>属性</h2><span>{{ selectedClip ? selectedClip.title : "未选择片段" }}</span></div></div>
          <template v-if="selectedClip">
            <div class="inspectorSection"><span class="sectionLabel">片段信息</span><div class="inspectorMeta"><span class="kindMark" :class="selectedClip.kind">{{ selectedClip.kind === 'video' ? '视频' : selectedClip.kind === 'audio' ? '音频' : '文字' }}</span><span>{{ selectedClip.track === 'video' ? '视频轨道' : selectedClip.track === 'audio' ? '音频轨道' : '文字轨道' }}</span></div></div>
            <label class="fieldLabel" for="clipStart">时间线起点 <span>秒</span></label><input id="clipStart" type="number" min="0" step="0.1" :value="selectedClip.start.toFixed(1)" @change="updateSelectedClip('start', $event)" />
            <template v-if="selectedClip.kind !== 'text'">
              <label class="fieldLabel" for="clipIn">入点 <span>秒</span></label><input id="clipIn" type="number" min="0" step="0.1" :value="selectedClip.inPoint.toFixed(1)" @change="updateSelectedClip('inPoint', $event)" />
              <label class="fieldLabel" for="clipOut">出点 <span>秒</span></label><input id="clipOut" type="number" min="0.1" step="0.1" :value="selectedClip.outPoint.toFixed(1)" @change="updateSelectedClip('outPoint', $event)" />
              <template v-if="selectedClip.kind === 'audio'"><label class="fieldLabel" for="clipVolume">音量 <span>{{ Math.round(selectedClip.volume * 100) }}%</span></label><input id="clipVolume" type="range" min="0" max="1" step="0.01" :value="selectedClip.volume" @input="updateSelectedClip('volume', $event)" /></template>
            </template>
            <template v-else>
              <label class="fieldLabel" for="clipText">文字内容</label><textarea id="clipText" rows="4" maxlength="120" :value="selectedClip.text" @change="updateSelectedText($event)"></textarea>
              <label class="fieldLabel" for="textDuration">片段时长 <span>秒</span></label><input id="textDuration" type="number" min="0.3" step="0.1" :value="clipDuration(selectedClip).toFixed(1)" @change="updateSelectedTextDuration($event)" />
            </template>
            <div class="inspectorFooter"><span>时长</span><strong>{{ formatTime(clipDuration(selectedClip)) }}</strong></div>
            <button class="removeButton" type="button" @click="deleteSelectedClip"><iconTrash :size="16" />删除片段</button>
          </template>
          <div v-else class="inspectorEmpty"><iconAdjustments :size="27" /><span>选择时间线中的片段查看属性</span></div>
          <div v-if="exportError" class="exportError" role="alert">{{ exportError }}</div>
        </aside>
      </div>

      <section class="timelinePanel" aria-label="多轨时间线">
        <header class="timelineHeader">
          <div class="timelineActions">
            <button class="timelineButton" type="button" aria-label="撤销" title="撤销" :disabled="!undoStack.length" @click="undo"><iconArrowBackUp :size="17" /></button>
            <button class="timelineButton" type="button" aria-label="重做" title="重做" :disabled="!redoStack.length" @click="redo"><iconArrowForwardUp :size="17" /></button><span class="headerDivider"></span>
            <button class="timelineButton" type="button" aria-label="分割片段" title="在播放头分割" :disabled="!selectedClip || selectedClip.kind === 'text' || currentTime <= selectedClip.start || currentTime >= selectedClip.start + clipDuration(selectedClip)" @click="splitSelectedClip"><iconScissors :size="17" /></button>
            <button class="timelineButton" type="button" aria-label="复制片段" title="复制片段" :disabled="!selectedClip" @click="duplicateSelectedClip"><iconCopy :size="17" /></button>
            <button class="timelineButton" type="button" aria-label="删除片段" title="删除片段" :disabled="!selectedClip" @click="deleteSelectedClip"><iconTrash :size="17" /></button><span class="headerDivider"></span>
            <button class="timelineButton snapButton" :class="{ isActive: snapEnabled }" type="button" :aria-pressed="snapEnabled" :title="snapEnabled ? '关闭吸附' : '开启吸附'" @click="snapEnabled = !snapEnabled"><iconMagnet :size="16" /><span>吸附</span></button>
          </div>
          <div class="timelineZoom"><button class="timelineButton" type="button" aria-label="缩小时间线" title="缩小" @click="zoom = Math.max(10, zoom - 4)"><iconMinus :size="16" /></button><input v-model.number="zoom" type="range" min="10" max="80" step="2" aria-label="时间线缩放" /><button class="timelineButton" type="button" aria-label="放大时间线" title="放大" @click="zoom = Math.min(80, zoom + 4)"><iconPlus :size="16" /></button><span>{{ zoom }} px/s</span></div>
        </header>
        <div ref="timelineViewport" class="timelineViewport">
          <div class="timelineCanvas" :style="{ width: `${timelineWidth}px` }">
            <div class="timelineRuler" @pointerdown="seekTimeline">
              <div class="rulerLabel">时间</div><div class="rulerTicks"><span v-for="tick in rulerTicks" :key="tick" class="rulerTick" :style="{ left: `${tick * pixelsPerSecond}px` }">{{ formatTime(tick) }}</span></div>
            </div>
            <div v-for="track in tracks" :key="track.id" class="timelineTrack" :class="track.id" @pointerdown="seekTimeline" @dragover.prevent @drop.prevent="dropOnTrack($event, track.id)">
              <div class="trackLabel"><component :is="track.icon" :size="16" /><span>{{ track.label }}</span><small>{{ clipCount(track.id) }}</small></div>
              <div class="trackContent">
                <button v-for="clip in clips.filter(item => item.track === track.id)" :key="clip.id" class="timelineClip" :class="[clip.kind, { isSelected: selectedClipId === clip.id }]" type="button" :style="clipStyle(clip)" :title="`${clip.title} · ${formatTime(clipDuration(clip))}`" @pointerdown.stop="startClipDrag($event, clip)" @click.stop="selectClip(clip)">
                  <span class="trimHandle leftHandle" role="presentation" @pointerdown.stop.prevent="startClipDrag($event, clip, 'left')"></span><span class="clipTitle">{{ clip.title }}</span><span class="clipDuration">{{ formatTime(clipDuration(clip)) }}</span><span class="trimHandle rightHandle" role="presentation" @pointerdown.stop.prevent="startClipDrag($event, clip, 'right')"></span>
                </button>
              </div>
            </div>
            <div class="playhead" :style="{ left: `${112 + currentTime * pixelsPerSecond}px` }" @pointerdown.stop="startPlayheadDrag"><span class="playheadCap"></span><span class="playheadLine"></span></div>
            <div v-if="!clips.length" class="timelineEmpty">拖入媒体素材，或双击素材加入时间线</div>
          </div>
        </div>
        <footer class="timelineFooter"><span>{{ clips.length }} 个片段</span><span class="timelineFooterNote">导出时视频轨空隙为黑帧，重叠片段按起点顺序叠加；音频轨混音，文字轨烧录到画面。</span><span>总时长 {{ formatTime(timelineDuration) }}</span></footer>
      </section>
    </template>

    <div v-if="exportBusy" class="exportOverlay" role="status" aria-live="polite">
      <div class="exportDialog"><div class="exportSpinner"></div><strong>正在导出视频</strong><span>{{ exportProgress === undefined ? "正在准备素材" : `${exportProgress}%` }}</span><div class="progressTrack"><i :style="{ width: `${exportProgress ?? 4}%` }"></i></div><button class="secondaryButton" type="button" @click="cancelExport">取消导出</button></div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { createBrowserFfmpeg, type BrowserFfmpegCommand, type BrowserFfmpegFactory } from "@omnistudio-next/ffmpeg/browser";
import { IconAdjustments, IconArrowBackUp, IconArrowForwardUp, IconArrowLeft, IconCopy, IconDownload, IconMagnet, IconMinus, IconMovie, IconMusic, IconPhotoVideo, IconPlayerPause, IconPlayerPlay, IconPlayerSkipBack, IconPlus, IconScissors, IconTextSize, IconTrash, IconUpload, IconVideo } from "@tabler/icons-vue";

type MediaKind = "video" | "audio";
type TrackKind = "video" | "audio" | "text";
type EditorAsset = { id: string; name: string; path: string; kind: MediaKind; duration: number; size: number };
type EditorClip = { id: string; assetId?: string; title: string; kind: MediaKind | "text"; track: TrackKind; start: number; inPoint: number; outPoint: number; volume: number; text?: string };
type DragState = { clipId?: string; startX: number; originalStart?: number; originalIn?: number; originalOut?: number; edge?: "left" | "right"; playhead?: boolean };
type Track = { id: TrackKind; label: string; icon: typeof IconVideo };
type UrlHandle = ReturnType<ReturnType<typeof useWorkspaceFiles>["acquireUrl"]>;

const router = useRouter();
const workspaceStore = useWorkspaceStore();
const directory = computed(() => workspaceStore.project?.directory);
const activeTab = ref<"media" | "audio" | "text" | "settings">("media");
const panelTabs = [
  { id: "media", label: "媒体", icon: IconPhotoVideo },
  { id: "audio", label: "音频", icon: IconMusic },
  { id: "text", label: "文字", icon: IconTextSize },
  { id: "settings", label: "设置", icon: IconAdjustments },
] as const;
const tracks: Track[] = [
  { id: "video", label: "视频", icon: IconVideo },
  { id: "audio", label: "音频", icon: IconMusic },
  { id: "text", label: "文字", icon: IconTextSize },
];
const assets = ref<EditorAsset[]>([]);
const clips = ref<EditorClip[]>([]);
const selectedClipId = ref<string>();
const currentTime = ref(0);
const isPlaying = ref(false);
const assetSearch = ref("");
const mediaFilter = ref<"all" | MediaKind>("all");
const textDraft = ref("");
const aspectRatio = ref("16:9");
const frameRate = ref(30);
const zoom = ref(30);
const snapEnabled = ref(true);
const importBusy = ref(false);
const saveBusy = ref(false);
const savePending = ref(false);
const projectLoading = ref(false);
const saveError = ref("");
const previewError = ref("");
const exportError = ref("");
const exportBusy = ref(false);
const exportProgress = ref<number>();
const exportController = ref<AbortController>();
const fileInput = ref<HTMLInputElement>();
const videoElement = ref<HTMLVideoElement>();
const timelineViewport = ref<HTMLElement>();
const previewUrl = ref("");
const audioUrls = ref<Record<string, string>>({});
const previewHandle = shallowRef<UrlHandle>();
const audioHandles = new Map<string, UrlHandle>();
const audioElements = new Map<string, HTMLAudioElement>();
const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let playbackTimer: ReturnType<typeof setInterval> | undefined;
let dragState: DragState | undefined;
let releaseDragEvents: (() => void) | undefined;
let saveQueue = Promise.resolve(true);
let pendingSave: { directory: string; content: string; revision: number } | undefined;
let loadedDirectory: string | undefined;
let projectVersion = 0;
let saveRevision = 0;
let saveRequests = 0;
let playbackTime = 0;

const selectedClip = computed(() => clips.value.find(clip => clip.id === selectedClipId.value));
const activeVideoClip = computed(() => findActiveClip("video"));
const activeSoundClips = computed(() => clips.value.filter(clip => clip.kind !== "text" && currentTime.value >= clip.start && currentTime.value < clip.start + clipDuration(clip)));
const audioPreviewKey = computed(() => `${directory.value ?? ""}|${activeSoundClips.value.map(clip => clip.id).join("|")}`);
const activeTextClip = computed(() => clips.value.filter(clip => clip.track === "text" && currentTime.value >= clip.start && currentTime.value < clip.start + clipDuration(clip)).sort((a, b) => b.start - a.start)[0]);
const activeVideoAsset = computed(() => assets.value.find(asset => asset.id === activeVideoClip.value?.assetId));
const timelineDuration = computed(() => Math.max(0, ...clips.value.map(clip => clip.start + clipDuration(clip))));
const pixelsPerSecond = computed(() => zoom.value);
const timelineWidth = computed(() => Math.max(1200, 112 + (timelineDuration.value + 15) * pixelsPerSecond.value));
const rulerTicks = computed(() => {
  const step = timelineDuration.value > 180 ? 30 : timelineDuration.value > 90 ? 15 : timelineDuration.value > 30 ? 5 : 2;
  const ticks: number[] = [];
  for (let time = 0; time <= Math.max(30, timelineDuration.value + 10); time += step) ticks.push(time);
  return ticks;
});
const visibleAssets = computed(() => assets.value.filter(asset => {
  const kindMatch = mediaFilter.value === "all" || asset.kind === mediaFilter.value;
  const tabMatch = activeTab.value === "audio" ? asset.kind === "audio" : true;
  return kindMatch && tabMatch && asset.name.toLowerCase().includes(assetSearch.value.trim().toLowerCase());
}));
const canExport = computed(() => !!directory.value && !projectLoading.value && loadedDirectory === directory.value && clips.value.some(clip => clip.track === "video") && !importBusy.value);

watch(directory, (next, previous) => {
  if (next === previous) return;
  if (pendingSave) void saveProject();
  projectVersion++;
  loadedDirectory = undefined;
  projectLoading.value = !!next;
  stopPlayback();
  clearEditor();
  if (next) void loadProject(next);
}, { immediate: true, flush: "sync" });
watch([assets, clips, aspectRatio, frameRate], scheduleSave, { deep: true, flush: "sync" });
watch(() => [directory.value, activeVideoAsset.value?.path], () => loadPreviewMedia(), { immediate: true });
watch(audioPreviewKey, loadAudioPreviews, { immediate: true });
watch(currentTime, syncPlayers, { flush: "post" });
watch(clips, syncPlayers, { deep: true, flush: "post" });
watch(isPlaying, playing => {
  playbackTime = performance.now();
  if (!playing) {
    videoElement.value?.pause();
    for (const audio of audioElements.values()) audio.pause();
    return;
  }
  syncPlayers();
});

onMounted(() => {
  window.addEventListener("keydown", onEditorKeydown);
  window.addEventListener("beforeunload", handleBeforeUnload);
  playbackTimer = setInterval(() => {
    const now = performance.now();
    if (isPlaying.value) currentTime.value = Math.min(timelineDuration.value, currentTime.value + (now - playbackTime) / 1000);
    playbackTime = now;
    if (currentTime.value >= timelineDuration.value) stopPlayback();
  }, 30);
});
onBeforeRouteLeave(async () => {
  if (importBusy.value || exportBusy.value) return false;
  stopPlayback();
  return await saveProject();
});
onBeforeUnmount(() => {
  projectVersion++;
  window.removeEventListener("keydown", onEditorKeydown);
  window.removeEventListener("beforeunload", handleBeforeUnload);
  if (playbackTimer) clearInterval(playbackTimer);
  if (persistTimer) clearTimeout(persistTimer);
  if (pendingSave) void saveProject();
  releaseDragEvents?.();
  stopPlayback();
  previewHandle.value?.release();
  for (const handle of audioHandles.values()) handle.release();
  audioHandles.clear();
  exportController.value?.abort();
});

function findActiveClip(track: TrackKind) {
  return clips.value.filter(clip => clip.track === track && currentTime.value >= clip.start && currentTime.value < clip.start + clipDuration(clip)).sort((a, b) => b.start - a.start)[0];
}

function clipDuration(clip: EditorClip) {
  return Math.max(0, clip.outPoint - clip.inPoint);
}

function formatTime(value: number) {
  const safeTime = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safeTime / 60);
  const seconds = Math.floor(safeTime % 60);
  const frames = Math.min(frameRate.value - 1, Math.floor((safeTime % 1) * frameRate.value + 0.00001));
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(frames).padStart(2, "0")}`;
}

function clipStyle(clip: EditorClip) {
  return { left: `${clip.start * pixelsPerSecond.value}px`, width: `${Math.max(2, clipDuration(clip) * pixelsPerSecond.value)}px` };
}

function clipCount(track: TrackKind) {
  return clips.value.filter(clip => clip.track === track).length;
}

function selectClip(clip: EditorClip) {
  selectedClipId.value = clip.id;
  currentTime.value = Math.min(clip.start + clipDuration(clip) / 2, timelineDuration.value);
  syncPlayers();
}

function saveHistory() {
  undoStack.value.push(JSON.stringify(clips.value));
  if (undoStack.value.length > 80) undoStack.value.shift();
  redoStack.value = [];
}

function undo() {
  const previous = undoStack.value.pop();
  if (!previous) return;
  redoStack.value.push(JSON.stringify(clips.value));
  clips.value = JSON.parse(previous) as EditorClip[];
  selectedClipId.value = undefined;
}

function redo() {
  const next = redoStack.value.pop();
  if (!next) return;
  undoStack.value.push(JSON.stringify(clips.value));
  clips.value = JSON.parse(next) as EditorClip[];
  selectedClipId.value = undefined;
}

function addAssetToTimeline(asset: EditorAsset, startAt?: number) {
  saveHistory();
  const track: TrackKind = asset.kind;
  const lastClipEnd = Math.max(0, ...clips.value.filter(clip => clip.track === track).map(clip => clip.start + clipDuration(clip)));
  const clip: EditorClip = { id: crypto.randomUUID(), assetId: asset.id, title: asset.name, kind: asset.kind, track, start: startAt ?? lastClipEnd, inPoint: 0, outPoint: asset.duration, volume: 1 };
  clips.value.push(clip);
  selectedClipId.value = clip.id;
  currentTime.value = clip.start;
  activeTab.value = track === "audio" ? "audio" : "media";
}

function addTextClip() {
  const text = textDraft.value.trim();
  if (!text) return;
  saveHistory();
  const end = Math.max(currentTime.value, ...clips.value.filter(clip => clip.track === "text").map(clip => clip.start + clipDuration(clip)));
  const clip: EditorClip = { id: crypto.randomUUID(), title: text.slice(0, 24), kind: "text", track: "text", start: end, inPoint: 0, outPoint: 5, volume: 1, text };
  clips.value.push(clip);
  selectedClipId.value = clip.id;
  currentTime.value = clip.start;
  textDraft.value = "";
}

function deleteSelectedClip() {
  if (!selectedClip.value) return;
  saveHistory();
  clips.value = clips.value.filter(clip => clip.id !== selectedClipId.value);
  selectedClipId.value = undefined;
}

function duplicateSelectedClip() {
  const clip = selectedClip.value;
  if (!clip) return;
  saveHistory();
  const duplicate = { ...clip, id: crypto.randomUUID(), title: `${clip.title} 副本`, start: clip.start + clipDuration(clip) };
  clips.value.push(duplicate);
  selectedClipId.value = duplicate.id;
}

function splitSelectedClip() {
  const clip = selectedClip.value;
  if (!clip || clip.kind === "text") return;
  const splitTime = currentTime.value - clip.start;
  const splitPoint = clip.inPoint + splitTime;
  if (splitPoint <= clip.inPoint + 0.1 || splitPoint >= clip.outPoint - 0.1) return;
  saveHistory();
  const originalOut = clip.outPoint;
  clip.outPoint = splitPoint;
  const next = { ...clip, id: crypto.randomUUID(), title: `${clip.title}（后段）`, start: currentTime.value, inPoint: splitPoint, outPoint: originalOut };
  clips.value.push(next);
  selectedClipId.value = next.id;
}

function updateSelectedClip(field: "start" | "inPoint" | "outPoint" | "volume", event: Event) {
  const clip = selectedClip.value;
  const target = event.currentTarget as HTMLInputElement;
  const value = Number(target.value);
  if (!clip || !Number.isFinite(value)) return;
  saveHistory();
  if (field === "start") clip.start = Math.max(0, value);
  else if (field === "inPoint") clip.inPoint = Math.min(Math.max(0, value), clip.outPoint - 0.1);
  else if (field === "outPoint") clip.outPoint = Math.min(Math.max(clip.inPoint + 0.1, value), assetDuration(clip));
  else clip.volume = Math.min(1, Math.max(0, value));
  target.value = field === "volume" ? String(clip.volume) : String(clip[field]);
}

function assetDuration(clip: EditorClip) {
  return assets.value.find(asset => asset.id === clip.assetId)?.duration ?? clip.outPoint;
}

function updateSelectedText(event: Event) {
  if (!selectedClip.value || selectedClip.value.kind !== "text") return;
  saveHistory();
  const text = (event.currentTarget as HTMLTextAreaElement).value.trim();
  selectedClip.value.text = text;
  selectedClip.value.title = text.slice(0, 24) || "文字片段";
}

function updateSelectedTextDuration(event: Event) {
  const clip = selectedClip.value;
  if (!clip || clip.kind !== "text") return;
  const duration = Math.max(0.3, Number((event.currentTarget as HTMLInputElement).value) || 0.3);
  saveHistory();
  clip.inPoint = 0;
  clip.outPoint = duration;
}

function startClipDrag(event: PointerEvent, clip: EditorClip, edge?: "left" | "right") {
  if (event.button !== 0) return;
  saveHistory();
  selectedClipId.value = clip.id;
  dragState = { clipId: clip.id, startX: event.clientX, originalStart: clip.start, originalIn: clip.inPoint, originalOut: clip.outPoint, edge };
  beginPointerTracking();
}

function startPlayheadDrag(event: PointerEvent) {
  if (event.button !== 0) return;
  dragState = { startX: event.clientX, playhead: true };
  beginPointerTracking();
}

function beginPointerTracking() {
  const move = (event: PointerEvent) => {
    if (!dragState) return;
    if (dragState.playhead) {
      seekFromClient(event.clientX);
      return;
    }
    const state = dragState;
    const clip = clips.value.find(item => item.id === state.clipId);
    if (!clip) return;
    const delta = (event.clientX - state.startX) / pixelsPerSecond.value;
    if (state.edge === "left") {
      const trimDelta = Math.min((state.originalOut ?? clip.outPoint) - (state.originalIn ?? clip.inPoint) - 0.15, delta);
      const newIn = Math.max(0, (state.originalIn ?? 0) + trimDelta);
      const actualDelta = newIn - (state.originalIn ?? 0);
      clip.inPoint = newIn;
      clip.start = Math.max(0, (state.originalStart ?? 0) + actualDelta);
    } else if (state.edge === "right") {
      clip.outPoint = Math.min(assetDuration(clip), Math.max(clip.inPoint + 0.15, (state.originalOut ?? clip.outPoint) + delta));
    } else {
      const nextStart = Math.max(0, (state.originalStart ?? 0) + delta);
      clip.start = snapEnabled.value ? snapTime(nextStart, clip.id) : nextStart;
    }
  };
  const up = () => {
    dragState = undefined;
    releaseDragEvents?.();
    releaseDragEvents = undefined;
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  releaseDragEvents = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
}

function snapTime(value: number, clipId: string) {
  const threshold = 8 / pixelsPerSecond.value;
  const duration = clipDuration(clips.value.find(clip => clip.id === clipId)!);
  const edges = [0, ...clips.value.filter(clip => clip.id !== clipId).flatMap(clip => [clip.start, clip.start + clipDuration(clip)])];
  const candidates = edges.flatMap(edge => [edge, edge - duration]).filter(time => time >= 0);
  const closest = candidates.reduce((current, edge) => Math.abs(edge - value) < Math.abs(current - value) ? edge : current);
  return Math.abs(closest - value) <= threshold ? closest : value;
}

function seekTimeline(event: PointerEvent) {
  if ((event.target as HTMLElement).closest(".timelineClip")) return;
  seekFromClient(event.clientX);
}

function seekFromClient(clientX: number) {
  const viewport = timelineViewport.value;
  if (!viewport) return;
  const rect = viewport.getBoundingClientRect();
  currentTime.value = Math.max(0, Math.min(timelineDuration.value, (clientX - rect.left + viewport.scrollLeft - 112) / pixelsPerSecond.value));
}

function seekFromRange(event: Event) {
  currentTime.value = Number((event.currentTarget as HTMLInputElement).value);
}

function dragAsset(event: DragEvent, asset: EditorAsset) {
  event.dataTransfer?.setData("application/x-editor-asset", asset.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
}

function dropOnTrack(event: DragEvent, track: TrackKind) {
  const assetId = event.dataTransfer?.getData("application/x-editor-asset");
  const asset = assets.value.find(item => item.id === assetId);
  if (asset && (track === "text" || asset.kind !== track)) return;
  if (asset) {
    const content = (event.currentTarget as HTMLElement).querySelector(".trackContent")!;
    addAssetToTimeline(asset, Math.max(0, (event.clientX - content.getBoundingClientRect().left) / pixelsPerSecond.value));
  }
}

function togglePlayback() {
  if (!timelineDuration.value) return;
  if (currentTime.value >= timelineDuration.value) currentTime.value = 0;
  isPlaying.value = !isPlaying.value;
  syncPlayers();
}

function stopPlayback() {
  isPlaying.value = false;
  videoElement.value?.pause();
  for (const audio of audioElements.values()) audio.pause();
}

function syncPlayers() {
  const video = videoElement.value;
  const videoClip = activeVideoClip.value;
  if (video && videoClip && Number.isFinite(video.duration)) {
    const desiredTime = videoClip.inPoint + Math.max(0, currentTime.value - videoClip.start);
    if (Math.abs(video.currentTime - desiredTime) > 0.06) video.currentTime = Math.min(desiredTime, Math.max(0, video.duration - 0.05));
    if (isPlaying.value && video.paused) void video.play().catch(() => { isPlaying.value = false; });
    if (!isPlaying.value && !video.paused) video.pause();
  } else if (video && !video.paused) video.pause();
  for (const [clipId, audio] of audioElements) {
    const clip = activeSoundClips.value.find(item => item.id === clipId);
    if (!clip || !Number.isFinite(audio.duration)) {
      if (!audio.paused) audio.pause();
      continue;
    }
    const desiredTime = clip.inPoint + Math.max(0, currentTime.value - clip.start);
    if (Math.abs(audio.currentTime - desiredTime) > 0.06) audio.currentTime = Math.min(desiredTime, Math.max(0, audio.duration - 0.05));
    audio.volume = clip.volume;
    if (isPlaying.value && audio.paused) void audio.play().catch(() => {});
    if (!isPlaying.value && !audio.paused) audio.pause();
  }
}

function setAudioElement(clipId: string, element: unknown) {
  if (element instanceof HTMLAudioElement) {
    audioElements.set(clipId, element);
    syncPlayers();
  } else {
    audioElements.get(clipId)?.pause();
    audioElements.delete(clipId);
  }
}

async function loadPreviewMedia() {
  previewHandle.value?.release();
  previewHandle.value = undefined;
  previewUrl.value = "";
  const path = activeVideoAsset.value?.path;
  const directorySnapshot = directory.value;
  if (!path || !directorySnapshot) return;
  const handle = useWorkspaceFiles(directorySnapshot).acquireUrl(path);
  previewHandle.value = handle;
  try {
    const url = await handle.url;
    if (previewHandle.value !== handle) {
      handle.release();
      return;
    }
    previewUrl.value = url;
    previewError.value = "";
  } catch (error) {
    if (previewHandle.value === handle) previewError.value = error instanceof Error ? error.message : "素材读取失败";
  }
}

async function loadAudioPreviews() {
  const activeClips = activeSoundClips.value;
  const requestVersion = projectVersion;
  const requestKey = audioPreviewKey.value;
  const activeIds = new Set(activeClips.map(clip => clip.id));
  for (const [clipId, handle] of audioHandles) {
    if (activeIds.has(clipId)) continue;
    handle.release();
    audioHandles.delete(clipId);
    delete audioUrls.value[clipId];
  }
  const directorySnapshot = directory.value;
  if (!directorySnapshot) return;
  for (const clip of activeClips) {
    if (requestVersion !== projectVersion || requestKey !== audioPreviewKey.value) return;
    if (audioHandles.has(clip.id)) continue;
    const asset = assets.value.find(item => item.id === clip.assetId);
    if (!asset) continue;
    const handle = useWorkspaceFiles(directorySnapshot).acquireUrl(asset.path);
    audioHandles.set(clip.id, handle);
    try {
      const url = await handle.url;
      if (requestVersion !== projectVersion || requestKey !== audioPreviewKey.value || audioHandles.get(clip.id) !== handle) {
        if (audioHandles.get(clip.id) === handle) {
          audioHandles.delete(clip.id);
          delete audioUrls.value[clip.id];
        }
        handle.release();
        return;
      }
      audioUrls.value[clip.id] = url;
      syncPlayers();
    } catch (error) {
      if (audioHandles.get(clip.id) === handle) {
        audioHandles.delete(clip.id);
        handle.release();
        previewError.value = error instanceof Error ? error.message : "音频素材读取失败";
      }
    }
  }
}

async function importFiles(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = "";
  await importMedia(files);
}

async function dropFiles(event: DragEvent) {
  const files = [...(event.dataTransfer?.files ?? [])];
  await importMedia(files);
}

async function importMedia(incomingFiles: File[]) {
  const directorySnapshot = directory.value;
  if (!directorySnapshot || !incomingFiles.length) return;
  const supportedFiles = incomingFiles.filter(file => file.type.startsWith("video/") || file.type.startsWith("audio/"));
  if (!supportedFiles.length) {
    previewError.value = "请选择视频或音频文件";
    return;
  }
  importBusy.value = true;
  previewError.value = "";
  const workspaceFiles = useWorkspaceFiles(directorySnapshot);
  try {
    await ensureEditorFolders(workspaceFiles);
    for (const file of supportedFiles) {
      const kind: MediaKind = file.type.startsWith("video/") ? "video" : "audio";
      const duration = await readMediaDuration(file, kind);
      const id = crypto.randomUUID();
      const safeName = file.name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim() || `${kind}-${id}`;
      const relativePath = `assets/videoEditor/media/${id}-${safeName}`;
      await workspaceFiles.write(relativePath, file, true);
      assets.value.push({ id, name: file.name, path: relativePath, kind, duration, size: file.size });
    }
    scheduleSave();
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : "导入媒体失败";
  } finally {
    importBusy.value = false;
  }
}

function readMediaDuration(file: File, kind: MediaKind) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const media: HTMLMediaElement = kind === "video" ? document.createElement("video") : new Audio();
    const timeout = window.setTimeout(() => finish(new Error("读取媒体时长超时")), 20000);
    const finish = (error?: Error) => {
      const duration = media.duration;
      clearTimeout(timeout);
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(url);
      if (error) reject(error);
      else if (!Number.isFinite(duration) || duration <= 0) reject(new Error(`无法读取「${file.name}」的媒体时长`));
      else resolve(duration);
    };
    media.preload = "metadata";
    media.onloadedmetadata = () => finish();
    media.onerror = () => finish(new Error(`无法读取「${file.name}」的媒体信息`));
    media.src = url;
  });
}

async function ensureEditorFolders(files: ReturnType<typeof useWorkspaceFiles>) {
  const root = await files.list();
  if (!root.entries.some(entry => entry.path === "assets" && entry.type === "directory")) await files.mkdir("assets");
  const assetsDirectory = await files.list("assets");
  if (!assetsDirectory.entries.some(entry => entry.path === "assets/videoEditor" && entry.type === "directory")) await files.mkdir("assets/videoEditor");
  const editorDirectory = await files.list("assets/videoEditor");
  if (!editorDirectory.entries.some(entry => entry.path === "assets/videoEditor/media" && entry.type === "directory")) await files.mkdir("assets/videoEditor/media");
  if (!editorDirectory.entries.some(entry => entry.path === "assets/videoEditor/exports" && entry.type === "directory")) await files.mkdir("assets/videoEditor/exports");
}

async function loadProject(directorySnapshot: string) {
  const version = projectVersion;
  try {
    const workspaceFiles = useWorkspaceFiles(directorySnapshot);
    await ensureEditorFolders(workspaceFiles);
    const listing = await workspaceFiles.list("assets/videoEditor");
    const timelineFile = listing.entries.find(entry => entry.path === "assets/videoEditor/timeline.json" && entry.type === "file");
    const data = timelineFile ? await workspaceFiles.readJson<unknown>(timelineFile.path) : {};
    if (version !== projectVersion || directory.value !== directorySnapshot) return;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const value = data as Record<string, unknown>;
      if (Array.isArray(value.assets)) assets.value = value.assets.filter(isEditorAsset);
      if (Array.isArray(value.clips)) clips.value = value.clips.filter(isEditorClip);
      if (typeof value.aspectRatio === "string" && ["16:9", "9:16", "1:1", "4:3"].includes(value.aspectRatio)) aspectRatio.value = value.aspectRatio;
      if (typeof value.frameRate === "number" && [24, 25, 30, 60].includes(value.frameRate)) frameRate.value = value.frameRate;
    }
    loadedDirectory = directorySnapshot;
    projectLoading.value = false;
  } catch (error) {
    if (version === projectVersion && directory.value === directorySnapshot) {
      saveError.value = error instanceof Error ? error.message : "无法读取剪辑项目";
      projectLoading.value = false;
    }
  }
}

function isEditorAsset(value: unknown): value is EditorAsset {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.path === "string" && (item.kind === "video" || item.kind === "audio") && typeof item.duration === "number" && item.duration > 0 && typeof item.size === "number";
}

function isEditorClip(value: unknown): value is EditorClip {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.title === "string" && ["video", "audio", "text"].includes(String(item.kind)) && ["video", "audio", "text"].includes(String(item.track)) && typeof item.start === "number" && item.start >= 0 && typeof item.inPoint === "number" && typeof item.outPoint === "number" && item.outPoint > item.inPoint && typeof item.volume === "number" && (item.kind !== "text" || typeof item.text === "string");
}

function clearEditor() {
  assets.value = [];
  clips.value = [];
  selectedClipId.value = undefined;
  undoStack.value = [];
  redoStack.value = [];
  currentTime.value = 0;
  saveError.value = "";
}

function scheduleSave() {
  const directorySnapshot = directory.value;
  if (!directorySnapshot || loadedDirectory !== directorySnapshot || projectLoading.value) return;
  const content = JSON.stringify({ version: 1, assets: assets.value, clips: clips.value, aspectRatio: aspectRatio.value, frameRate: frameRate.value }, null, 2) + "\n";
  pendingSave = { directory: directorySnapshot, content, revision: ++saveRevision };
  savePending.value = true;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => { void saveProject(); }, 350);
}

function saveProject() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = undefined;
  const pending = pendingSave;
  if (!pending) return saveQueue;
  pendingSave = undefined;
  savePending.value = false;
  saveRequests++;
  saveBusy.value = true;
  saveQueue = saveQueue.then(async () => {
    try {
      const workspaceFiles = useWorkspaceFiles(pending.directory);
      await ensureEditorFolders(workspaceFiles);
      await workspaceFiles.write("assets/videoEditor/timeline.json", pending.content);
      if (directory.value === pending.directory) saveError.value = "";
      return true;
    } catch (error) {
      if (directory.value === pending.directory) {
        saveError.value = error instanceof Error ? error.message : "保存剪辑项目失败";
        if (pending.revision === saveRevision && !pendingSave) pendingSave = pending;
        savePending.value = !!pendingSave;
      }
      return false;
    } finally {
      saveRequests--;
      saveBusy.value = saveRequests > 0;
    }
  });
  return saveQueue;
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!pendingSave && !saveBusy.value) return;
  void saveProject();
  event.preventDefault();
  event.returnValue = "";
}

function onEditorKeydown(event: KeyboardEvent) {
  if (exportBusy.value || projectLoading.value || importBusy.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
  if (event.code === "Space") {
    event.preventDefault();
    togglePlayback();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelectedClip();
  } else if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    deleteSelectedClip();
  }
}

function cancelExport() {
  exportController.value?.abort(new DOMException("用户取消导出", "AbortError"));
}

async function exportTimeline() {
  const directorySnapshot = directory.value;
  if (!directorySnapshot || exportBusy.value) return;
  const videoClips = clips.value.filter(clip => clip.track === "video" && clip.kind === "video").sort((a, b) => a.start - b.start);
  if (!videoClips.length) return;
  exportError.value = "";
  exportBusy.value = true;
  exportProgress.value = undefined;
  const controller = new AbortController();
  exportController.value = controller;
  const workspaceFiles = useWorkspaceFiles(directorySnapshot);
  const jobId = crypto.randomUUID();
  const outputPath = `assets/videoEditor/exports/edited-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`;
  const temporaryPaths: string[] = [];
  try {
    await ensureEditorFolders(workspaceFiles);
    const ffmpeg = await createBrowserFfmpeg(directorySnapshot, controller.signal);
    const usedClips = clips.value.filter(clip => clip.kind !== "text");
    const usedAssets = [...new Map(usedClips.map(clip => {
      const asset = assets.value.find(item => item.id === clip.assetId);
      if (!asset) throw new Error(`找不到素材「${clip.title}」`);
      return [asset.id, asset] as const;
    })).values()];
    if (!usedAssets.length) throw new Error("时间线上没有可导出的媒体素材");
    const assetIndexes = new Map(usedAssets.map((asset, index) => [asset.id, index]));
    const audioAvailability = new Map(await Promise.all(usedAssets.map(async asset => [asset.id, await probeHasAudio(ffmpeg, asset.path, controller.signal)] as const)));
    const { filters, map, overlayInputs } = await buildExportFilterGraph(clips.value, assetIndexes, audioAvailability, timelineDuration.value, aspectRatio.value, frameRate.value, jobId, workspaceFiles, temporaryPaths);
    const command = ffmpeg(usedAssets[0].path);
    for (const asset of usedAssets.slice(1)) command.input(asset.path);
    for (const path of overlayInputs) command.input(path);
    command.complexFilter(filters, map).videoCodec("libx264").audioCodec("aac").outputFps(frameRate.value).output(outputPath);
    await runCommand(command, controller.signal, percent => { exportProgress.value = Math.min(99, Math.round(percent)); });
    exportProgress.value = 100;
    await saveProject();
    const download = workspaceFiles.acquireUrl(outputPath, "video/mp4");
    const url = await download.url;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = outputPath.split("/").at(-1) || "edited.mp4";
    anchor.click();
    download.release();
  } catch (error) {
    if (!controller.signal.aborted) exportError.value = error instanceof Error ? error.message : "视频导出失败";
    else exportError.value = "导出已取消";
    try {
      await workspaceFiles.remove(outputPath);
    } catch {
      // 输出失败时可能尚未创建文件。
    }
  } finally {
    for (const path of temporaryPaths) {
      try {
        await workspaceFiles.remove(path);
      } catch {
        // 临时片段在 FFmpeg 中止时可能不存在。
      }
    }
    if (exportController.value === controller) exportController.value = undefined;
    exportBusy.value = false;
    exportProgress.value = undefined;
  }
}

async function probeHasAudio(ffmpeg: BrowserFfmpegFactory, path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<boolean>((resolve, reject) => {
    ffmpeg.ffprobe(path, (error, data) => {
      if (signal.aborted) reject(signal.reason ?? new DOMException("导出已取消", "AbortError"));
      else if (error) reject(error);
      else resolve(data.streams.some(stream => stream.codec_type === "audio"));
    });
  });
}

async function buildExportFilterGraph(
  timelineClips: EditorClip[],
  assetIndexes: Map<string, number>,
  audioAvailability: Map<string, boolean>,
  duration: number,
  ratio: string,
  fps: number,
  jobId: string,
  workspaceFiles: ReturnType<typeof useWorkspaceFiles>,
  temporaryPaths: string[],
) {
  const dimensions = ratio === "9:16" ? [720, 1280] : ratio === "1:1" ? [1080, 1080] : ratio === "4:3" ? [960, 720] : [1280, 720];
  const [width, height] = dimensions;
  const graph: string[] = [`color=c=black:s=${width}x${height}:r=${fps}:d=${Math.max(duration, 0.04)}[base0]`];
  const overlayInputs: string[] = [];
  const videoClips = timelineClips.filter(clip => clip.track === "video" && clip.kind === "video").sort((a, b) => a.start - b.start);
  let videoBase = "base0";
  for (let index = 0; index < videoClips.length; index++) {
    const clip = videoClips[index];
    const input = assetIndexes.get(clip.assetId ?? "");
    if (input === undefined) throw new Error(`找不到素材「${clip.title}」`);
    const videoLabel = `video${index}`;
    const nextBase = `base${index + 1}`;
    const end = clip.start + clipDuration(clip);
    graph.push(`[${input}:v]trim=start=${clip.inPoint}:duration=${clipDuration(clip)},setpts=PTS-STARTPTS+${clip.start}/TB,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=${fps},format=yuv420p[${videoLabel}]`);
    graph.push(`[${videoBase}][${videoLabel}]overlay=0:0:eof_action=pass:repeatlast=0:enable='between(t\\,${clip.start}\\,${end})'[${nextBase}]`);
    videoBase = nextBase;
  }
  const textClips = timelineClips.filter(clip => clip.track === "text" && clip.kind === "text").sort((a, b) => a.start - b.start);
  for (let index = 0; index < textClips.length; index++) {
    const clip = textClips[index];
    const textPath = `assets/videoEditor/exports/.${jobId}-text-${index}.png`;
    temporaryPaths.push(textPath);
    await workspaceFiles.write(textPath, await createTextOverlay(clip.text ?? "", width, height), true);
    overlayInputs.push(textPath);
    const overlayInput = assetIndexes.size + index;
    const nextBase = `base${videoClips.length + index + 1}`;
    const end = clip.start + clipDuration(clip);
    graph.push(`[${videoBase}][${overlayInput}:v]overlay=0:0:eof_action=repeat:enable='between(t\\,${clip.start}\\,${end})'[${nextBase}]`);
    videoBase = nextBase;
  }
  const audioClips = timelineClips.filter(clip => clip.kind !== "text" && (clip.track === "audio" || clip.track === "video" && audioAvailability.get(clip.assetId ?? ""))).sort((a, b) => a.start - b.start);
  const audioLabels: string[] = [];
  for (let index = 0; index < audioClips.length; index++) {
    const clip = audioClips[index];
    const input = assetIndexes.get(clip.assetId ?? "");
    if (input === undefined) throw new Error(`找不到素材「${clip.title}」`);
    const label = `audio${index}`;
    const delay = Math.round(clip.start * 1000);
    graph.push(`[${input}:a]atrim=start=${clip.inPoint}:duration=${clipDuration(clip)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${clip.volume},adelay=${delay}|${delay}[${label}]`);
    audioLabels.push(label);
  }
  if (audioLabels.length) {
    graph.push(`${audioLabels.map(label => `[${label}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,atrim=duration=${Math.max(duration, 0.04)}[outa]`);
  } else {
    graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${Math.max(duration, 0.04)}[outa]`);
  }
  graph.push(`[${videoBase}]trim=duration=${Math.max(duration, 0.04)},setpts=PTS-STARTPTS[outv]`);
  return { filters: graph, map: ["outv", "outa"], overlayInputs };
}

async function createTextOverlay(text: string, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建文字画面");
  const fontSize = Math.round(Math.min(width * 0.04, height * 0.067));
  const lineHeight = Math.round(fontSize * 1.2);
  const maxWidth = width * 0.92;
  context.font = `600 ${fontSize}px "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const lines: string[] = [];
  let line = "";
  for (const character of text) {
    if (character === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    const candidate = line + character;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = character;
    } else line = candidate;
  }
  if (line) lines.push(line);
  const lineWidth = Math.max(3, fontSize * 0.12);
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.strokeStyle = "#000";
  context.fillStyle = "#fff";
  const firstLineY = height - height * 0.08 - lineHeight * (lines.length - 0.5);
  lines.forEach((value, index) => {
    const y = firstLineY + lineHeight * index;
    context.strokeText(value, width / 2, y, maxWidth);
    context.fillText(value, width / 2, y, maxWidth);
  });
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("文字画面编码失败")), "image/png"));
}

function runCommand(command: BrowserFfmpegCommand, signal: AbortSignal, onProgress?: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    let completed = false;
    const cleanup = () => {
      completed = true;
      signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (completed) return;
      command.kill("SIGKILL");
      cleanup();
      reject(signal.reason ?? new DOMException("导出已取消", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    command.on("progress", progress => {
      if (typeof progress.percent === "number") onProgress?.(Math.min(100, Math.max(0, progress.percent)));
    });
    command.once("error", error => {
      if (completed) return;
      cleanup();
      reject(error);
    });
    command.once("end", () => {
      if (completed) return;
      cleanup();
      resolve();
    });
    try {
      signal.throwIfAborted();
      command.run();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
</script>

<style lang="scss" scoped>
.videoEditor { display: flex; flex-direction: column; width: 100%; height: 100dvh; min-width: 900px; overflow: hidden; color: #e8ece7; background: #171a18; font-family: var(--uiFontFamily, sans-serif); font-size: 13px; }
.editorHeader { display: flex; align-items: center; justify-content: space-between; height: 58px; flex: 0 0 58px; padding: 0 18px; border-bottom: 1px solid #303631; background: #1d211e; }
.headerProject, .headerActions, .projectTitle, .previewTitle, .transportBar, .timelineActions, .timelineZoom, .timelineFooter { display: flex; align-items: center; }
.headerProject { gap: 12px; min-width: 0; }
.projectTitle { flex-direction: column; align-items: flex-start; gap: 2px; strong { font-size: 15px; font-weight: 650; } span { max-width: 300px; overflow: hidden; color: #969e97; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; } }
.headerActions { gap: 14px; }
.saveStatus { color: #8c968e; font-size: 11px; &.hasError { color: #f1a083; } }
.iconButton, .timelineButton, .transportButton, .tinyAction { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 34px; height: 34px; border: 0; border-radius: 5px; color: #bdc5be; background: transparent; cursor: pointer; &:hover:not(:disabled) { color: #fff; background: #343b35; } &:disabled { opacity: .38; cursor: default; } }
.backButton { border: 1px solid #3b423c; background: #262b27; }
.exportButton, .secondaryButton, .wideButton { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 34px; padding: 0 14px; border: 1px solid #4f8c71; border-radius: 5px; color: #f5fbf6; background: #2b7253; font: inherit; font-weight: 600; cursor: pointer; &:hover:not(:disabled) { background: #33825f; } &:disabled { opacity: .45; cursor: default; } }
.editorBody { display: grid; grid-template-columns: 260px minmax(360px, 1fr) 245px; flex: 1 1 auto; min-height: 0; }
.mediaPanel, .inspectorPanel { min-height: 0; overflow: auto; background: #202421; }
.mediaPanel { display: grid; grid-template-columns: 60px minmax(0, 1fr); border-right: 1px solid #343a35; }
.sideTabs { display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 10px 5px; border-right: 1px solid #343a35; background: #1a1e1b; }
.sideTab { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; min-height: 56px; border: 0; border-radius: 5px; color: #929b94; background: transparent; font: inherit; font-size: 10px; cursor: pointer; &:hover { color: #e5eee6; background: #292f2a; } &.isActive { color: #9ed6b5; background: #2c4034; } }
.assetPanel, .textPanel, .settingsPanel { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 15px 12px 11px; }
.panelHeading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; h2 { margin: 0; color: #e3e8e3; font-size: 14px; font-weight: 650; } span { display: block; margin-top: 4px; color: #8d978f; font-size: 10px; } }
.assetFilters { display: flex; flex-direction: column; gap: 8px; margin-bottom: 9px; }
.assetFilters input, .textPanel textarea, .inspectorPanel input[type="number"], .inspectorPanel textarea, .settingsPanel select { width: 100%; min-width: 0; min-height: 32px; padding: 6px 8px; border: 1px solid #3d453e; border-radius: 4px; outline: none; color: #e3e8e3; background: #181c19; font: inherit; &:focus { border-color: #6eaa87; box-shadow: 0 0 0 2px rgb(112 172 137 / 17%); } }
.filterSwitch { display: flex; gap: 3px; padding: 3px; border-radius: 4px; background: #181c19; button { flex: 1; min-height: 25px; border: 0; border-radius: 3px; color: #8f9890; background: transparent; font: inherit; font-size: 10px; cursor: pointer; &.isActive { color: #d9e9de; background: #343c35; } } }
.hiddenInput { display: none; }
.assetList { display: flex; flex: 1; flex-direction: column; gap: 3px; min-height: 0; overflow-y: auto; }
.assetRow { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 7px 5px; border-radius: 4px; background: #272c28; cursor: grab; &:hover { background: #303732; } }
.assetIcon { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex: 0 0 34px; border-radius: 4px; color: #9dd9b6; background: #284234; &.audio { color: #e7c681; background: #4a4028; } }
.assetInfo { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; strong { overflow: hidden; color: #dce3dc; font-size: 11px; font-weight: 550; text-overflow: ellipsis; white-space: nowrap; } span { color: #8b958d; font-size: 10px; } }
.tinyAction { width: 27px; height: 27px; color: #aeb8b0; }
.assetEmpty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 130px; color: #79837b; text-align: center; font-size: 11px; }
.assetHint { padding: 8px; color: #a7b4aa; font-size: 11px; }
.dropHint { margin-top: 10px; padding: 9px 5px; border: 1px dashed #485249; border-radius: 4px; color: #929b94; text-align: center; font-size: 10px; cursor: pointer; &:hover { border-color: #77ae8e; color: #c7dbcc; } }
.textPanel, .settingsPanel { gap: 10px; }
.fieldLabel { display: flex; align-items: center; justify-content: space-between; margin-top: 7px; color: #aeb8b0; font-size: 11px; span { color: #7f8981; } }
.textPanel textarea, .inspectorPanel textarea { min-height: 76px; resize: vertical; }
.wideButton { width: 100%; margin-top: 4px; }
.featureNote { margin: 4px 0 0; color: #818b83; font-size: 10px; line-height: 1.5; }
.previewArea { display: flex; flex-direction: column; align-items: center; min-width: 0; min-height: 0; padding: 10px 18px 12px; background: #151816; }
.previewTopline { display: flex; align-items: center; justify-content: space-between; width: min(100%, 1080px); height: 30px; color: #aeb7af; font-size: 11px; }
.previewTitle { gap: 7px; }.previewDimensions { margin-left: 6px; color: #79837c; }.liveDot { width: 6px; height: 6px; border-radius: 50%; background: #71c794; box-shadow: 0 0 0 3px rgb(113 199 148 / 12%); }
.playheadReadout { color: #aeb8b0; font-variant-numeric: tabular-nums; }
.previewStage { position: relative; display: flex; align-items: center; justify-content: center; flex: 1; width: min(100%, 1080px); min-height: 120px; margin: 4px 0 11px; overflow: hidden; border: 1px solid #303631; background: #080a09; box-shadow: 0 10px 35px rgb(0 0 0 / 22%); }
.previewStage.ratio169 { aspect-ratio: 16 / 9; width: auto; height: 100%; max-height: 100%; }.previewStage.ratio916 { aspect-ratio: 9 / 16; width: auto; height: 100%; max-width: 100%; }.previewStage.ratio11 { aspect-ratio: 1 / 1; width: auto; height: min(100%, 680px); max-width: 100%; }.previewStage.ratio43 { aspect-ratio: 4 / 3; width: auto; height: min(100%, 760px); max-width: 100%; }
.previewVideo { display: block; width: 100%; height: 100%; object-fit: contain; }.previewEmpty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #727c74; font-size: 12px; pointer-events: none; }.previewText { position: absolute; right: 4%; bottom: 9%; left: 4%; color: #fff; font-size: 22px; font-weight: 600; line-height: 1.2; font-family: "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif; text-align: center; text-shadow: 0 2px 5px rgb(0 0 0 / 85%); white-space: pre-wrap; pointer-events: none; }.previewMessage { position: absolute; right: 12px; bottom: 12px; max-width: 80%; padding: 8px 10px; border: 1px solid #824d3d; border-radius: 4px; color: #ffd0bc; background: #442920; font-size: 11px; }.hiddenAudio { display: none; }
.transportBar { gap: 10px; width: min(100%, 1080px); height: 42px; flex: 0 0 42px; padding: 0 8px; border: 1px solid #303631; border-radius: 4px; background: #202421; }.transportButton { width: 30px; height: 30px; color: #b9c5bc; }.previewRange { flex: 1; accent-color: #79bd92; }.transportTime { min-width: 118px; color: #aeb7af; font-variant-numeric: tabular-nums; text-align: right; font-size: 10px; i { margin: 0 4px; color: #68726a; font-style: normal; } }
.inspectorPanel { padding: 16px 13px; border-left: 1px solid #343a35; }.inspectorPanel .panelHeading { margin-bottom: 20px; }.inspectorSection { padding: 10px 0; border-top: 1px solid #343a35; border-bottom: 1px solid #343a35; }.sectionLabel { color: #88938b; font-size: 10px; }.inspectorMeta { display: flex; align-items: center; gap: 8px; margin-top: 9px; color: #b1bbb3; font-size: 11px; }.kindMark { padding: 3px 6px; border-radius: 3px; color: #b8e2c7; background: #30483a; font-size: 9px; &.audio { color: #f0d593; background: #4a4028; } &.text { color: #ddd0ff; background: #393247; } }.inspectorPanel input[type="number"] { font-variant-numeric: tabular-nums; }.inspectorPanel input[type="range"] { width: 100%; accent-color: #83bf97; }.inspectorFooter { display: flex; justify-content: space-between; margin-top: 17px; padding-top: 12px; border-top: 1px solid #343a35; color: #929c94; font-size: 11px; strong { color: #dce4dc; font-variant-numeric: tabular-nums; } }.removeButton { display: inline-flex; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 33px; margin-top: 18px; border: 1px solid #65473f; border-radius: 4px; color: #e5a18d; background: #30231f; font: inherit; cursor: pointer; &:hover { background: #422b25; } }.inspectorEmpty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #7a857d; text-align: center; font-size: 11px; }.exportError { margin-top: 15px; padding: 9px; border: 1px solid #724a3b; border-radius: 4px; color: #ffd0bb; background: #3d2923; font-size: 10px; line-height: 1.45; overflow-wrap: anywhere; }
.timelinePanel { display: flex; flex: 0 0 330px; flex-direction: column; min-height: 230px; border-top: 1px solid #3a413b; background: #1d211e; }.timelineHeader { display: flex; align-items: center; justify-content: space-between; min-height: 46px; padding: 0 12px; border-bottom: 1px solid #323832; }.timelineActions { gap: 4px; }.timelineButton { width: 30px; height: 30px; border: 1px solid transparent; color: #a8b2aa; &.isActive { color: #a8ddb9; border-color: #506958; background: #2b4033; } &:hover:not(:disabled) { border-color: #424b43; } }.snapButton { gap: 5px; width: auto; padding: 0 7px; font: inherit; font-size: 10px; }.headerDivider { width: 1px; height: 20px; margin: 0 5px; background: #394039; }.timelineZoom { gap: 6px; color: #8e988f; font-size: 10px; input { width: 90px; accent-color: #78b78f; } }
.timelineViewport { position: relative; flex: 1; min-height: 0; overflow: auto; }.timelineCanvas { position: relative; min-height: 100%; padding-left: 112px; }.timelineRuler { position: sticky; top: 0; z-index: 3; display: flex; height: 28px; border-bottom: 1px solid #414841; background: #242925; cursor: pointer; }.rulerLabel, .trackLabel { position: absolute; left: -112px; display: flex; align-items: center; gap: 7px; width: 112px; padding-left: 12px; border-right: 1px solid #3b433c; color: #aab4ac; background: #222723; font-size: 10px; }.rulerLabel { top: 0; height: 27px; z-index: 4; }.rulerTicks { position: relative; flex: 1; height: 100%; }.rulerTick { position: absolute; top: 0; height: 100%; padding: 5px 0 0 5px; border-left: 1px solid #394039; color: #7f8981; font-size: 9px; font-variant-numeric: tabular-nums; pointer-events: none; }.timelineTrack { position: relative; height: 63px; border-bottom: 1px solid #343a35; background: #1b1f1c; }.timelineTrack.audio { background: #1d211d; }.timelineTrack.text { background: #1b1f1d; }.trackLabel { top: 0; height: 62px; z-index: 2; small { min-width: 17px; margin-left: auto; margin-right: 8px; color: #79837c; text-align: right; } }.trackContent { position: relative; height: 100%; }.timelineClip { position: absolute; top: 10px; display: flex; align-items: center; gap: 6px; height: 42px; min-width: 2px; padding: 0 9px; overflow: hidden; border: 1px solid #52745d; border-radius: 4px; color: #e6f1e8; background: #31513b; font: inherit; text-align: left; cursor: grab; touch-action: none; &:hover { filter: brightness(1.12); } &.isSelected { z-index: 2; border-color: #a3d5b0; box-shadow: 0 0 0 1px #a3d5b0; } &.audio { border-color: #8a7443; color: #f3e4bb; background: #554a2d; } &.text { border-color: #6c618a; color: #e1d8f4; background: #423950; } }.clipTitle { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }.clipDuration { flex: 0 0 auto; color: rgb(255 255 255 / 68%); font-size: 9px; font-variant-numeric: tabular-nums; }.trimHandle { position: absolute; top: 0; z-index: 1; width: 6px; height: 100%; background: rgb(255 255 255 / 22%); cursor: ew-resize; }.leftHandle { left: 0; }.rightHandle { right: 0; }.playhead { position: absolute; top: 0; bottom: 0; z-index: 5; width: 1px; background: #f08d62; pointer-events: none; }.playheadCap { position: absolute; top: 0; left: -5px; width: 11px; height: 10px; border-radius: 3px 3px 1px 1px; background: #f08d62; pointer-events: auto; cursor: ew-resize; }.playheadLine { position: absolute; top: 10px; bottom: 0; left: 0; border-left: 1px solid #f08d62; }.timelineEmpty { position: absolute; top: 67px; left: 50%; width: 280px; padding: 9px; border: 1px dashed #424a43; border-radius: 4px; color: #828c84; background: #202421; text-align: center; font-size: 10px; transform: translateX(-50%); pointer-events: none; }.timelineFooter { justify-content: space-between; gap: 12px; min-height: 26px; padding: 0 12px; color: #8d978f; font-size: 9px; }.timelineFooterNote { flex: 1; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; }
.noProject { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #a5b1a7; h1 { margin: 8px 0 0; color: #e0e6e0; font-size: 19px; } p { margin: 0 0 8px; color: #879189; font-size: 12px; } }.secondaryButton { border-color: #465149; color: #d0d8d1; background: #2a302b; &:hover:not(:disabled) { background: #353e37; } }
.exportOverlay { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; background: rgb(5 7 6 / 72%); }.exportDialog { display: flex; flex-direction: column; align-items: center; gap: 12px; width: min(340px, calc(100vw - 32px)); padding: 26px 24px 20px; border: 1px solid #414940; border-radius: 7px; background: #222723; box-shadow: 0 18px 70px rgb(0 0 0 / 42%); strong { color: #e5ece6; font-size: 14px; } span { min-height: 16px; color: #9daa9e; font-variant-numeric: tabular-nums; font-size: 11px; } .secondaryButton { margin-top: 3px; } }.exportSpinner { width: 30px; height: 30px; border: 3px solid #46534a; border-top-color: #8bc59d; border-radius: 50%; animation: spin 1s linear infinite; }.progressTrack { width: 100%; height: 5px; overflow: hidden; border-radius: 3px; background: #3a413b; i { display: block; height: 100%; border-radius: inherit; background: #79b78f; transition: width .2s ease; } }@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1150px) { .editorBody { grid-template-columns: 230px minmax(320px, 1fr) 215px; }.mediaPanel { grid-template-columns: 54px minmax(0, 1fr); } }
</style>

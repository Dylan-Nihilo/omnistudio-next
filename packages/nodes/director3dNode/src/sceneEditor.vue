<template>
  <uiDialog
    class="directorDialog"
    :title="result ? `3D 导演台 · ${result.name}` : '3D 导演台'"
    :modelValue="visible"
    width="min(1440px, calc(100vw - 40px))"
    :closeOnClickModal="false"
    :closeOnPressEscape="false"
    :beforeClose="closeEditor"
    @opened="nextTick(loadScene)"
    @closed="emit('close')">
    <div ref="workspace" class="directorWorkspace">
      <section class="stagePanel" aria-label="场景与镜头">
        <div class="viewport" :style="{ '--sceneAspect': sceneAspect }">
          <canvas
            :key="canvasKey"
            ref="canvas"
            class="sceneCanvas"
            :class="{ playing }"
            tabindex="0"
            aria-label="导演台场景"
            @click.left="toggleControl"
            @mousedown.right.prevent="addAnchor"
            @contextmenu.prevent
            @keydown="handleKeyDown"
            @keyup="handleKeyUp"
            @blur="exitControl"
            @wheel.prevent.stop="changeFocalLength" />
          <div v-if="captureFlash" :key="captureFlash" class="captureFlash" aria-hidden="true" @animationend="captureFlash = 0" />
          <div class="viewportInfo">
            <span>{{ playing ? "播放中" : controlling ? "" : "点击画布取景" }}</span>
            <span>{{ focalLength.toFixed(0) }} mm</span>
          </div>
          <div v-if="!ready" class="stageLoading">
            <icon-loader-2 class="loadingIcon" :size="24" />
            <span>正在载入场景</span>
          </div>
        </div>
        <div class="playbackBar">
          <uiPopover trigger="click" placement="top-start" :width="180">
            <template #reference="{ triggerAttrs }">
              <uiButton v-bind="triggerAttrs" variant="secondary" :icon="IconSettings" :disabled="!ready" aria-label="场景设置">设置</uiButton>
            </template>
            <div class="sceneSettingsPanel">
              <div class="settingRow">
                <span>网格</span>
                <uiSwitch :modelValue="sceneSettings.gridVisible" aria-label="显示网格" @change="sceneSettings = { ...sceneSettings, gridVisible: $event === true }" />
              </div>
              <div class="settingRow">
                <span>天空盒</span>
                <uiSwitch :modelValue="sceneSettings.skyVisible" aria-label="显示天空盒" @change="sceneSettings = { ...sceneSettings, skyVisible: $event === true }" />
              </div>
              <uiButton variant="secondary" :icon="IconUserPlus" :loading="addingMannequin" :disabled="!ready || addingMannequin || exportingVideo || !!exportingImage || tasks.some(task => !task.error)" @click="emit('addMannequin')">添加人偶</uiButton>
            </div>
          </uiPopover>
          <uiIconButton
            class="iconButton"
            :icon="playing ? IconPlayerPause : IconPlayerPlay"
            :disabled="!ready || !result"
            :label="playing ? '暂停影片' : '播放影片'"
            @click="togglePlayback" />
          <uiSlider
            :modelValue="currentTime"
            :max="result?.duration || 1"
            :step="0.01"
            :showTooltip="false"
            :disabled="!ready || !result"
            aria-label="影片播放进度"
            @pointerdown.capture="pausePlayback"
            @update:modelValue="seekTime" />
          <span class="timeLabel">{{ formatTime(currentTime) }} / {{ formatTime(result?.duration ?? 0) }}</span>
          <uiSelect :modelValue="aspectRatio" class="aspectSelect" inline :options="['16:9', '9:16', '4:3', '1:1'].map(value => ({ value, label: value }))" aria-label="画面比例" :disabled="!ready" @update:modelValue="value => typeof value === 'string' && (aspectRatio = value)" />
          <uiPopover trigger="click" placement="top" :width="340" @show="captureLightingReference">
            <template #reference="{ triggerAttrs }">
              <uiButton v-bind="triggerAttrs" variant="secondary" :icon="IconSun" :disabled="!ready" aria-label="光照设置">光照</uiButton>
            </template>
            <div class="lightingPanel">
              <div class="lightingRow"><span>全局光照 <small>无阴影</small></span><uiSwitch :modelValue="lighting.globalEnabled" aria-label="全局光照" @change="updateLighting({ globalEnabled: $event === true })" /></div>
              <uiField label="全局光照强度"><uiNumberInput :modelValue="lighting.globalIntensity" :min="0" :max="100" :step="0.1" :precision="2" aria-label="全局光照强度" @update:modelValue="$event != null && updateLighting({ globalIntensity: $event })" /></uiField>
              <div class="lightingRow"><span>太阳光 <small>有阴影</small></span><uiSwitch :modelValue="lighting.sunEnabled" aria-label="太阳光" @change="updateLighting({ sunEnabled: $event === true })" /></div>
              <template v-if="lighting.sunEnabled"><lightDirection v-model:azimuth="lightingDraft.azimuth" v-model:elevation="lightingDraft.elevation" :referenceAzimuth="lightingReference" @change="updateLighting" /><div class="lightingOutput"><uiField label="颜色"><uiColorPicker :modelValue="sunColor" aria-label="太阳光颜色" @change="$event && updateLighting({ color: $event })" /></uiField><uiField label="强度"><uiNumberInput :modelValue="lighting.intensity" :min="0" :max="100" :step="0.1" :precision="2" aria-label="太阳光强度" @update:modelValue="$event != null && updateLighting({ intensity: $event })" /></uiField></div></template>
            </div>
          </uiPopover>
          <uiButton variant="secondary" :icon="IconPlus" :disabled="!ready" aria-label="添加关键帧" @click="addAnchor">添加关键帧</uiButton>
          <uiButton variant="secondary" :icon="IconMovie" :disabled="!ready || !result || exportingVideo" :loading="exportingVideo" aria-label="导出视频节点" @click="emit('exportVideo', sceneAspect)">
            {{ exportingVideo ? `导出视频 ${exportProgress ?? 0}%` : '导出视频节点' }}
          </uiButton>
        </div>
        <div class="controlHint">WASD 移动 · 空格上升 · Shift 下降 · 滚轮调焦 · 右键记录 · 左键 / Esc 退出取景</div>
        <div class="referenceHeader">
          <span>
            关键帧
            <small>{{ anchors.length }}</small>
          </span>
          <small>拖动调整顺序</small>
        </div>
        <vue-draggable v-model="anchors" class="referenceList" direction="horizontal" handle=".referenceImage" :animation="150">
          <div v-for="(anchor, index) in anchors" :key="anchor.id" class="referenceItem" :class="{ selected: activeAnchorId === anchor.id }">
            <button class="referenceImage" type="button" :disabled="!ready" :aria-label="'查看关键帧 ' + (index + 1)" @click="restoreAnchor(anchor)">
              <img v-if="anchorPreviews[anchor.id]" :src="anchorPreviews[anchor.id]" alt="" draggable="false" />
              <icon-camera v-else :size="22" />
              <span>{{ String(index + 1).padStart(2, "0") }}</span>
            </button>
            <uiIconButton class="removeReference" variant="danger" :icon="IconX" :label="'删除关键帧 ' + (index + 1)" @click="removeAnchor(anchor.id)" />
            <uiIconButton class="exportReference" :icon="IconPhotoPlus" size="small" title="导出画布" :disabled="!ready || !!exportingImage" :loading="exportingImage === anchor.id" :label="'导出关键帧 ' + (index + 1) + ' 到画布'" @click="emit('exportImage', anchor, sceneAspect, anchor.time ?? currentTime)" />
          </div>
        </vue-draggable>
      </section>
      <directorPanel
        v-model:prompt="prompt"
        v-model:model="model"
        :result="result"
        :referenceCount="anchors.length"
        :plans="plans"
        :selectedPlanId="selectedPlanId"
        :tasks="tasks"
        :initializing="addingMannequin || !scene.objectList.length && tasks.some((task) => !task.error)"
        @selectPlan="selectPlan"
        :models="models"
        :modelsLoading="modelsLoading"
        @loadModels="emit('loadModels')"
        @send="emit('generate')"
        @editInstruction="emit('editInstruction', $event)">
        <template #input><slot name="input" /></template>
      </directorPanel>
    </div>
    <directorTour v-if="ready && visible" :root="workspace" />
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { uiDialog, uiButton, uiIconButton, uiSlider, uiSelect, uiPopover, uiSwitch, uiColorPicker, uiNumberInput, uiField, useUiFeedback } from "@toonflow/ui";
import { IconCamera, IconLoader2, IconPlayerPause, IconPlayerPlay, IconPlus, IconX, IconMovie, IconPhotoPlus, IconSun, IconSettings, IconUserPlus } from "@tabler/icons-vue";
import directorPanel from "./directorPanel.vue";
import directorTour from "./directorTour.vue";
import lightDirection from "./lightDirection.vue";
import { VueDraggable } from "vue-draggable-plus";
import { Color, Vector3 } from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { SceneRuntime } from "threejson/core";
import type { NodeAiModel } from "@toonflow/nodes-scaffold/runtime";
import { applyLighting, applySceneSettings, captureCamera, createStage, disposeStage, type LightingSettings, type SceneDocument, type SceneSettings } from "./scene";
import { anchorSchema, applyCamera, prepareMotion, sampleMotion, type CameraAnchor } from "./motion";
import { prepareSceneAnimation, type DirectorPlan, type DirectorPlanItem, type DirectorGeneration } from "./sceneAnimation";

const feedback = useUiFeedback();
const props = defineProps<{
  scene: SceneDocument;
  result?: DirectorPlan;
  plans: DirectorPlanItem[];
  selectedPlanId: string;
  tasks: DirectorGeneration[];
  models: NodeAiModel[];
  modelsLoading: boolean;
  addingMannequin: boolean;
  exportingVideo: boolean;
  exportingImage: string;
  exportProgress?: number;
}>();
const emit = defineEmits<{ editInstruction: [value: string]; selectPlan: [id: string]; generate: []; loadModels: []; close: []; addMannequin: []; exportVideo: [aspect: number]; exportImage: [anchor: CameraAnchor, aspect: number, time: number] }>();
const anchors = defineModel<CameraAnchor[]>("anchors", { default: () => [] });
const lighting = defineModel<LightingSettings>("lighting", { required: true });
const sceneSettings = defineModel<SceneSettings>("sceneSettings", { required: true });
const sunColor = computed(() => "#" + new Color(lighting.value.color).getHexString());
const lightingDraft = ref({ ...lighting.value });
const lightingReference = ref(0);
const prompt = defineModel<string>("prompt", { default: "" });
const model = defineModel<string>("model", { default: "" });
const anchorPreviews = ref<Record<string, string>>({});
const workspace = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const canvasKey = ref(0);
const ready = ref(false);
const visible = ref(true);
const manualCamera = ref(false);
const controlling = ref(false);
const playing = ref(false);
const aspectRatio = ref("16:9");
const sceneAspect = computed(() => {
  const [width, height] = aspectRatio.value.split(":").map(Number);
  return width! / height!;
});
const currentTime = ref(0);
const focalLength = ref(0);
const activeAnchorId = ref("");
const captureFlash = ref(0);
const pressedKeys = new Set<string>();
const moveKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight"]);
const focalSteps = [...Array.from({ length: 30 }, (_, index) => index + 6), 40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 110];
const movement = new Vector3();
let runtime: SceneRuntime | undefined;
let loadedScene: SceneDocument | undefined;
let controls: PointerLockControls | undefined;
let scenePlayer: ReturnType<typeof prepareSceneAnimation> | undefined;
let cameraFrames: ReturnType<typeof prepareMotion> | undefined;
let previousFrame = 0;
let loadVersion = 0;
let disposed = false;
let previewPlanId = "";

async function selectPlan(id: string) {
  previewPlanId = id;
  emit("selectPlan", id);
  await nextTick();
  previewSelectedPlan();
}

function previewSelectedPlan() {
  if (disposed || !ready.value || !props.result || previewPlanId !== props.selectedPlanId) return;
  previewPlanId = "";
  currentTime.value = 0;
  pausePlayback();
  togglePlayback();
}

async function loadScene() {
  if (!canvas.value) return;
  const version = ++loadVersion;
  const scene = props.scene;
  ready.value = false;
  playing.value = false;
  activeAnchorId.value = "";
  exitControl();
  releaseStage();
  canvasKey.value = version;
  try {
    await nextTick();
    if (disposed || version !== loadVersion || !canvas.value) return;
    const next = await createStage(canvas.value, scene, updateFrame, sceneAspect.value, lighting.value, sceneSettings.value);
    if (disposed || version !== loadVersion) return disposeStage(next);
    runtime = next;
    loadedScene = scene;
    updateAspect();
    controls = new PointerLockControls(runtime.camera, canvas.value);
    controls.addEventListener("change", () => runtime?.invalidate());
    controls.addEventListener("lock", () => {
      controlling.value = true;
      activeAnchorId.value = "";
    });
    controls.addEventListener("unlock", () => {
      controlling.value = false;
      pressedKeys.clear();
    });
    setAnimation();
    applyLighting(runtime, lighting.value);
    refreshThumbnails();
    sampleTime();
    runtime.start();
    ready.value = true;
    previewSelectedPlan();
  } catch (error) {
    if (!disposed && version === loadVersion) {
      releaseStage();
      feedback.message({ tone: "error", message: error instanceof Error ? error.message : "场景载入失败" });
    }
  }
}

function setAnimation() {
  if (!runtime) return;
  pausePlayback();
  exitControl();
  activeAnchorId.value = "";
  scenePlayer?.dispose();
  scenePlayer = undefined;
  cameraFrames = undefined;
  if (props.result) {
    scenePlayer = prepareSceneAnimation(runtime, props.result);
    cameraFrames = prepareMotion(props.result.cameraFrames);
  }
  currentTime.value = 0;
  previousFrame = performance.now();
  manualCamera.value = false;
  sampleTime();
}

function updateFrame() {
  if (playing.value || controlling.value) runtime?.invalidate();
  const now = performance.now();
  const elapsed = Math.max(0, (now - previousFrame) / 1000);
  previousFrame = now;
  if (playing.value && props.result) {
    currentTime.value = Math.min(props.result.duration, currentTime.value + elapsed);
    sampleTime();
    if (currentTime.value >= props.result.duration) playing.value = false;
  }
  if (!runtime || !controls?.isLocked || !pressedKeys.size) return;
  movement
    .set(
      Number(pressedKeys.has("KeyD")) - Number(pressedKeys.has("KeyA")),
      Number(pressedKeys.has("Space")) - Number(pressedKeys.has("ShiftLeft") || pressedKeys.has("ShiftRight")),
      Number(pressedKeys.has("KeyW")) - Number(pressedKeys.has("KeyS"))
    )
    .normalize()
    .multiplyScalar(Math.min(elapsed, 0.05) * 8);
  runtime.camera.updateMatrixWorld();
  controls.moveForward(movement.z);
  controls.moveRight(movement.x);
  runtime.camera.position.y += movement.y;
}

function sampleTime() {
  runtime?.invalidate();
  scenePlayer?.setTime(currentTime.value);
  if (runtime && !manualCamera.value && cameraFrames) sampleMotion(runtime.camera, cameraFrames, currentTime.value);
  if (runtime) focalLength.value = runtime.camera.getFocalLength();
}

async function toggleControl() {
  if (!ready.value || !canvas.value) return;
  if (controlling.value) return exitControl();
  pausePlayback();
  manualCamera.value = true;
  canvas.value.focus({ preventScroll: true });
  try {
    await canvas.value.requestPointerLock();
  } catch (error) {
    if (!disposed) feedback.message({ tone: "error", message: error instanceof Error ? error.message : "无法进入第一人称取景" });
  }
}
function exitControl() {
  pressedKeys.clear();
  controlling.value = false;
  if (document.pointerLockElement === canvas.value) document.exitPointerLock();
}
function handleKeyDown(event: KeyboardEvent) {
  if (event.code === "Escape") {
    event.preventDefault();
    return exitControl();
  }
  if (!controlling.value || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || !moveKeys.has(event.code)) return;
  event.preventDefault();
  event.stopPropagation();
  pressedKeys.add(event.code);
}
function handleKeyUp(event: KeyboardEvent) {
  if (moveKeys.has(event.code)) {
    event.preventDefault();
    pressedKeys.delete(event.code);
  }
}
function changeFocalLength(event: WheelEvent) {
  if (!runtime || !event.deltaY) return;
  pausePlayback();
  manualCamera.value = true;
  const current = runtime.camera.getFocalLength();
  const next =
    event.deltaY < 0
      ? focalSteps.find((value) => value > current + 0.000001) ?? focalSteps.at(-1)!
      : focalSteps.findLast((value) => value < current - 0.000001) ?? focalSteps[0]!;
  runtime.camera.setFocalLength(next);
  focalLength.value = runtime.camera.getFocalLength();
  activeAnchorId.value = "";
}
function pausePlayback() {
  playing.value = false;
}
function togglePlayback() {
  if (!ready.value || !props.result) return;
  if (playing.value) return pausePlayback();
  exitControl();
  manualCamera.value = false;
  if (currentTime.value >= props.result.duration) currentTime.value = 0;
  activeAnchorId.value = "";
  sampleTime();
  previousFrame = performance.now();
  playing.value = true;
}
function seekTime(value: number | number[]) {
  pausePlayback();
  exitControl();
  manualCamera.value = false;
  activeAnchorId.value = "";
  currentTime.value = Math.max(0, Math.min(props.result?.duration ?? 0, Array.isArray(value) ? value[0]! : value));
  sampleTime();
}
function formatTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

function updateAspect() {
  if (!runtime) return;
  const aspect = sceneAspect.value;
  runtime.renderer.setSize(Math.round(960 * Math.min(1, aspect)), Math.round(960 / Math.max(1, aspect)), false);
  runtime.camera.aspect = aspect;
  runtime.camera.updateProjectionMatrix();
  focalLength.value = runtime.camera.getFocalLength();
}
watch(sceneAspect, updateAspect);

function captureThumbnail() {
  const thumbnail = document.createElement("canvas");
  thumbnail.width = 192;
  thumbnail.height = Math.round(192 / sceneAspect.value);
  runtime!.renderer.render(runtime!.scene, runtime!.camera);
  thumbnail.getContext("2d")!.drawImage(runtime!.renderer.domElement, 0, 0, thumbnail.width, thumbnail.height);
  return thumbnail.toDataURL("image/jpeg", 0.75);
}
function refreshThumbnails() {
  if (!runtime) return;
  const view = captureCamera(runtime);
  anchorPreviews.value = {};
  for (const anchor of anchors.value) {
    scenePlayer?.setTime(anchor.time ?? 0);
    applyCamera(runtime.camera, anchor);
    anchorPreviews.value[anchor.id] = captureThumbnail();
  }
  scenePlayer?.setTime(currentTime.value);
  applyCamera(runtime.camera, view);
  runtime.invalidate();
}
function captureLightingReference() {
  pausePlayback();
  exitControl();
  if (!runtime) return;
  const forward = runtime.camera.getWorldDirection(new Vector3());
  // 俯拍或仰拍时从镜头右方向取水平朝向，避免正前方投影接近零。
  const right = new Vector3(1, 0, 0).applyQuaternion(runtime.camera.quaternion);
  const angle = Math.hypot(forward.x, forward.z) > 0.0001 ? Math.atan2(-forward.x, -forward.z) : Math.atan2(-right.z, right.x);
  lightingReference.value = (angle * 180 / Math.PI + 360) % 360;
}
function updateLighting(value: Partial<LightingSettings>) {
  lighting.value = { ...lighting.value, ...value };
}
watch(lighting, value => {
  lightingDraft.value = { ...value };
  if (!runtime) return;
  applyLighting(runtime, value);
  refreshThumbnails();
});
watch(sceneSettings, value => {
  if (!runtime) return;
  applySceneSettings(runtime, value);
  refreshThumbnails();
});
// 拖动时只更新灯光，松手后再保存参数并重新生成缩略图。
watch(() => [lightingDraft.value.azimuth, lightingDraft.value.elevation], ([azimuth, elevation]) => {
  if (runtime) applyLighting(runtime, { ...lighting.value, azimuth: azimuth!, elevation: elevation! });
});
function addAnchor() {
  if (!ready.value || !runtime) return;
  if (anchors.value.length >= 100) return void feedback.message({ tone: "warning", message: "最多记录 100 个关键帧" });
  pausePlayback();
  const anchor = anchorSchema.parse({ ...captureCamera(runtime), time: currentTime.value });
  anchorPreviews.value[anchor.id] = captureThumbnail();
  anchors.value = [...anchors.value, anchor];
  activeAnchorId.value = anchor.id;
  captureFlash.value++;
}
function restoreAnchor(anchor: CameraAnchor) {
  if (!runtime || !ready.value) return;
  pausePlayback();
  exitControl();
  manualCamera.value = true;
  if (anchor.time !== undefined) { currentTime.value = Math.min(props.result?.duration ?? 0, anchor.time); scenePlayer?.setTime(currentTime.value); }
  applyCamera(runtime.camera, anchor);
  focalLength.value = runtime.camera.getFocalLength();
  activeAnchorId.value = anchor.id;
  if (!anchorPreviews.value[anchor.id]) anchorPreviews.value[anchor.id] = captureThumbnail();
}
function removeAnchor(id: string) {
  delete anchorPreviews.value[id];
  anchors.value = anchors.value.filter((anchor) => anchor.id !== id);
  if (activeAnchorId.value === id) activeAnchorId.value = "";
}

function closeEditor() {
  pausePlayback();
  exitControl();
  visible.value = false;
}
function releaseStage() {
  controls?.dispose();
  controls = undefined;
  scenePlayer?.dispose();
  scenePlayer = undefined;
  cameraFrames = undefined;
  if (runtime) disposeStage(runtime);
  runtime = undefined;
}
function blurEditor() {
  pausePlayback();
  exitControl();
}
watch([currentTime, playing, controlling, sceneAspect, focalLength, activeAnchorId], () => runtime?.invalidate());
watch(
  () => [props.scene, props.result],
  () => {
    if (!ready.value || props.scene !== loadedScene) return void loadScene();
    try {
      setAnimation();
    } catch (error) {
      feedback.message({ tone: "error", message: error instanceof Error ? error.message : "动画载入失败" });
    }
  },
  { flush: "post" }
);
onMounted(() => {
  anchors.value = anchors.value.map((anchor) => anchorSchema.parse(anchor));
  emit("loadModels");
  window.addEventListener("blur", blurEditor);
  document.addEventListener("visibilitychange", blurEditor);
});
onBeforeUnmount(() => {
  disposed = true;
  ++loadVersion;
  blurEditor();
  releaseStage();
  window.removeEventListener("blur", blurEditor);
  document.removeEventListener("visibilitychange", blurEditor);
});
</script>

<style lang="scss" scoped>
.sceneSettingsPanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;

  .settingRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
}
.lightingPanel { display: flex; flex-direction: column; gap: 20px; max-height: min(440px, calc(100dvh - 80px)); overflow: auto; color: var(--uiTextBody); font-size: var(--uiFontControl); .lightingRow { display: flex; align-items: center; justify-content: space-between; gap: 16px; small { margin-left: 8px; color: var(--uiTextMuted); } } .lightingOutput { display: grid; grid-template-columns: minmax(72px, 1fr) minmax(160px, 2fr); gap: 16px; } }
.directorWorkspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 24px;
  height: min(760px, calc(100dvh - 176px));
  min-height: 0;
  .stagePanel {
    padding: 16px;
    border: 1px solid var(--uiBorderDefault);
    border-radius: var(--uiRadiusCard);
    background: var(--uiBackgroundSubtle);
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    .viewport {
      position: relative;
      display: grid;
      place-items: center;
      container-type: size;
      flex: 1;
      min-height: 180px;
      overflow: hidden;
      background: var(--uiBackgroundSubtle);
      .sceneCanvas,
      .captureFlash {
        width: min(100cqw, calc(100cqh * var(--sceneAspect)));
        height: min(100cqh, calc(100cqw / var(--sceneAspect)));
      }
      .sceneCanvas {
        display: block;
        object-fit: contain;
        touch-action: none;
        outline: 3px solid transparent;
        outline-offset: -3px;
        transition: outline-color 0.2s, box-shadow 0.2s;
        &.playing {
          outline-color: var(--uiActionPrimary);
          box-shadow: 0 0 18px color-mix(in srgb, var(--uiActionPrimary) 35%, transparent);
        }
      }
      .captureFlash {
        position: absolute;
        inset: 0;
        margin: auto;
        background: #fff;
        opacity: 0;
        pointer-events: none;
        animation: directorCapture 280ms ease-out;
        @media (prefers-reduced-motion: reduce) {
          background: transparent;
          box-shadow: inset 0 0 0 2px var(--uiActionPrimary);
          animation-timing-function: step-end;
        }
      }
      .viewportInfo {
        position: absolute;
        top: 14px;
        left: 16px;
        right: 16px;
        display: flex;
        justify-content: space-between;
        color: #fff;
        font-size: 11px;
        text-shadow: 0 1px 4px #000;
        pointer-events: none;
        font-variant-numeric: tabular-nums;
      }
      .stageLoading {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        align-items: center;
        justify-content: center;
        background: var(--uiSurfaceRaised);
        color: var(--uiTextMuted);
        font-size: 12px;
        .loadingIcon {
          animation: directorLoading 1s linear infinite;
        }
      }
    }
    .playbackBar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      flex-shrink: 0;
      .iconButton {
        width: 30px;
        height: 30px;
        padding: 0;
        margin: 0;
      }
      :deep(.uiSlider) {
        flex: 1;
        min-width: 0;
      }
      .timeLabel {
        color: var(--uiTextMuted);
        font-size: 11px;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .aspectSelect {
        width: 100px;
        flex-shrink: 0;
      }
      > .uiButton {
        margin: 0;
      }
    }
    .controlHint {
      color: var(--uiTextMuted);
      font-size: 11px;
      line-height: 1.6;
    }
    .referenceHeader {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 0 10px;
      font-size: 12px;
      color: var(--uiTextBody);
      small {
        color: var(--uiTextMuted);
        font-size: 11px;
        margin-left: 4px;
      }
    }
    .referenceList {
      display: flex;
      gap: 10px;
      min-height: 72px;
      flex-shrink: 0;
      overflow-x: auto;
      padding: 2px;
      scrollbar-width: thin;
      .referenceItem {
        position: relative;
        flex: 0 0 108px;
        height: 64px;
        border: 1px solid transparent;
        border-radius: var(--uiRadiusControl);
        overflow: hidden;
        &.selected {
          border-color: var(--uiActionPrimary);
        }
        .referenceImage {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 108px;
          height: 64px;
          border: 0;
          padding: 0;
          background: var(--uiSurfaceHover);
          color: var(--uiTextMuted);
          cursor: grab;
          img {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
          span {
            position: absolute;
            bottom: 5px;
            left: 7px;
            color: #fff;
            background: #0006;
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 10px;
          }
        }
        .removeReference {
          position: absolute;
          top: 3px;
          right: 3px;
          width: 22px;
          height: 22px;
          min-height: 22px;
          padding: 0;
          background: var(--uiSurfaceRaised);
          color: var(--uiTextBody);
          opacity: 0;
        }
        .exportReference {
          position: absolute; right: 3px; bottom: 3px; width: 22px; height: 22px; min-height: 22px; padding: 0; margin: 0; opacity: 0;
          background: var(--uiSurfaceRaised); color: var(--uiTextBody);
        }
        &:hover .exportReference, &:focus-within .exportReference { opacity: 1; }
        &:hover .removeReference,
        &:focus-within .removeReference {
          opacity: 1;
        }
      }
    }
  }
}
@keyframes directorCapture {
  from { opacity: 0.55; }
  to { opacity: 0; }
}
@keyframes directorLoading {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 1000px) {
  .directorWorkspace {
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 16px;
  }
}
@media (max-width: 760px) {
  .directorWorkspace {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(250px, 1fr) minmax(260px, 1fr);
    overflow-y: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .directorWorkspace .stagePanel .viewport .stageLoading .loadingIcon {
    animation: none;
  }
}
</style>

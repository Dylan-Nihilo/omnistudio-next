<template>
  <nodeSkeleton v-bind="nodeProps" style="width: 320px">
    <button type="button" class="directorContent nopan" :disabled="modelLoading" :title="modelError || undefined" aria-label="打开导演台" @dblclick.stop @click.stop="openEditor">
      <uiLoading v-if="modelLoading" loading class="modelLoading" label="载入模型" />
      <img v-if="preview" class="scenePreview" :src="preview" alt="最后镜头" draggable="false" />
      <div v-else class="emptyPreview">
        <icon-cube3d-sphere :size="38" stroke="1.2" />
      </div>
    </button>
  </nodeSkeleton>
  <sceneEditor v-if="editing" v-model:anchors="anchors" v-model:prompt="prompt" v-model:model="model" v-model:lighting="lighting" v-model:sceneSettings="sceneSettings"
    :scene="scene" :result="selectedPlan" :models="models" :modelsLoading="modelsLoading" :addingMannequin="addingMannequin"
    :plans="plans" :selectedPlanId="data.selectedPlanId ?? ''" :tasks="tasks"
    :exportingVideo="exportingVideo" :exportingImage="exportingImage" :exportProgress="exportProgress"
    @exportVideo="exportVideo" @exportImage="exportImage" @addMannequin="addMannequin"
    @selectPlan="data.selectedPlanId = $event" @loadModels="loadModels" @generate="generate" @editInstruction="setPrompt" @close="editing = false">
    <template #input>
      <referenceItem v-if="refList.length" v-model="refList" @preview="setReferencePreview" @remove="removeReference" />
      <promptInput v-model="promptModel" v-model:text="prompt" :references="referenceMentions" />
    </template>
  </sceneEditor>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { useVueFlow } from "@vue-flow/core";
import { IconCube3dSphere } from "@tabler/icons-vue";
import { uiLoading, useUiFeedback } from "@omnistudio-next/ui";
import { nodeSkeleton, nodeTools, useNode, useNodeFiles, useNodeReferences, z, type NodeHandle, type NodeData, type NodeAiModel } from "@omnistudio-next/nodes-scaffold/runtime";
import promptInput from "@omnistudio-next/nodes-scaffold/promptInput";
import referenceItem from "@omnistudio-next/nodes-scaffold/referenceItem";
import sceneEditor from "./sceneEditor.vue";
import { capturePreview, sceneSchema, lightingSchema, createEmptyScene, createMannequinObject, createStage, disposeStage, getSceneLighting, type LightingSettings, type SceneDocument, type SceneSettings } from "./scene";
import { createDirectorDraft, readSchema, editSchema } from "./agentTools";
import { directorPrompt } from "./agentPrompt";
import { anchorSchema, prepareMotion, sampleMotion, type CameraAnchor } from "./motion";
import { directorPlanSchema, prepareSceneAnimation, type DirectorPlan, type DirectorGeneration } from "./sceneAnimation";
import { renderImage, renderVideo } from "./renderMedia";

type PromptModel = NonNullable<InstanceType<typeof promptInput>["$props"]["modelValue"]>;
const modelDocumentSchema = z.strictObject({
  version: z.literal(1),
  scene: sceneSchema,
  plans: z.array(directorPlanSchema.safeExtend({ id: z.string().min(1), instruction: z.string().optional() })),
});
type ModelDocument = z.infer<typeof modelDocumentSchema>;
defineOptions({
  inheritAttrs: false,
  icon: IconCube3dSphere,
  handles: [{ id: "in", type: "target", dataType: ["STRING", "IMAGE", "VIDEO"], label: "文本、图片、视频输入" }] satisfies NodeHandle[],
});
const { node, nodeProps, previewReady, ai, files, nodeEvent } = useNode({ label: "3D导演台" });
const feedback = useUiFeedback();
const { addNodes, findNode, getNodes, nodeTypes, removeNodes } = useVueFlow();
const mediaFiles = useNodeFiles();
const exportingVideo = ref(false);
const exportingImage = ref("");
const exportProgress = ref(0);
const exportController = new AbortController();
nodeEvent.on("delete", () => { if (toolEditing.value || exportingVideo.value || exportingImage.value) throw new Error("正在导出，请完成后再删除导演节点"); });
const data = computed(() => node.data as typeof node.data & {
  modelPath?: string;
  modelSnapshot?: ModelDocument;
  lighting?: LightingSettings;
  sceneSettings?: SceneSettings;
  prompt?: string;
  promptModel?: PromptModel;
  model?: string;
  anchors?: CameraAnchor[];
  selectedPlanId?: string;
});
const { refList, referenceMentions, setReferencePreview, removeReference } = useNodeReferences();
const promptModel = computed({ get: () => data.value.promptModel ?? [], set: (value: PromptModel) => { data.value.promptModel = value; } });
const anchors = computed({ get: () => data.value.anchors ?? [], set: (value: CameraAnchor[]) => { data.value.anchors = value; } });
const prompt = computed({ get: () => data.value.prompt ?? "", set: (value: string) => { data.value.prompt = value; } });
const model = computed({ get: () => data.value.model ?? "", set: (value: string) => { data.value.model = value; } });
// ACT: 场景和动画只在节点内部持有，画布数据仅保存文件引用，避免拖动时遍历大量关键帧。
const modelDocument = shallowRef<ModelDocument>({ version: 1, scene: createEmptyScene(), plans: [] });
const plans = computed(() => modelDocument.value.plans);
const selectedPlan = computed(() => plans.value.find(plan => plan.id === data.value.selectedPlanId));
const scene = computed(() => modelDocument.value.scene);
const lighting = computed({ get: () => ({ ...getSceneLighting(scene.value), ...data.value.lighting }), set: (value: LightingSettings) => { data.value.lighting = value; } });
const sceneSettings = computed({ get: () => ({ gridVisible: true, skyVisible: true, ...data.value.sceneSettings }), set: (value: SceneSettings) => { data.value.sceneSettings = value; } });
const editing = ref(false);
const tasks = ref<DirectorGeneration[]>([]);
const modelsLoading = ref(false);
const models = ref<NodeAiModel[]>([]);
const selectedModel = computed(() => models.value.find(item => JSON.stringify([item.providerId, item.modelId]) === model.value));
const preview = ref("");
let previewVersion = 0;
const modelLoading = ref(true);
const modelError = ref("");
const addingMannequin = ref(false);
const toolEditing = ref(false);
let modelSaving = Promise.resolve();
let disposed = false;
onBeforeUnmount(() => { disposed = true; exportController.abort(new Error("导演节点已关闭，导出已停止")); });

function getModelPath() {
  if (!node.id || /[\\/]/.test(node.id) || node.id === "." || node.id === "..") throw new Error("节点 ID 不能作为文件夹名称");
  return `assets/${node.id}/model.json`;
}

async function writeModel(workspaceFiles: ReturnType<typeof files.getWorkspaceFiles>, value: ModelDocument) {
  const path = getModelPath();
  for (const directory of ["assets", `assets/${node.id}`]) {
    await workspaceFiles.mkdir(directory).catch((error: { response?: { data?: { data?: { code?: string } } } }) => {
      if (error.response?.data?.data?.code !== "EEXIST") throw error;
    });
  }
  await workspaceFiles.writeJson(path, value);
  return path;
}

async function loadModel() {
  modelLoading.value = true;
  modelError.value = "";
  try {
    const { modelPath, modelSnapshot } = data.value;
    if (!modelPath && !modelSnapshot) return;
    const workspaceFiles = files.getWorkspaceFiles();
    if (modelPath && modelPath !== getModelPath()) throw new Error("导演台模型文件路径无效");
    const value = modelDocumentSchema.parse(modelSnapshot ?? await workspaceFiles.readJson(modelPath!));
    if (disposed) return;
    // 复制、跨画布粘贴时只传递一次快照，写入新节点目录成功后才移除快照。
    if (modelSnapshot) {
      const path = await writeModel(workspaceFiles, value);
      if (disposed) return;
      data.value.modelPath = path;
      delete data.value.modelSnapshot;
    }
    modelDocument.value = value;
    if (!selectedPlan.value) data.value.selectedPlanId = value.plans[0]?.id;
  } catch (error) {
    modelError.value = error instanceof Error ? error.message : "模型文件读取失败";
    if (!disposed) feedback.message({ tone: "error", message: `导演台加载失败：${modelError.value}` });
  } finally {
    modelLoading.value = false;
  }
}

let modelReady = loadModel();
async function openEditor() {
  if (modelError.value) modelReady = loadModel();
  await modelReady;
  if (!disposed && !modelError.value) editing.value = true;
}

async function addMannequin() {
  if (modelLoading.value || modelError.value || toolEditing.value || addingMannequin.value || exportingVideo.value || exportingImage.value || tasks.value.some(task => !task.error)) return;
  addingMannequin.value = true;
  try {
    const workspaceFiles = files.getWorkspaceFiles();
    const saving = modelSaving.then(async () => {
      if (disposed) return;
      const current = scene.value;
      const object = createMannequinObject(crypto.randomUUID());
      const mannequins = current.objectList.filter(item => item.objType === "mannequin");
      object.position.x = mannequins.length ? Math.max(...mannequins.map(item => item.position.x)) + 1 : 0;
      const nextScene: SceneDocument = { ...current, objectList: [...current.objectList, object] };
      if (!current.objectList.length) {
        nextScene.sceneConfig = {
          ...current.sceneConfig,
          camera: { ...current.sceneConfig.camera, position: { x: 3, y: 2.2, z: 4 } },
          controls: { target: { x: 0, y: 0.9, z: 0 } },
        };
      }
      const value: ModelDocument = { ...modelDocument.value, scene: sceneSchema.parse(nextScene) };
      const path = await writeModel(workspaceFiles, value);
      if (disposed) return;
      modelDocument.value = value;
      data.value.modelPath = path;
    });
    modelSaving = saving.catch(() => {});
    await saving;
  } catch (error) {
    if (!disposed) feedback.message({ tone: "error", message: error instanceof Error ? error.message : "人偶添加失败" });
  } finally {
    addingMannequin.value = false;
  }
}

nodeEvent.on("copy", async () => {
  await nodeEvent.emit("save");
  if (modelError.value) throw new Error(`导演台模型未加载，无法复制：${modelError.value}`);
  return { modelPath: undefined, modelSnapshot: modelDocument.value };
});

nodeEvent.on("save", async (reason) => {
  await modelReady;
  let pending: Promise<void>;
  do {
    pending = modelSaving;
    await pending;
  } while (pending !== modelSaving);
  if (reason === "reload" && (toolEditing.value || exportingVideo.value || exportingImage.value || tasks.value.some(task => !task.error))) {
    throw new Error("导演台正在生成或导出，请完成后再刷新节点");
  }
});

async function exportToCanvas(kind: "image" | "video", key: string, aspect: number, render: (signal: AbortSignal) => Promise<File>, signal = exportController.signal) {
  if (toolEditing.value || exportingVideo.value || exportingImage.value) return;
  const type = `remote-${kind}Node`;
  if (!nodeTypes?.value?.[type]) return void feedback.message({ tone: "error", message: `请先启用${kind === "image" ? "图片" : "视频"}节点插件` });
  if (kind === "video") { exportingVideo.value = true; exportProgress.value = 0; }
  else exportingImage.value = key;
  const id = crypto.randomUUID();
  let exportNode: ReturnType<typeof findNode<NodeData & { exportProgress?: number }>>;
  let discarded = false;
  let committed = false;
  let uploadStarted = false;
  let stopWatching = () => {};
  let workspaceFiles: ReturnType<typeof files.getWorkspaceFiles> | undefined;
  function addExportNode(label: string) {
    const width = 240 * aspect + 18;
    const x = node.computedPosition.x + (node.dimensions.width || 320) + 80;
    let y = node.computedPosition.y;
    for (const other of [...getNodes.value].sort((a, b) => a.computedPosition.y - b.computedPosition.y)) {
      const position = other.computedPosition;
      if (position.x < x + width && position.x + (other.dimensions.width || 320) > x && position.y < y + 320 && position.y + (other.dimensions.height || 300) > y) {
        y = position.y + (other.dimensions.height || 300) + 24;
      }
    }
    addNodes({ id, type, position: { x, y }, data: { label, outputs: {} } });
    return findNode(id)!;
  }
  try {
    workspaceFiles = files.getWorkspaceFiles();
    if (kind === "video") {
      exportNode = addExportNode(selectedPlan.value?.name ?? "视频");
      // ACT: 导出进度只在当前运行中使用，不能写入画布或复制到另一个节点。
      Object.defineProperty(exportNode.data, "exportProgress", { value: 0, writable: true, configurable: true });
      stopWatching = watch([() => findNode(id), exportProgress], ([current, progress]) => {
        if (current !== exportNode) discarded = true;
        if (!discarded) exportNode!.data.exportProgress = progress;
      }, { flush: "sync" });
    }
    const file = await render(signal);
    signal.throwIfAborted();
    if (discarded) return;
    uploadStarted = true;
    const path = await mediaFiles.uploadFile(id, file);
    signal.throwIfAborted();
    if (discarded) return;
    if (findNode(node.id) !== node || !nodeTypes?.value?.[type]) throw new Error("画布节点已变化，请重新导出");
    exportNode ??= addExportNode(file.name.replace(/\.[^.]+$/, ""));
    // 更新已有输出对象，让已挂载的视频节点及连接它的节点同步收到结果。
    (exportNode.data.outputs ??= {})[kind] = {
      dataType: kind === "image" ? "IMAGE" : "VIDEO", value: { url: path, mimeType: file.type },
    };
    committed = true;
    if (kind === "video") exportProgress.value = 100;
    feedback.message({ tone: "success", message: `${kind === "image" ? "图片" : "视频"}已导出到画布` });
    return { nodeId: id, path, mimeType: file.type };
  } catch (error) {
    if (!disposed && !discarded) feedback.message({ tone: "error", message: error instanceof Error ? error.message : "导出失败，请重试" });
    if (exportNode && findNode(id) === exportNode) removeNodes(id);
    return { error: error instanceof Error ? error.message : "导出失败" };
  } finally {
    stopWatching();
    if (exportNode) delete exportNode.data.exportProgress;
    if (uploadStarted && !committed) {
      try { await workspaceFiles!.remove(`assets/${id}`, true); }
      catch (cleanupError) {
        const code = (cleanupError as { response?: { data?: { data?: { code?: string } } } })?.response?.data?.data?.code;
        if (!disposed && code !== "ENOENT") feedback.message({ tone: "error", message: "导出中断，临时素材清理失败" });
      }
    }
    if (kind === "video") exportingVideo.value = false;
    else exportingImage.value = "";
  }
}

function exportVideo(aspect: number, signal = exportController.signal) {
  const plan = selectedPlan.value;
  if (!plan) return;
  return exportToCanvas("video", "video", aspect, signal => renderVideo(scene.value, plan, aspect, signal, value => { exportProgress.value = value; }, lighting.value, sceneSettings.value), signal);
}

function exportImage(anchor: CameraAnchor, aspect: number, time: number, signal = exportController.signal) {
  const name = `关键帧${anchors.value.findIndex(item => item.id === anchor.id) + 1}`;
  return exportToCanvas("image", anchor.id, aspect, async signal => {
    const file = await renderImage(scene.value, anchor, aspect, time, signal, selectedPlan.value, lighting.value, sceneSettings.value);
    return new File([file], `${name}.png`, { type: file.type });
  }, signal);
}

async function loadModels() {
  if (modelsLoading.value) return;
  modelsLoading.value = true;
  try {
    const available = await ai.getModels();
    if (disposed) return;
    models.value = available;
    const first = models.value[0];
    // ACT: 只给空配置选默认模型，保留暂时不可用的旧选择。
    if (!model.value) model.value = first ? JSON.stringify([first.providerId, first.modelId]) : "";
  } catch (error) {
    if (!disposed) feedback.message({ tone: "error", message: error instanceof Error ? error.message : "模型加载失败" });
  } finally {
    modelsLoading.value = false;
  }
}

async function renderPreview(scene: SceneDocument, plan: DirectorPlan | undefined, lighting: LightingSettings, settings: SceneSettings) {
  const runtime = await createStage(document.createElement("canvas"), scene, undefined, undefined, lighting, settings);
  let player: ReturnType<typeof prepareSceneAnimation> | undefined;
  try {
    if (plan) {
      player = prepareSceneAnimation(runtime, plan);
      player.setTime(plan.duration);
      sampleMotion(runtime.camera, prepareMotion(plan.cameraFrames), plan.duration);
    }
    return capturePreview(runtime);
  } finally {
    player?.dispose();
    disposeStage(runtime);
  }
}

const planPreviews = new WeakMap<DirectorPlan, { scene: SceneDocument; lighting: LightingSettings; settings: SceneSettings; image: string }>();
watch([scene, selectedPlan, lighting, sceneSettings, modelLoading, previewReady], async ([value, plan, light, settings, loading, ready]) => {
  const version = ++previewVersion;
  preview.value = "";
  if (!ready || loading || modelError.value) return;
  try {
    const cached = plan && planPreviews.get(plan);
    const image = cached?.scene === value && JSON.stringify(cached.lighting) === JSON.stringify(light) && JSON.stringify(cached.settings) === JSON.stringify(settings) ? cached.image : await renderPreview(value, plan, light, settings);
    if (plan) planPreviews.set(plan, { scene: value, lighting: light, settings, image });
    if (!disposed && version === previewVersion) preview.value = image;
  } catch (error) {
    if (!disposed && version === previewVersion) feedback.message({ tone: "error", message: error instanceof Error ? error.message : "预览生成失败" });
  }
}, { immediate: true });

function setPrompt(value: string) {
  prompt.value = value;
  promptModel.value = value ? value.split("\n").map(text => [{ type: "Write", text }]) : [];
}

async function saveDirectorDraft(
  draft: ReturnType<typeof createDirectorDraft>, task: { id: string; instruction: string },
  baseScene: SceneDocument, basePlanId: string, workspaceFiles: ReturnType<typeof files.getWorkspaceFiles>,
  beforeSave?: () => Promise<void>,
) {
  const result = draft.read();
  const nextScene = draft.sceneChanged ? result.scene : baseScene;
  const plan = { ...result.plan, id: task.id, instruction: task.instruction };
  // 工具仅编辑草稿；完成后验证实际渲染，成功落盘才替换当前方案。
  const previewLighting = { ...getSceneLighting(nextScene), ...data.value.lighting };
  const previewSettings = sceneSettings.value;
  const image = await renderPreview(nextScene, plan, previewLighting, previewSettings);
  if (disposed) return;
  // 动画请求可以并行生成，同一模型文件顺序保存，写入成功后才替换当前场景。
  const saving = modelSaving.then(async () => {
    if (disposed) return;
    await beforeSave?.();
    if (scene.value !== baseScene) throw new Error("基础模型已被另一条指令更新，请基于当前模型重试。");
    const objects = new Map(nextScene.objectList.map(object => [object.threeJsonId, object]));
    const previousPlans = draft.sceneChanged
      ? plans.value.map(item => ({ ...item, tracks: item.tracks.filter(track => objects.has(track.objectId) && (!track.joint || objects.get(track.objectId)?.objType === "mannequin")) }))
      : plans.value;
    const value: ModelDocument = { version: 1, scene: nextScene, plans: [...previousPlans, plan] };
    const path = await writeModel(workspaceFiles, value);
    if (disposed) return;
    planPreviews.set(plan, { scene: nextScene, lighting: previewLighting, settings: previewSettings, image });
    modelDocument.value = value;
    data.value.modelPath = path;
    if ((data.value.selectedPlanId ?? "") === basePlanId) data.value.selectedPlanId = plan.id;
  });
  modelSaving = saving.catch(() => {});
  await saving;
  return plan.id;
}

async function generate() {
  if (modelLoading.value || modelError.value || toolEditing.value || addingMannequin.value) return;
  const choice = selectedModel.value;
  const requirement = prompt.value.trim();
  if (!choice || !requirement) return;
  // 首次创建基础模型期间只接收一个请求，后续动画可并行生成。
  if (!scene.value.objectList.length && tasks.value.some(task => !task.error)) return;
  const baseScene = scene.value;
  const basePlanId = data.value.selectedPlanId ?? "";
  const task = { id: crypto.randomUUID(), instruction: requirement };
  tasks.value = [...tasks.value, task];
  setPrompt("");
  try {
    const workspaceFiles = files.getWorkspaceFiles();
    if (refList.value.some(item => item.value === undefined)) throw new Error("引用节点暂无内容，请先补充引用内容");
    const mediaReferences = refList.value
      .filter(item => item.value !== undefined && (item.dataType === "STRING" || item.dataType === "IMAGE" || item.dataType === "VIDEO"))
      .map(item => item.dataType === "STRING" ? { dataType: item.dataType, value: item.value } : { dataType: item.dataType, value: { ...item.value } });
    const references = anchors.value.map((value, index) => {
      const { camera, controls } = anchorSchema.parse(value);
      return { order: index + 1, camera, controls };
    });
    const basePlan = selectedPlan.value;
    const draft = createDirectorDraft(
      JSON.parse(JSON.stringify(baseScene)),
      basePlan ? directorPlanSchema.parse({ name: basePlan.name, duration: basePlan.duration, tracks: basePlan.tracks, cameraFrames: basePlan.cameraFrames }) : undefined,
      JSON.parse(JSON.stringify(plans.value)),
    );
    const directory = mediaReferences.some(item => item.dataType !== "STRING") ? (await workspaceFiles.list()).directory : undefined;
    if (disposed) return;
    await ai.generate({
      references: mediaReferences,
      providerId: choice.providerId,
      modelId: choice.modelId,
      systemPrompt: directorPrompt,
      prompt: JSON.stringify({ instruction: requirement, references, selectedPlanId: basePlanId, document: draft.summary() }),
      directory,
      tools: draft.tools,
    });
    if (disposed) return;
    if (!draft.edited) throw new Error("Agent 未修改方案，原方案未修改，请重试。");
    await saveDirectorDraft(draft, { id: task.id, instruction: requirement }, baseScene, basePlanId, workspaceFiles);
    tasks.value = tasks.value.filter(item => item.id !== task.id);
  } catch (error) {
    if (!disposed) tasks.value = tasks.value.map(item => item.id === task.id ? { ...item, error: error instanceof Error ? error.message : "生成失败，请重试" } : item);
  }
}
async function directorReady(signal?: AbortSignal) {
  await modelReady;
  await modelSaving;
  signal?.throwIfAborted();
  if (disposed || modelError.value) throw new Error(modelError.value || "导演节点已关闭");
}

function directorIdle() {
  if (toolEditing.value || addingMannequin.value || exportingVideo.value || exportingImage.value || tasks.value.some(task => !task.error)) {
    throw new Error("导演台正在编辑、生成或导出，请等待完成");
  }
}

function currentDraft() {
  const plan = selectedPlan.value;
  return createDirectorDraft(
    JSON.parse(JSON.stringify(scene.value)),
    plan ? directorPlanSchema.parse({ name: plan.name, duration: plan.duration, tracks: plan.tracks, cameraFrames: plan.cameraFrames }) : undefined,
    JSON.parse(JSON.stringify(plans.value)),
  );
}

async function directorRevision() {
  const snapshot = JSON.stringify({ document: modelDocument.value, selectedPlanId: data.value.selectedPlanId, anchors: anchors.value, lighting: lighting.value, settings: sceneSettings.value });
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshot));
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
}

async function checkDirectorRevision(revision: string, signal?: AbortSignal) {
  if (revision !== await directorRevision()) throw new Error("导演方案已变化，请重新读取后编辑");
  signal?.throwIfAborted();
  if (disposed) throw new Error("导演节点已关闭");
}

nodeTools.register({
  name: "getDirectorState",
  description: "读取3D导演台摘要、方案历史、取景锚点、视图设置、忙碌状态及revision；不触发AI或媒体生成。编辑前先取得revision。",
  parameters: z.strictObject({}),
  async execute(_args, { signal }) {
    await directorReady(signal);
    return { ...currentDraft().summary(), revision: await directorRevision(), selectedPlanId: data.value.selectedPlanId ?? null, modelPath: data.value.modelPath ?? null, anchors: JSON.parse(JSON.stringify(anchors.value)), lighting: lighting.value, sceneSettings: sceneSettings.value, busy: toolEditing.value || addingMannequin.value || exportingVideo.value || !!exportingImage.value || tasks.value.some(task => !task.error) };
  },
});

nodeTools.register({
  name: "readDirectorDocument",
  description: "读取导演台当前scene、plan、只读history或schema；复用导演草稿的objectId/joint/path定位。schema用于查询真实场景与动画字段，禁止猜测。",
  parameters: readSchema,
  async execute(args, { signal }) {
    await directorReady(signal);
    return currentDraft().tools[0]!.execute(args, signal);
  },
});

nodeTools.register({
  name: "editDirectorDocument",
  description: "按revision原子编辑scene/plan，必须一次形成完整合法方案；校验并实际渲染成功后保存为新方案，保留历史。所有方案共用scene，场景编辑会影响历史方案，删除物体会清除其历史轨道。不调用AI、不扣生成积分。",
  parameters: editSchema.extend({ revision: z.string().regex(/^[a-f0-9]{64}$/), instruction: z.string().max(2000).default("MCP导演编辑") }),
  async execute({ revision, instruction, operations }, { signal }) {
    await directorReady(signal);
    directorIdle();
    await checkDirectorRevision(revision, signal);
    directorIdle();
    toolEditing.value = true;
    try {
      const baseScene = scene.value;
      const basePlanId = data.value.selectedPlanId ?? "";
      const workspace = files.getWorkspaceFiles();
      const draft = currentDraft();
      await draft.tools[1]!.execute({ operations }, signal);
      draft.read();
      const planId = await saveDirectorDraft(draft, { id: crypto.randomUUID(), instruction }, baseScene, basePlanId, workspace, () => checkDirectorRevision(revision, signal));
      if (!planId || disposed) throw new Error("导演节点已关闭，未能完成编辑");
      return { planId, revision: await directorRevision(), modelPath: data.value.modelPath, ...currentDraft().summary() };
    } finally { toolEditing.value = false; }
  },
});

nodeTools.register({
  name: "setDirectorView",
  description: "按revision选择已有方案、保存取景锚点、调整光照或设置网格/天空可见性，不修改场景及动画。锚点camera/controls描述取景，time为预览时刻。",
  parameters: z.strictObject({ revision: z.string().regex(/^[a-f0-9]{64}$/), planId: z.string().min(1).optional(), anchors: z.array(anchorSchema).max(120).optional(), lighting: lightingSchema.partial().optional(), gridVisible: z.boolean().optional(), skyVisible: z.boolean().optional() }),
  async execute(args, { signal }) {
    await directorReady(signal);
    directorIdle();
    await checkDirectorRevision(args.revision, signal);
    directorIdle();
    const plan = args.planId ? plans.value.find(item => item.id === args.planId) : selectedPlan.value;
    if (args.planId && !plan) throw new Error("方案不存在");
    if (args.anchors && (new Set(args.anchors.map(anchor => anchor.id)).size !== args.anchors.length || args.anchors.some(anchor => (anchor.time ?? 0) > (plan?.duration ?? 0)))) throw new Error("锚点ID重复或时间超过方案时长");
    if (args.planId) data.value.selectedPlanId = args.planId;
    if (args.anchors) anchors.value = args.anchors;
    if (args.lighting) lighting.value = { ...lighting.value, ...args.lighting };
    const settings = { ...sceneSettings.value };
    if (args.gridVisible !== undefined) settings.gridVisible = args.gridVisible;
    if (args.skyVisible !== undefined) settings.skyVisible = args.skyVisible;
    sceneSettings.value = settings;
    return { revision: await directorRevision(), selectedPlanId: data.value.selectedPlanId, anchors: JSON.parse(JSON.stringify(anchors.value)), lighting: lighting.value, sceneSettings: settings };
  },
});

nodeTools.register({
  name: "exportDirectorImage",
  description: "将指定锚点在指定时刻的3D画面导出为真实PNG图片节点，返回nodeId/path/mimeType；不调用图片模型。先用getDirectorState读取锚点，time默认锚点时间。",
  parameters: z.strictObject({ anchorId: z.string().min(1), aspect: z.number().min(0.25).max(4).default(16 / 9), time: z.number().min(0).max(300).optional() }),
  async execute({ anchorId, aspect, time }, { signal }) {
    await directorReady(signal);
    directorIdle();
    const anchor = anchors.value.find(item => item.id === anchorId);
    if (!anchor) throw new Error("取景锚点不存在");
    const at = time ?? anchor.time ?? 0;
    if (at > (selectedPlan.value?.duration ?? 0)) throw new Error("导出时间超过方案时长");
    const result = await exportImage(anchor, aspect, at, signal ? AbortSignal.any([signal, exportController.signal]) : exportController.signal);
    if (!result || "error" in result) throw new Error(result?.error || "关键帧未导出");
    return result;
  },
});

nodeTools.register({
  name: "exportDirectorVideo",
  description: "将当前方案渲染为3D预演MP4并添加视频节点，不调用视频模型。需要页面可见且浏览器支持MP4；耗时约等于方案时长，MCP导出限90秒。",
  parameters: z.strictObject({ aspect: z.number().min(0.25).max(4).default(16 / 9) }),
  async execute({ aspect }, { signal }) {
    await directorReady(signal);
    directorIdle();
    if (!selectedPlan.value || selectedPlan.value.duration > 90) throw new Error("请选择不超过90秒的预演方案");
    const result = await exportVideo(aspect, signal ? AbortSignal.any([signal, exportController.signal]) : exportController.signal);
    if (!result || "error" in result) throw new Error(result?.error || "预演视频未导出");
    return result;
  },
});
</script>

<style scoped lang="scss">
.directorContent {
  position: relative;
  .modelLoading { position: absolute; inset: 0; pointer-events: none; }
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  cursor: pointer;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  color: var(--uiTextBody);
  background: var(--uiBackgroundSubtle);
  border-radius: var(--uiRadiusControl);
  &:focus-visible { outline: 2px solid var(--uiActionPrimary); outline-offset: 2px; }

  .scenePreview {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .emptyPreview {
    display: flex;
    height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--uiTextMuted);
  }

}
</style>

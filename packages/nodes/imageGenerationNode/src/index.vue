<template>
  <nodeSkeleton
    v-bind="nodeProps"
    v-model:bottomVisible="node.selected"
    :topVisible="node.selected"
    topWidth="max-content"
    :downloadUrl="previewUrl"
    :downloadName="outputFile?.url.split(/[\\/]/).at(-1)"
    @fullscreen="previewVisible = true"
    :bottomWidth="660"
    :style="{ width: previewUrl && imageWidth ? `${imageWidth + 18}px` : undefined }">
    <template #topActions>
      <mediaHistory mediaType="image" :current="outputFile" :disabled="generating || deleting || uploading" @select="outputs.image = { dataType: 'IMAGE', value: $event }" />
      <uiIconButton :icon="IconTransfer" :loading="uploading" :disabled="generating || deleting" title="替换图片" label="替换图片" @click.stop="fileInput?.click()" />
      <input ref="fileInput" type="file" accept="image/*" hidden aria-label="选择替换图片" :disabled="generating || deleting || uploading" @change="replaceOutput" />
    </template>
    <div class="imageContent nopan" :aria-busy="generating || uploading">
      <uiLoading v-if="generating || uploading" loading class="generationOverlay" :label="uploading ? '替换图片中' : '生成图片中'" />
      <img
        v-if="previewUrl"
        class="imagePreview"
        :src="previewUrl"
        draggable="false"
        alt="生成图片"
        @load="resizeImage"
        @error="showNodeError('无法预览该图片', '图片预览失败')" />
      <div v-else class="imageEmpty" role="img" aria-label="暂无生成图片">
        <icon-photo-ai :size="48" stroke="1.25" aria-hidden="true" />
      </div>
    </div>
    <template #bottom>
      <section class="promptCard">
        <referenceItem
          v-if="refList.length"
          v-model="refList"
          @preview="setReferencePreview"
          @remove="removeReference" />
        <promptInput v-model="data.promptModel" v-model:text="data.prompt" :references="referenceMentions" />
        <div class="promptFooter">
          <div class="modelChoice"><icon-sparkles :size="17" /><uiSelect :modelValue="data.model" :options="modelGroups.flatMap(provider => provider.models.map(item => ({ group: provider.label, label: item.label, value: JSON.stringify([item.providerId, item.modelId]) })))" filterable :loading="modelsLoading" :disabled="generating || deleting" placeholder="选择模型" aria-label="生成模型" noDataText="请先在设置中添加图片模型" @update:modelValue="value => typeof value === 'string' && (data.model = value)" @visibleChange="visible => visible && loadModels().catch(error => showNodeError(error, '模型读取失败'))" /></div>
          <generationSettings
            v-model:size="data.size"
            v-model:ratio="data.ratio"
            :sizes="sizeOptions"
            :ratios="ratioOptions"
            :disabled="generating || deleting || !selectedModel" />
          <uiIconButton
            variant="primary"
            class="sendButton"
            :icon="generating ? IconPlayerStop : IconArrowUp"
            :disabled="deleting || uploading || (!generating && (!generationPrompt || !selectedModel))"
            :title="generating ? '停止生成' : '生成图片'"
            :label="generating ? '停止生成' : '生成图片'"
            @click="generating ? generationController?.abort() : startGeneration().catch((error) => showNodeError(error, '图片生成失败'))" />
        </div>
      </section>
    </template>
  </nodeSkeleton>
  <uiImageViewer v-if="previewUrl" v-model="previewVisible" :urls="[previewUrl]" title="生成图片" />
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onScopeDispose, ref, watch } from "vue";
import { uiIconButton, uiSelect, uiLoading, uiImageViewer } from "@toonflow/ui";
import { IconPhotoAi, IconSparkles, IconArrowUp, IconPlayerStop, IconTransfer } from "@tabler/icons-vue";
import { groupNodeModels, nodeSkeleton, nodeTools, useNodeError, useNode, useNodeGeneration, useNodeReferences, z, type NodeMediaModel, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import promptInput from "@toonflow/nodes-scaffold/promptInput";
import referenceItem from "@toonflow/nodes-scaffold/referenceItem";
import mediaHistory from "@toonflow/nodes-scaffold/mediaHistory";
import generationSettings from "./components/generationSettings.vue";

defineOptions({
  inheritAttrs: false,
  icon: IconPhotoAi,
  handles: [
    { id: "in", type: "target", dataType: ["IMAGE", "STRING"], label: "图片、文本输入" },
    { id: "image", type: "source", dataType: "IMAGE", label: "图片输出" },
  ] satisfies NodeHandle[],
});
const showNodeError = useNodeError();
const { id, node, nodeProps, nodeEvent, outputs, files, ai, updateNodeInternals } = useNode({
  label: "图片生成",
});
type PromptModel = NonNullable<InstanceType<typeof promptInput>["$props"]["modelValue"]>;
const data = computed(() => node.data as { prompt: string; promptModel: PromptModel; model: string; size: string; ratio: string });
data.value.prompt ??= "";
data.value.promptModel ??= [];
data.value.model ??= "";
data.value.size ??= "";
data.value.ratio ??= "16:9";
const { refList, referenceMentions, setReferencePreview, removeReference } = useNodeReferences();
const models = ref<NodeMediaModel[]>([]);
const modelsLoading = ref(false);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement>();
let disposed = false;
const deleting = ref(false);
const previewVisible = ref(false);
const imageWidth = ref(0);
let generationController: AbortController | undefined;
const generationState = useNodeGeneration(outputs, () => generationController?.abort());
const { generating } = generationState;
let generation: Promise<void> | undefined;
let modelsRequest: Promise<void> | undefined;
const selectedModel = computed(() => models.value.find((item) => JSON.stringify([item.providerId, item.modelId]) === data.value.model));
const sizeOptions = computed(() => (selectedModel.value?.imageSizes?.length ? selectedModel.value.imageSizes : ["2K"]));
const ratioOptions = computed(() => (selectedModel.value?.imageRatios?.length ? selectedModel.value.imageRatios : ["16:9"]));
watch(
  selectedModel,
  (choice) => {
    if (!choice) return;
    // ACT: 现有分辨率使用 K 单位；出现其他单位时再统一换算，未知名称排在数值选项之后。
    if (!sizeOptions.value.includes(data.value.size)) data.value.size = sizeOptions.value.toSorted((left, right) =>
      (Number.parseFloat(left) || Infinity) - (Number.parseFloat(right) || Infinity)
    )[0]!;
    if (!ratioOptions.value.includes(data.value.ratio)) data.value.ratio = ratioOptions.value.includes("16:9") ? "16:9" : ratioOptions.value[0]!;
  },
  { flush: "sync" }
);
const modelGroups = computed(() => groupNodeModels(models.value));
const generationPrompt = computed(() =>
  [
    data.value.prompt.trim(),
    ...refList.value.flatMap((item, index) => (item.dataType === "STRING" && item.value?.trim() ? [`参考 ${index + 1}：\n${item.value.trim()}`] : [])),
  ]
    .filter(Boolean)
    .join("\n\n")
);
const outputFile = computed(() => outputs.value.image?.dataType === "IMAGE" ? outputs.value.image.value : undefined);
const previewUrl = files.useFileUrl(
  outputFile,
  (error) => showNodeError(error, "图片读取失败")
);

onMounted(() => loadModels().catch((error) => showNodeError(error, "模型读取失败")));
onScopeDispose(() => {
  disposed = true;
  generationController?.abort();
});

async function replaceOutput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || generating.value || deleting.value || uploading.value || disposed) return;
  if (!file.type.startsWith("image/")) return void showNodeError("请选择图片文件", "图片替换失败");
  if (!file.size || file.size > 100 * 1024 * 1024) return void showNodeError("图片不能为空且不能超过 100 MB", "图片替换失败");
  uploading.value = true;
  try {
    const workspace = files.getWorkspaceFiles();
    const url = await files.uploadFile(file);
    if (disposed) {
      await workspace.remove(url);
      return;
    }
    // ACT: 保留历史输出文件，避免破坏撤销记录和复制节点的引用。
    outputs.value.image = { dataType: "IMAGE", value: { url, mimeType: file.type } };
  } catch (error) {
    showNodeError(error, "图片替换失败");
  } finally {
    uploading.value = false;
  }
}

function loadModels() {
  if (modelsRequest) return modelsRequest;
  modelsLoading.value = true;
  modelsRequest = ai.getMediaModels().then((items) => {
    if (generating.value || deleting.value) return;
    models.value = items.filter((item) => item.type === "image");
    // ACT: 只给空配置选默认模型，保留暂时不可用的旧选择及其参数。
    if (!data.value.model) {
      const first = models.value[0];
      data.value.model = first ? JSON.stringify([first.providerId, first.modelId]) : "";
    }
  }).finally(() => {
    modelsLoading.value = false;
    modelsRequest = undefined;
  });
  return modelsRequest;
}

async function startGeneration() {
  const choice = selectedModel.value;
  if (generating.value) throw new Error("图片正在生成，请等待完成");
  if (uploading.value) throw new Error("图片正在替换，请等待完成");
  if (deleting.value) throw new Error("节点正在删除");
  if (!choice) throw new Error("请先选择图片模型");
  if (!generationPrompt.value) throw new Error("请输入生成提示词");
  if (refList.value.some(item => item.value === undefined)) throw new Error("引用节点暂无内容，请先补充引用内容");
  const workspace = files.getWorkspaceFiles();
  const controller = new AbortController();
  const input = {
    providerId: choice.providerId,
    modelId: choice.modelId,
    prompt: generationPrompt.value,
    size: data.value.size,
    ratio: data.value.ratio,
    outputDirectory: `assets/${id}`,
    images: refList.value.flatMap((item) => (item.dataType === "IMAGE" && item.value ? [{ path: item.value.url, mimeType: item.value.mimeType }] : [])),
  };
  generationController = controller;
  // ACT: 工具立即返回，任务由节点持有，停止或卸载时取消。
  generation = generationState.run(() => workspace
    .list()
    .then(({ directory }) => {
      controller.signal.throwIfAborted();
      return ai.generateImage({ ...input, directory }, controller.signal);
    })
    .then(([result]) => {
      controller.signal.throwIfAborted();
      if (!result) throw new Error("供应商未返回图片");
      outputs.value.image = { dataType: "IMAGE", value: { url: result.path, mimeType: result.mimeType } };
    }))
    .catch((error) => showNodeError(error, "图片生成失败"))
    .finally(() => {
      generationController = undefined;
    });
  return { status: "generating" };
}

nodeEvent.on("save", (reason) => {
  if (reason === "reload" && (generating.value || uploading.value || deleting.value)) throw new Error("图片处理中，请完成后再刷新节点");
});
nodeEvent.on("delete", async () => {
  if (uploading.value) throw new Error("图片正在替换，请稍后删除节点");
  deleting.value = true;
  generationController?.abort();
  try {
    await generation;
    await files.removeNodeFiles();
  } finally {
    deleting.value = false;
  }
});

async function resizeImage(event: Event) {
  const image = event.currentTarget as HTMLImageElement;
  if (!image.naturalWidth || !image.naturalHeight) return;
  imageWidth.value = (240 * image.naturalWidth) / image.naturalHeight;
  await nextTick();
  updateNodeInternals();
}

function getConfig() {
  return {
    config: {
      providerId: selectedModel.value?.providerId ?? "",
      modelId: selectedModel.value?.modelId ?? "",
      size: data.value.size,
      ratio: data.value.ratio,
    },
    models: models.value,
  };
}

nodeTools.register({
  name: "getConfig",
  description: "读取此图片生成节点的当前模型、分辨率、比例及可选图片模型能力，不含密钥；未声明分辨率或比例时分别使用 2K、16:9",
  parameters: z.strictObject({}),
  async execute(_args, { signal }) {
    signal?.throwIfAborted();
    await loadModels();
    signal?.throwIfAborted();
    return getConfig();
  },
});

nodeTools.register({
  name: "setConfig",
  description: "修改此图片生成节点的模型、分辨率或比例；先用 getConfig 查询可选能力，providerId 与 modelId 必须同时提供；不修改提示词、不启动生成",
  parameters: z.strictObject({
    providerId: z.string().min(1).optional(),
    modelId: z.string().min(1).optional(),
    size: z.string().min(1).optional(),
    ratio: z.string().min(1).optional(),
  }).refine((args) => (args.providerId === undefined) === (args.modelId === undefined), "providerId 与 modelId 必须同时提供"),
  async execute(args, { signal }) {
    signal?.throwIfAborted();
    if (generating.value || deleting.value) throw new Error("节点正在生成或删除，请稍后修改配置");
    await loadModels();
    signal?.throwIfAborted();
    if (generating.value || deleting.value) throw new Error("节点正在生成或删除，请稍后修改配置");
    const choice = args.modelId === undefined ? selectedModel.value
      : models.value.find((item) => item.providerId === args.providerId && item.modelId === args.modelId);
    if (!choice) throw new Error("请选择 getConfig 返回的有效图片模型");
    const sizes = choice.imageSizes?.length ? choice.imageSizes : ["2K"];
    const ratios = choice.imageRatios?.length ? choice.imageRatios : ["16:9"];
    if (args.size !== undefined && !sizes.includes(args.size)) throw new Error(`当前模型不支持分辨率 ${args.size}，可选：${sizes.join("、")}`);
    if (args.ratio !== undefined && !ratios.includes(args.ratio)) throw new Error(`当前模型不支持比例 ${args.ratio}，可选：${ratios.join("、")}`);
    data.value.model = JSON.stringify([choice.providerId, choice.modelId]);
    if (args.size !== undefined) data.value.size = args.size;
    if (args.ratio !== undefined) data.value.ratio = args.ratio;
    return getConfig();
  },
});

nodeTools.register({
  name: "setPrompt",
  description: "修改此节点的图片生成提示词，支持 {{ref 1}} 等参考标记；只修改提示词，不启动生成",
  parameters: z.strictObject({ prompt: z.string() }),
  execute({ prompt: value }) {
    if (deleting.value) throw new Error("节点正在删除，请稍后修改");
    data.value.prompt = value;
    data.value.promptModel = value.split("\n").map((text) => [{ type: "Write", text }]);
    return { prompt: value };
  },
});

nodeTools.register({
  name: "generateImage",
  description: "启动此节点的后台图片生成，使用当前提示词、模型、分辨率、比例和参考图片；立即返回已开始，用 getGenerationStatus 查询完成结果，cancelGeneration 停止生成",
  parameters: z.strictObject({}),
  execute(_args, { signal }) {
    signal?.throwIfAborted();
    return startGeneration();
  },
});
</script>

<style scoped lang="scss">
.imageContent { position: relative; display: grid; place-items: center; min-height: 144px; overflow: hidden; border-radius: var(--uiRadiusControl); .generationOverlay { position: absolute; inset: 0; z-index: 1; pointer-events: none; } .imageEmpty { display: grid; place-items: center; min-height: 144px; color: var(--uiTextMuted); } .imagePreview { display: block; width: 100%; max-height: 240px; object-fit: contain; border-radius: var(--uiRadiusControl); } }
.promptCard { display: flex; flex-direction: column; gap: 16px; padding: 20px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusCard); background: var(--uiSurfaceRaised); box-shadow: var(--uiShadowPopover); .referenceHint { color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; } .promptFooter { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding-top: 12px; border-top: 1px solid var(--uiBorderDefault); .modelChoice { display: flex; flex: 1; align-items: center; gap: 8px; min-width: 180px; color: var(--uiTextMuted); :deep(.uiPopover) { flex: 1; min-width: 0; } } .sendButton { margin-left: auto; } } }
</style>

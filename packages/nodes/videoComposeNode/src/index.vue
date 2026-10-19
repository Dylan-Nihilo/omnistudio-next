<template>
  <nodeSkeleton
    v-bind="nodeProps"
    v-model:bottomVisible="node.selected"
    :topVisible="node.selected"
    topWidth="max-content"
    :downloadUrl="composing ? '' : previewUrl"
    :downloadName="outputFile?.url.split(/[\\/]/).at(-1)"
    :bottomWidth="600"
    :style="{ width: previewUrl && videoWidth ? `${Math.max(280, videoWidth + 18)}px` : undefined }"
    @fullscreen="player?.enterFullscreen()">
    <template #topActions>
      <mediaHistory mediaType="video" :current="outputFile" :disabled="composing" @select="outputs.video = { dataType: 'VIDEO', value: $event }" />
    </template>
    <div class="videoContent nopan" :aria-busy="composing">
      <div v-if="composing" class="composeLoading" role="status" aria-label="视频拼接合成中">
        <uiProgress type="circle" :percentage="progressPercent ?? 0" :width="64" :strokeWidth="3" aria-label="视频拼接进度" />
        <span class="loadingText">{{ progressPercent !== undefined ? `正在拼接视频 (${progressPercent}%)` : "正在拼接视频..." }}</span>
      </div>
      <videoPlayer
        v-else-if="previewUrl"
        ref="player"
        :src="previewUrl"
        label="合成视频"
        @loadedmetadata="resizeVideo" />
      <div v-else class="videoEmpty" role="img" aria-label="暂无拼接视频">
        <icon-movie :size="48" stroke="1.25" aria-hidden="true" />
        <span class="emptyHint">{{ refList.length >= 2 ? "准备就绪，点击下方合成视频" : "请至少连接 2 个视频片段进行拼接" }}</span>
      </div>
    </div>
    <template #bottom>
      <section class="composeCard">
        <header class="composeHeader">
          <span class="headerTitle">拼接片段列表 ({{ refList.length }})</span>
          <span class="headerTip">可拖拽卡片调整片段先后顺序</span>
        </header>
        <referenceItem
          v-if="refList.length"
          v-model="refList"
          @preview="setReferencePreview"
          @remove="removeReference" />
        <div v-else class="emptyReferences">
          <span>暂无连接的输入片段，请将上游视频节点的输出连入「视频片段输入」端口</span>
        </div>
        <footer class="composeFooter">
          <div class="footerInfo">
            <span v-if="errorMessage" class="errorText">{{ errorMessage }}</span>
            <span v-else-if="refList.length < 2" class="statusTip">至少需要 2 个视频片段</span>
            <span v-else class="statusTip ready">已就绪 {{ refList.length }} 个片段</span>
          </div>
          <div class="footerActions">
            <uiButton
              v-if="composing"
              variant="secondary"
              @click="cancelComposition">
              取消拼接
            </uiButton>
            <uiButton
              v-else
              variant="primary"
              :disabled="refList.length < 2"
              @click="startComposition().catch(showError)">
              开始拼接视频
            </uiButton>
          </div>
        </footer>
      </section>
    </template>
  </nodeSkeleton>
</template>

<script setup lang="ts">
import { computed, nextTick, onScopeDispose, ref } from "vue";
import { IconMovie } from "@tabler/icons-vue";
import { uiButton, uiProgress, useUiFeedback } from "@omnistudio-next/ui";
import { nodeSkeleton, nodeTools, useNode, useNodeReferences, z, type NodeHandle } from "@omnistudio-next/nodes-scaffold/runtime";
import videoPlayer from "@omnistudio-next/nodes-scaffold/videoPlayer";
import referenceItem from "@omnistudio-next/nodes-scaffold/referenceItem";
import mediaHistory from "@omnistudio-next/nodes-scaffold/mediaHistory";
import { composeVideos } from "./composeVideos";

const feedback = useUiFeedback();

defineOptions({
  inheritAttrs: false,
  icon: IconMovie,
  handles: [
    { id: "videos", type: "target", dataType: "VIDEO", label: "视频片段输入" },
    { id: "video", type: "source", dataType: "VIDEO", label: "合成视频输出" },
  ] satisfies NodeHandle[],
});

const { id, node, nodeProps, nodeEvent, outputs, files, ffmpeg } = useNode({
  label: "视频拼接",
});

const player = ref<InstanceType<typeof videoPlayer>>();
const videoWidth = ref(0);
const composing = ref(false);
const progressPercent = ref<number | undefined>(undefined);
const errorMessage = ref("");
let currentAbortController: AbortController | null = null;

const { refList, setReferencePreview, removeReference } = useNodeReferences("videos");

nodeEvent.on("canConnect", (connection) => {
  if (connection.targetHandle === "videos" && refList.value.length >= 32) {
    return false;
  }
  return true;
});

const outputFile = computed(() => (outputs.value.video?.dataType === "VIDEO" ? outputs.value.video.value : undefined));
const previewUrl = files.useFileUrl(outputFile, (err) => showError(err, "合成视频读取失败"));

function resizeVideo(event: Event) {
  const target = event.target as HTMLVideoElement;
  if (target?.videoWidth) {
    videoWidth.value = target.videoWidth;
  }
}

function showError(err: unknown, fallback = "拼接视频失败") {
  const msg = err instanceof Error ? err.message : fallback;
  errorMessage.value = msg;
  feedback.message({ tone: "error", message: msg });
}

function cancelComposition() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  composing.value = false;
  progressPercent.value = undefined;
}

nodeEvent.on("save", (reason) => {
  if (reason === "reload" && composing.value) {
    throw new Error("视频正在拼接合成中，请稍后刷新");
  }
});

nodeEvent.on("delete", async () => {
  cancelComposition();
  return files.removeNodeFiles();
});

onScopeDispose(() => {
  cancelComposition();
});

async function startComposition(order?: string[], externalSignal?: AbortSignal) {
  if (composing.value) {
    throw new Error("视频正在拼接中，请勿重复操作");
  }

  if (order && order.length > 0) {
    const currentSources = refList.value.map(item => item.source);
    const currentSet = new Set(currentSources);
    const orderSet = new Set(order);
    if (order.length !== currentSources.length || order.some(item => !currentSet.has(item)) || [...currentSet].some(item => !orderSet.has(item))) {
      throw new Error("传入的 order 顺序必须与当前已连接的上游节点完全一致");
    }
    const orderMap = new Map(order.map((sourceId, index) => [sourceId, index]));
    refList.value = [...refList.value].sort((a, b) => (orderMap.get(a.source) ?? 999) - (orderMap.get(b.source) ?? 999));
    await nextTick();
  }

  const validInputs: string[] = [];
  for (const item of refList.value) {
    if (item.dataType === "VIDEO" && item.value && typeof item.value === "object" && "url" in item.value) {
      validInputs.push(String(item.value.url));
    }
  }

  if (validInputs.length < 2) {
    throw new Error(`至少需要 2 个已产出视频的有效输入片段（当前有效片段: ${validInputs.length}）`);
  }

  const workspaceFiles = files.getWorkspaceFiles();
  const outputDir = `assets/${id}`;
  try {
    await workspaceFiles.mkdir(outputDir);
  } catch {
    // 忽略目录已存在
  }

  const outputFileName = `combined-${crypto.randomUUID()}.mp4`;
  const outputPath = `${outputDir}/${outputFileName}`;

  const controller = new AbortController();
  currentAbortController = controller;
  const mergedSignal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;

  composing.value = true;
  progressPercent.value = undefined;
  errorMessage.value = "";

  try {
    const ffmpegFactory = await ffmpeg(mergedSignal);
    await composeVideos(
      ffmpegFactory,
      validInputs,
      outputPath,
      mergedSignal,
      (progress) => {
        if (typeof progress.percent === "number") {
          progressPercent.value = Math.min(100, Math.max(0, Math.round(progress.percent)));
        }
      },
    );

    const newOutputValue = { url: outputPath, mimeType: "video/mp4" };
    outputs.value.video = {
      dataType: "VIDEO",
      value: newOutputValue,
    };
    feedback.message({ tone: "success", message: `成功拼接 ${validInputs.length} 个视频片段！` });
    return { status: "succeeded", output: outputs.value.video };
  } catch (err) {
    try {
      await workspaceFiles.remove(outputPath);
    } catch {
      // 忽略清理临时输出的错误
    }
    showError(err, "视频拼接失败");
    throw err;
  } finally {
    composing.value = false;
    progressPercent.value = undefined;
    if (currentAbortController === controller) {
      currentAbortController = null;
    }
  }
}

nodeTools.register({
  name: "composeVideos",
  description: "按当前连接或 order 指定的上游节点顺序，将至少两个视频片段合成为一个 MP4；不会裁剪、转场或修改源文件",
  parameters: z.strictObject({
    order: z.array(z.string().min(1).max(128)).min(2).max(32).optional(),
  }),
  async execute({ order }, { signal }) {
    return startComposition(order, signal);
  },
});
</script>

<style lang="scss" scoped>
.videoContent {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  position: relative;
  background: var(--uiSurfaceApp);
  border-radius: var(--uiRadiusControl);
  overflow: hidden;

  .composeLoading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px;
    .loadingText {
      color: var(--uiTextPrimary);
      font-size: var(--uiFontControl);
      font-weight: 500;
    }
  }

  .videoEmpty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 32px 16px;
    color: var(--uiTextMuted);
    .emptyHint {
      font-size: var(--uiFontControl);
      text-align: center;
    }
  }
}

.composeCard {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background: var(--uiSurfaceApp);
  border-radius: var(--uiRadiusControl);

  .composeHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    .headerTitle {
      font-size: var(--uiFontLabel);
      font-weight: 600;
      color: var(--uiTextPrimary);
    }
    .headerTip {
      font-size: var(--uiFontControl);
      color: var(--uiTextMuted);
    }
  }

  .emptyReferences {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: var(--uiSurfaceBase);
    border: 1px dashed var(--uiBorderDefault);
    border-radius: var(--uiRadiusControl);
    color: var(--uiTextMuted);
    font-size: var(--uiFontControl);
    text-align: center;
  }

  .composeFooter {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 8px;
    border-top: 1px solid var(--uiBorderDefault);

    .footerInfo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: var(--uiFontControl);

      .errorText {
        color: var(--uiStateDangerText);
      }
      .statusTip {
        color: var(--uiTextMuted);
        &.ready {
          color: var(--uiActionPrimary);
        }
      }
    }

    .footerActions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }
}
</style>

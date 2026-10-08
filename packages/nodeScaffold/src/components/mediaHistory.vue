<template>
  <uiIconButton :icon="IconHistory" :disabled="disabled" title="历史记录" label="历史记录" @click.stop="visible = true" />
  <uiDialog v-model="visible" :title="`${mediaType === 'image' ? '图片' : '视频'}历史记录`" :width="960" destroyOnClose>
    <div class="mediaHistory nodrag nopan nowheel" @pointerdown.stop @mousedown.stop @dblclick.stop @keydown.stop>
      <uiLoading v-if="loading" loading label="读取历史记录" /><uiAlert v-else-if="loadError" :title="loadError" tone="error" />
      <uiEmpty v-else-if="!items.length" description="暂无历史记录" />
      <template v-else-if="items.length">
        <div class="historyContent">
          <div class="historyList" aria-label="历史文件">
            <button
              v-for="item in pageItems"
              :key="item.url"
              type="button"
              class="historyItem"
              :class="{ selected: selected?.url === item.url }"
              :aria-pressed="selected?.url === item.url"
              :title="item.url"
              @click="selected = item">
              <span class="fileName">{{ item.url.split('/').at(-1) }}</span>
              <span v-if="item.url === current?.url.replaceAll('\\', '/')" class="currentLabel">当前结果</span>
            </button>
          </div>
          <div class="historyPreview"><uiLoading v-if="selected && !previewReady && !previewError" loading class="previewLoading" label="加载预览" />
            <uiAlert v-if="previewError" :title="previewError" tone="error" />
            <img v-else-if="previewUrl && mediaType === 'image'" :src="previewUrl" alt="历史图片预览" @load="previewReady = true" @error="previewError = '无法预览该图片'" />
            <uiMediaPlayer v-else-if="previewUrl" :src="previewUrl" label="历史视频预览" @loadeddata="previewReady = true" @error="previewError = '无法预览该视频'" />
          </div>
        </div>
        <uiPagination v-model:currentPage="page" :pageSize="pageSize" :total="items.length" hideOnSinglePage label="历史记录分页" />
      </template>
    </div>
    <template #footer>
      <uiButton variant="secondary" @click="visible = false">关闭</uiButton>
      <uiButton :disabled="disabled || loading || !selected || !previewUrl || !previewReady || !!previewError" @click="selectOutput">设为当前结果</uiButton>
    </template>
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useNode } from "@vue-flow/core";
import { uiIconButton, uiDialog, uiButton, uiLoading, uiAlert, uiEmpty, uiPagination, uiMediaPlayer } from "@toonflow/ui";
import { IconHistory } from "@tabler/icons-vue";
import { useNodeFiles } from "../workspaceFiles";
import type { NodeMediaValue } from "../values";

const props = defineProps<{ mediaType: "image" | "video"; current?: NodeMediaValue; disabled?: boolean }>();
const emit = defineEmits<{ select: [value: NodeMediaValue] }>();
const { id } = useNode();
const files = useNodeFiles();
const visible = ref(false);
const loading = ref(false);
const loadError = ref("");
const previewError = ref("");
const previewReady = ref(false);
const items = ref<NodeMediaValue[]>([]);
const selected = ref<NodeMediaValue>();
const page = ref(1);
const pageSize = 20;
const pageItems = computed(() => items.value.slice((page.value - 1) * pageSize, page.value * pageSize));
const mimeTypes: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
  avif: "image/avif", apng: "image/apng", bmp: "image/bmp", svg: "image/svg+xml", ico: "image/x-icon", tif: "image/tiff", tiff: "image/tiff",
  mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska", avi: "video/x-msvideo", ogv: "video/ogg",
};
const previewFile = computed(() => visible.value ? selected.value : undefined);
watch(previewFile, () => { previewError.value = ""; }, { flush: "sync" });
// ACT: 目录列表仅保存路径，每页显示 20 条，只读取选中文件；海量目录需服务端分页时再扩展 list。
const previewUrl = files.useFileUrl(previewFile, () => { previewError.value = "历史文件读取失败，文件可能已被移动或删除"; });
watch([previewFile, previewUrl], () => { previewReady.value = false; }, { flush: "sync" });

watch(() => props.disabled, disabled => { if (disabled) visible.value = false; });
watch(visible, async (open, _previous, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  items.value = [];
  selected.value = undefined;
  loadError.value = "";
  page.value = 1;
  if (!open) return;
  loading.value = true;
  try {
    const { entries } = await files.getWorkspaceFiles().list(`assets/${id}`).catch((error: { response?: { data?: { data?: { code?: string } } } }) => {
      if (error.response?.data?.data?.code !== "ENOENT") throw error;
      return { entries: [] };
    });
    if (cancelled) return;
    const results = new Map<string, NodeMediaValue>();
    for (const entry of entries) {
      const mimeType = mimeTypes[entry.name.split(".").at(-1)?.toLowerCase() ?? ""];
      if (entry.type === "file" && mimeType?.startsWith(`${props.mediaType}/`)) {
        const url = entry.path.replaceAll("\\", "/");
        results.set(url, { url, mimeType });
      }
    }
    // ACT: 副本使用新 ID，但当前结果仍可能引用原节点文件；只补当前结果，不继承原目录的全部历史。
    const current = props.current && { ...props.current, url: props.current.url.replaceAll("\\", "/") };
    if (current) results.set(current.url, current);
    items.value = [...results.values()].sort((left, right) => left.url.localeCompare(right.url, "zh-CN", { numeric: true }));
    selected.value = current ?? items.value[0];
    page.value = Math.floor(Math.max(0, items.value.findIndex(item => item.url === selected.value?.url)) / pageSize) + 1;
  } catch (error) {
    if (!cancelled) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      loadError.value = message || (error instanceof Error ? error.message : "历史记录读取失败");
    }
  } finally {
    if (!cancelled) loading.value = false;
  }
});

function selectOutput() {
  if (props.disabled || loading.value || !selected.value || !previewUrl.value || !previewReady.value || previewError.value) return;
  emit("select", { ...selected.value });
  visible.value = false;
}
</script>

<style scoped lang="scss">
.mediaHistory { min-height: 300px; .historyContent { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr); gap: 24px; .historyList { max-height: min(400px, 50dvh); overflow: auto; padding-right: 12px; border-right: 1px solid var(--uiBorderDefault); .historyItem { display: flex; flex-direction: column; gap: 8px; width: 100%; padding: 12px; border: 1px solid transparent; border-radius: var(--uiRadiusControl); background: transparent; color: var(--uiTextBody); font: inherit; font-size: var(--uiFontControl); text-align: left; cursor: pointer; &:hover { background: var(--uiSurfaceHover); } &.selected { border-color: var(--uiActionPrimary); background: var(--uiActionSoft); color: var(--uiTextPrimary); } &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: -2px; } .fileName { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .currentLabel { color: var(--uiActionPrimary); font-size: var(--uiFontControl); } } } .historyPreview { position: relative; display: grid; place-items: center; min-height: 300px; min-width: 0; background: var(--uiBackgroundCanvas); border-radius: var(--uiRadiusControl); img { width: 100%; max-height: min(400px, 50dvh); object-fit: contain; } :deep(.uiMediaPlayer) { width: 100%; } .previewLoading { position: absolute; inset: 0; z-index: 1; pointer-events: none; } } } :deep(.uiPagination) { justify-content: center; margin-top: 24px; } @media (max-width: 700px) { .historyContent { grid-template-columns: minmax(0, 1fr); .historyList { max-height: 180px; padding-right: 0; padding-bottom: 12px; border-right: 0; border-bottom: 1px solid var(--uiBorderDefault); } .historyPreview { min-height: 220px; } } } }
</style>

<template>
  <component v-if="failed" :is="UI.ErrorComponent" variant="image" />
  <component v-else :is="COMPONENT_RENDERERS.image" :key="directory + image.node.url" v-bind="image" :node="resolvedNode" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { COMPONENT_RENDERERS, UI, useContext, type ImageNodeRendererProps } from "vue-stream-markdown";
import useWorkspaceFiles from "@/lib/workspaceFiles";

const props = defineProps<{ image: ImageNodeRendererProps; directory: string }>();
const imageUrl = ref("");
const loading = ref(false);
const failed = ref(false);
const lastLoadedKey = ref("");

const cleanUrl = computed(() => props.image.node.url?.trim().replace(/^<|>$/g, "") ?? "");
const workspaceImage = computed(() => !!cleanUrl.value && !/^(?:[a-z][a-z\d+.-]*:|[\\/]|#)/i.test(cleanUrl.value));
const resolvedNode = computed(() => workspaceImage.value
  ? { ...props.image.node, url: imageUrl.value || cleanUrl.value, loading: !imageUrl.value }
  : props.image.node);
const { parsedNodes, provideContext } = useContext();
// ACT: 工作区图片按单张预览；多图切换需集中维护解析后的地址，避免直接请求原始相对路径。
provideContext({ parsedNodes: computed(() => workspaceImage.value ? [resolvedNode.value] : parsedNodes.value) });

watch(
  () => [props.directory, cleanUrl.value] as const,
  async ([directory, url], _previous, onCleanup) => {
    if (!workspaceImage.value) return;
    const rawPath = url.split(/[?#]/, 1)[0]!;
    const path = decodeURIComponent(rawPath).replaceAll("\\", "/");
    const key = `${directory}:${path}`;
    if (lastLoadedKey.value === key && imageUrl.value) return;

    let cancelled = false;
    let release = () => {};
    onCleanup(() => {
      cancelled = true;
      release();
    });

    loading.value = true;
    failed.value = false;
    try {
      const preview = useWorkspaceFiles(directory).acquireUrl(path);
      release = preview.release;
      const resolvedUrl = await preview.url;
      if (!cancelled) {
        imageUrl.value = resolvedUrl;
        lastLoadedKey.value = key;
      }
    } catch {
      if (!cancelled) failed.value = true;
    } finally {
      if (!cancelled) loading.value = false;
    }
  },
  { immediate: true }
);
</script>

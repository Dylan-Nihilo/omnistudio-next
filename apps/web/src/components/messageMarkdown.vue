<template>
  <div class="messageMarkdown">
    <markdown
      v-for="(chunk, index) in chunks"
      :key="index + '-' + !!definitions + '-' + (streaming ? 'streaming' : 'static')"
      class="markdownChunk"
      :content="chunk"
      :mode="streaming && index === chunks.length - 1 ? 'streaming' : 'static'"
      :enableAnimate="false"
      :shikiOptions="shikiOptions"
      :codeOptions="codeOptions"
      :linkOptions="{ safetyCheck: false }"
      :hardenOptions="hardenOptions"
      :cdnOptions="cdnOptions"
      :components="markdownOverlays"
      :nodeRenderers="nodeRenderers"
      :parseMarkdownIntoBlocks="definitions ? keepChunk : undefined"
      locale="zh-CN" />
  </div>
</template>

<script setup lang="ts">
import { computed, h } from "vue";
import { Markdown, parseMarkdownIntoBlocks } from "vue-stream-markdown";
import { MarkdownAstParser } from "@markmend/ast";
import type { CodeOptions, ImageNodeRendererProps, LinkNodeRendererProps, ShikiOptions } from "vue-stream-markdown";
import "vue-stream-markdown/index.css";
import "vue-stream-markdown/theme.css";
import markdownOverlays from "./markdownOverlays";
import markdownImage from "./markdownImage.vue";
import markdownLink from "./markdownLink.vue";

const props = withDefaults(defineProps<{
  content: string;
  streaming?: boolean;
  codeOptions?: CodeOptions;
  directory?: string;
}>(), {
  streaming: false,
});

const renderImage = (image: ImageNodeRendererProps) => h(markdownImage, { image, directory: props.directory ?? "" });
const renderLink = (link: LinkNodeRendererProps) => h(markdownLink, { link, directory: props.directory ?? "" });

const nodeRenderers = computed(() => ({
  image: renderImage,
  link: renderLink,
}));

const hardenOptions = computed(() => ({
  allowedProtocols: ["*"],
  allowedLinkPrefixes: ["*"],
  allowedImagePrefixes: ["*"],
  defaultOrigin: typeof window !== "undefined" ? window.location.origin : "http://localhost",
}));

const shikiOptions: ShikiOptions = { theme: ["github-light", "github-dark"] };
const cdnOptions = { shiki: false } as const;
const keepChunk = (value: string) => [value];
const workspaceMediaPath = /^assets\/[^<>]+\.(?:avif|apng|bmp|gif|jpe?g|png|svg|webp|mp4|m4v|webm|mov|mkv|ogv)$/i;
const workspaceImagePath = /\.(?:avif|apng|bmp|gif|jpe?g|png|svg|webp)$/i;

const normalizedContent = computed(() => {
  let text = props.content;
  // ACT: 工作区媒体必须进入 Markdown 节点渲染器；AST 会把裸的尖括号路径当普通文本。
  text = text.replace(/(?<![\(\["'`])(?:<|&lt;)\s*(assets\/[^<>]*?\.(?:avif|apng|bmp|gif|jpe?g|png|svg|webp|mp4|m4v|webm|mov|mkv|ogv))\s*(?:>|&gt;)/gi, (match, value: string, offset: number) => {
    if (/\]\(\s*$/.test(text.slice(Math.max(0, offset - 32), offset))) return match;
    const path = value.replace(/\s+/g, "").replaceAll("\\", "/");
    if (!workspaceMediaPath.test(path)) return match;
    return workspaceImagePath.test(path)
      ? `![${path}](${path})`
      : `[视频：${path}](${path})`;
  });
  // 兼容旧回复中单独一行的裸工作区媒体路径。
  text = text.replace(/(^|[\r\n])([ \t]*)(assets\/[^\s<>]+\.(?:avif|apng|bmp|gif|jpe?g|png|svg|webp|mp4|m4v|webm|mov|mkv|ogv))([ \t]*)(?=[\r\n]|$)/gi, (_match, prefix: string, indent: string, path: string) => {
    return `${prefix}${indent}${workspaceImagePath.test(path) ? `![${path}](${path})` : `[视频：${path}](${path})`}`;
  });
  return text;
});

const blocks = computed(() => parseMarkdownIntoBlocks(normalizedContent.value));
const definitionParser = new MarkdownAstParser({ mode: "static" });
const isDefinition = (block: string) => /^ {0,3}\[(?!\^)[^\]\n]+\]:/.test(block)
  && definitionParser.markdownToAst(block).children.every(node => node.type === "definition");
const definitions = computed(() => blocks.value.length > 1 ? blocks.value.filter(isDefinition).join("\n\n") : "");
const chunks = computed(() => {
  if (blocks.value.length < 2) return blocks.value;
  const groups: string[] = [];
  let current = "";
  // ACT: 不拆语法块，稳定组不重渲染；单个语法块仍完整交给库处理。
  for (const block of blocks.value) {
    if (isDefinition(block)) continue;
    if (current && current.length + block.length > 8192) {
      groups.push(current);
      current = "";
    }
    current += block;
  }
  if (current) groups.push(current);
  // 定义放在组前，避免落入末尾尚未闭合的代码块。
  return definitions.value ? groups.map(group => `${definitions.value}\n\n${group}`) : groups;
});
</script>

<style scoped lang="scss">
.messageMarkdown {
  min-width: 0;

  .markdownChunk {
    --background: var(--uiBackgroundBase);
    --foreground: var(--uiTextPrimary);
    --muted: var(--uiBackgroundSubtle);
    --muted-foreground: var(--uiTextMuted);
    --border: var(--uiBorderDefault);
    --primary: var(--uiActionPrimary);
    font-size: inherit;
    line-height: inherit;

    & + .markdownChunk {
      margin-top: 12px;
    }
  }
}
</style>

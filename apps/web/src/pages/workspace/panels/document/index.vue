<template>
  <section class="documentPanel" aria-label="文档编辑" @keydown.ctrl.f.prevent="searchVisible = true" @keydown.meta.f.prevent="searchVisible = true">
    <fileTree :directory="workspaceStore.project?.directory" :selection="selectedNode" @selectNode="openNode" />
    <div class="editorSurface" :aria-busy="opening || undefined">
      <div class="editorFrame" :inert="opening || undefined">
        <header v-if="selectedNode" class="documentHeader">
          <div class="documentIdentity">
            <span class="documentName">{{ selectedNode.label }}</span>
            <span class="documentPath" :title="selectedPath">{{ selectedPath }}</span>
          </div>
          <uiSelect v-if="nodeOutputs.length > 1" :modelValue="outputId" :options="outputOptions" class="outputSelect" size="small" aria-label="文本输出" :disabled="opening" @update:modelValue="value => typeof value === 'string' && openOutput(value)" />
          <uiButton v-if="saveError" variant="danger" size="small" :title="saveError" @click="flushSave().catch(() => {})">保存失败，重试</uiButton>
          <span v-else class="saveStatus" role="status">{{ dirty ? "保存中…" : "已保存" }}</span>
        </header>
        <div v-if="editor" class="editorToolbar" role="group" aria-label="文档格式">
          <div class="toolbarGroup">
            <uiIconButton class="toolButton" size="small" :icon="IconArrowBackUp" :disabled="!editor.can().undo()" label="撤销" title="撤销" @mousedown.prevent @click="editor.chain().focus().undo().run()" />
            <uiIconButton class="toolButton" size="small" :icon="IconArrowForwardUp" :disabled="!editor.can().redo()" label="重做" title="重做" @mousedown.prevent @click="editor.chain().focus().redo().run()" />
          </div>
          <div class="toolbarGroup">
            <uiDropdown :items="textStyles" @command="setTextStyle">
              <template #reference="{ triggerAttrs }"><uiButton class="dropdownButton" v-bind="triggerAttrs" variant="ghost" size="small" :class="{ active: editor.isActive('heading') }" :icon="IconHeading" aria-label="段落样式" :title="textStyle">{{ textStyle }}<icon-chevron-down :size="12" /></uiButton></template>
            </uiDropdown>
            <uiDropdown :items="listItems" @command="setList">
              <template #reference="{ triggerAttrs }"><uiButton class="dropdownButton" v-bind="triggerAttrs" variant="ghost" size="small" :class="{ active: listTools.some(item => editor!.isActive(item.name)) }" :icon="IconList" aria-label="列表" title="列表"><icon-chevron-down :size="12" /></uiButton></template>
            </uiDropdown>
            <uiIconButton v-for="item in blockTools" :key="item.name" class="toolButton" :class="{ active: editor.isActive(item.name) }" size="small" :icon="item.icon" :label="item.label" :title="item.label" :aria-pressed="editor.isActive(item.name)" @mousedown.prevent @click="item.run(editor.chain().focus()).run()" />
          </div>
          <div class="toolbarGroup">
            <uiIconButton v-for="item in formatTools" :key="item.name" class="toolButton" :class="{ active: editor.isActive(item.name) }" size="small" :icon="item.icon" :label="item.label" :title="item.label" :aria-pressed="editor.isActive(item.name)" @mousedown.prevent @click="item.run(editor.chain().focus()).run()" />
            <uiIconButton class="toolButton" :class="{ active: editor.isActive('link') }" size="small" :icon="IconLink" label="链接" title="链接" :aria-pressed="editor.isActive('link')" @mousedown.prevent @click="editLink" />
            <uiIconButton v-for="item in scriptTools" :key="item.name" class="toolButton" :class="{ active: editor.isActive(item.name) }" size="small" :icon="item.icon" :label="item.label" :title="item.label" :aria-pressed="editor.isActive(item.name)" @mousedown.prevent @click="item.run(editor.chain().focus()).run()" />
          </div>
          <div class="toolbarGroup">
            <uiIconButton v-for="item in alignmentTools" :key="item.value" class="toolButton" :class="{ active: editor.isActive({ textAlign: item.value }) }" size="small" :icon="item.icon" :label="item.label" :title="item.label" :aria-pressed="editor.isActive({ textAlign: item.value })" @mousedown.prevent @click="editor.chain().focus().setTextAlign(item.value).run()" />
          </div>
          <div class="toolbarGroup">
            <uiDropdown :items="insertItems" @command="insertContent">
              <template #reference="{ triggerAttrs }"><uiButton v-bind="triggerAttrs" variant="ghost" size="small" :icon="IconPhoto" aria-label="插入内容">添加<icon-chevron-down :size="12" /></uiButton></template>
            </uiDropdown>
            <uiDropdown v-if="editor.isActive('table')" :items="tableItems" @command="editTable">
              <template #reference="{ triggerAttrs }"><uiButton v-bind="triggerAttrs" variant="ghost" size="small" aria-label="编辑表格">表格<icon-chevron-down :size="12" /></uiButton></template>
            </uiDropdown>
          </div>
          <div class="toolbarGroup">
            <uiIconButton class="toolButton" size="small" :icon="IconCopy" :disabled="editor.isEmpty" label="复制 Markdown" title="复制 Markdown" @click="copyMarkdown" />
            <uiPopover v-model:visible="searchVisible" trigger="click" :width="300" placement="bottom-end" title="查找正文" @show="openSearch" @hide="editor.commands.clearSearch()">
              <template #reference="{ triggerAttrs }"><uiIconButton class="toolButton" v-bind="triggerAttrs" :class="{ active: searchVisible }" size="small" :icon="IconSearch" label="查找正文" title="查找正文" /></template>
              <div class="findPanel" @keydown.esc.stop="searchVisible = false">
                <uiInput ref="searchInput" v-model="searchTerm" size="small" placeholder="查找正文" aria-label="查找正文内容" clearable @input="value => editor!.commands.setSearchTerm(value)" @keydown.enter.prevent="editor.commands.goToNextResult()" />
                <div class="findActions">
                  <span aria-live="polite">{{ searchStatus }}</span>
                  <uiIconButton size="small" :icon="IconChevronUp" :disabled="!editor.storage.findAndReplace.results.length" label="上一个匹配" @click="editor.commands.goToPreviousResult()" />
                  <uiIconButton size="small" :icon="IconChevronDown" :disabled="!editor.storage.findAndReplace.results.length" label="下一个匹配" @click="editor.commands.goToNextResult()" />
                  <uiIconButton size="small" :icon="IconX" label="关闭查找" @click="searchVisible = false" />
                </div>
              </div>
            </uiPopover>
          </div>
        </div>
        <editor-content class="editorBody" :editor="editor" />
      </div>
      <uiLoading v-if="opening" class="openingOverlay" :loading="true" label="读取文档" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref } from "vue";
import { debounce } from "lodash-es";
import { uiButton, uiDropdown, uiIconButton, uiInput, uiLoading, uiPopover, uiSelect, useUiFeedback, type UiValue } from "@toonflow/ui";
import { Editor, EditorContent, useEditor } from "@tiptap/vue-3";
import type { ChainedCommands, EditorOptions } from "@tiptap/core";
import { useWorkspaceStore } from "@/stores/workspace";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { writeClipboardText } from "@/lib/clipboard";
import fileTree, { type TreeSelection } from "./components/fileTree.vue";
import markdownExtensions, { serializeMarkdown } from "./markdownExtensions";
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconCode,
  IconList,
  IconListNumbers,
  IconListCheck,
  IconBlockquote,
  IconSourceCode,
  IconLink,
  IconPhoto,
  IconTable,
  IconSeparator,
  IconHeading,
  IconChevronDown,
  IconChevronUp,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconCopy,
  IconX,
  IconUnderline,
  IconHighlight,
  IconSuperscript,
  IconSubscript,
  IconSearch,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconAlignJustified,
} from "@tabler/icons-vue";

type TextOutput = { id: string; label: string; text: string };
const props = defineProps<{
  readNode: (directory: string, canvasPath: string, nodeId: string) => Promise<{ label: string; outputs: TextOutput[] }>;
  saveNode: (directory: string, canvasPath: string, nodeId: string, handleId: string, text: string) => Promise<void>;
}>();
const workspaceStore = useWorkspaceStore();
const feedback = useUiFeedback();
const selectedNode = ref<TreeSelection>();
const nodeOutputs = ref<TextOutput[]>([]);
const outputId = ref("");
const opening = ref(false);
const dirty = ref(false);
const saveError = ref("");
const selectedPath = computed(() => {
  const selection = selectedNode.value;
  if (!selection) return "";
  return "filePath" in selection ? selection.filePath : selection.canvasPath;
});
let openRequest = 0;
let draft: { directory: string; selection: TreeSelection; handleId: string; text: string } | undefined;
let saving = Promise.resolve();
const saveDocument = debounce((change: NonNullable<typeof draft>) => {
  // ACT: 同一面板顺序落盘；每次保存固定目录、文件或画布节点，不随当前选择漂移。
  saving = saving
    .catch(() => {})
    .then(() => ("filePath" in change.selection
      ? useWorkspaceFiles(change.directory).write(change.selection.filePath, change.text)
      : props.saveNode(change.directory, change.selection.canvasPath, change.selection.nodeId, change.handleId, change.text)))
    .then(() => {
      if (draft === change) {
        dirty.value = false;
        saveError.value = "";
      }
    })
    .catch((error) => {
      saveError.value = error instanceof Error ? error.message : "文本保存失败";
      throw error;
    });
  void saving.catch(() => {});
}, 400);
const searchVisible = ref(false);
const searchTerm = ref("");
const searchInput = ref<InstanceType<typeof uiInput>>();
const editorOptions: Partial<EditorOptions> = {
  extensions: markdownExtensions,
  content: "",
  contentType: "markdown",
  onUpdate({ editor }) {
    const directory = workspaceStore.project?.directory;
    if (!directory || !selectedNode.value || opening.value) return;
    const text = serializeMarkdown(editor);
    const output = nodeOutputs.value.find((output) => output.id === outputId.value);
    if (output) output.text = text;
    draft = { directory, selection: selectedNode.value, handleId: outputId.value, text };
    dirty.value = true;
    saveError.value = "";
    saveDocument(draft);
  },
  editorProps: {
    attributes: { role: "textbox", "aria-label": "Markdown 文档", "aria-multiline": "true" },
    handlePaste: (_view, event) => {
      const clipboard = event.clipboardData;
      const markdown = clipboard?.getData("text/markdown");
      const text = markdown || clipboard?.getData("text/plain");
      if (!text || (!markdown && clipboard?.getData("text/html")) || editor.value?.isActive("codeBlock")) return false;
      return editor.value?.commands.insertContent(text, { contentType: "markdown" }) ?? false;
    },
  },
};
const editor = useEditor(editorOptions);

async function flushSave() {
  if (saveError.value && draft) saveDocument(draft);
  saveDocument.flush();
  await saving;
}

function showOutput(id: string) {
  const output = nodeOutputs.value.find((output) => output.id === id);
  if (!output) throw new Error("文本输出不存在");
  outputId.value = id;
  searchVisible.value = false;
  draft = undefined;
  dirty.value = false;
  saveError.value = "";
  // 每个节点/输出重新建立编辑器，避免撤销跨文档修改。
  editor.value?.destroy();
  editor.value = new Editor({ ...editorOptions, content: output.text });
}

async function openNode(selection: TreeSelection, reportError = true, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const directory = workspaceStore.project?.directory;
  if (!directory) return;
  const request = ++openRequest;
  opening.value = true;
  editor.value?.setEditable(false, false);
  try {
    await flushSave();
    signal?.throwIfAborted();
    if ("filePath" in selection) {
      const text = await useWorkspaceFiles(directory).readText(selection.filePath);
      signal?.throwIfAborted();
      if (request !== openRequest || directory !== workspaceStore.project?.directory) return;
      selectedNode.value = selection;
      nodeOutputs.value = [{ id: "text", label: selection.label, text }];
      showOutput("text");
      return;
    }
    const document = await props.readNode(directory, selection.canvasPath, selection.nodeId);
    signal?.throwIfAborted();
    if (request !== openRequest || directory !== workspaceStore.project?.directory) return;
    if (!document.outputs.length) throw new Error("节点没有文本输出");
    selectedNode.value = { ...selection, label: document.label };
    nodeOutputs.value = document.outputs;
    showOutput(document.outputs[0]!.id);
  } catch (error) {
    if (!reportError) throw error;
    if (request === openRequest) {
      const fallback = "filePath" in selection ? "读取文件失败" : "读取节点失败";
      feedback.message({ tone: "error", message: error instanceof Error ? error.message : fallback });
    }
  } finally {
    if (request === openRequest) {
      opening.value = false;
      editor.value?.setEditable(true, false);
    }
  }
}

async function openOutput(id: string, reportError = true, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const request = ++openRequest;
  opening.value = true;
  editor.value?.setEditable(false, false);
  try {
    await flushSave();
    signal?.throwIfAborted();
    if (request === openRequest) showOutput(id);
  } catch (error) {
    if (!reportError) throw error;
    if (request === openRequest) feedback.message({ tone: "error", message: error instanceof Error ? error.message : "切换文本输出失败" });
  } finally {
    if (request === openRequest) {
      opening.value = false;
      editor.value?.setEditable(true, false);
    }
  }
}

onBeforeUnmount(() => {
  openRequest++;
  saveDocument.cancel();
});
function getDocument(includeText = true) {
  return {
    selection: selectedNode.value ?? null,
    handleId: outputId.value || null,
    dirty: dirty.value,
    saveError: saveError.value || null,
    ...(includeText ? { text: editor.value ? serializeMarkdown(editor.value) : "" } : {}),
  };
}

async function openDocument(args: Record<string, unknown>, signal: AbortSignal) {
  signal.throwIfAborted();
  let selection: TreeSelection;
  if (typeof args.path === "string" && /\.(md|markdown)$/i.test(args.path)) {
    selection = { filePath: args.path, label: args.path.split(/[\\/]/).at(-1)! };
  } else if (typeof args.canvasPath === "string" && typeof args.nodeId === "string") {
    selection = { canvasPath: args.canvasPath, nodeId: args.nodeId, label: args.nodeId };
  } else throw new Error("请指定 Markdown 文件 path，或画布 canvasPath 和 nodeId");
  await openNode(selection, false, signal);
  signal.throwIfAborted();
  const current = selectedNode.value;
  if (!current || ("filePath" in selection
    ? !("filePath" in current) || current.filePath !== selection.filePath
    : !("canvasPath" in current) || current.canvasPath !== selection.canvasPath || current.nodeId !== selection.nodeId)) {
    throw new Error("文档已切换，请重新读取当前文档");
  }
  if (typeof args.handleId === "string") {
    if (!nodeOutputs.value.some(output => output.id === args.handleId)) throw new Error("文本输出不存在");
    await openOutput(args.handleId, false, signal);
    signal.throwIfAborted();
  }
}

async function writeDocument(args: Record<string, unknown>, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!selectedNode.value || !editor.value || opening.value) throw new Error("请先打开需要编辑的文档");
  if (typeof args.text !== "string" || typeof args.expectedText !== "string") throw new Error("需要 text 和读取时的 expectedText");
  if (serializeMarkdown(editor.value) !== args.expectedText) throw new Error("文档内容已变化，请重新读取后编辑");
  editor.value.commands.setContent(args.text, { contentType: "markdown" });
  await flushSave();
  signal.throwIfAborted();
}

defineExpose({ flushSave, cancelSave: () => saveDocument.cancel(), getDocument, openDocument, writeDocument });

const headingLevels = [1, 2, 3, 4, 5, 6] as const;
type HeadingLevel = (typeof headingLevels)[number];
const textStyles = [{ value: 0, label: "正文" }, ...headingLevels.map(level => ({ value: level, label: `标题 ${level}` }))];
const outputOptions = computed(() => nodeOutputs.value.map(output => ({ value: output.id, label: output.label })));
const textStyle = computed(() => {
  const level = headingLevels.find((level) => editor.value?.isActive("heading", { level }));
  return level ? `标题 ${level}` : "正文";
});
const searchStatus = computed(() => {
  const search = editor.value?.storage.findAndReplace;
  return search?.results.length ? `${(search.currentIndex ?? 0) + 1} / ${search.results.length}` : "0 / 0";
});
const formatTools = [
  { name: "bold", label: "加粗", icon: IconBold, run: (chain: ChainedCommands) => chain.toggleBold() },
  { name: "italic", label: "斜体", icon: IconItalic, run: (chain: ChainedCommands) => chain.toggleItalic() },
  { name: "strike", label: "删除线", icon: IconStrikethrough, run: (chain: ChainedCommands) => chain.toggleStrike() },
  { name: "code", label: "行内代码", icon: IconCode, run: (chain: ChainedCommands) => chain.toggleCode() },
  { name: "underline", label: "下划线", icon: IconUnderline, run: (chain: ChainedCommands) => chain.toggleUnderline() },
  { name: "highlight", label: "高亮", icon: IconHighlight, run: (chain: ChainedCommands) => chain.toggleHighlight() },
];
const listTools = [
  { name: "bulletList", label: "无序列表", icon: IconList, run: (chain: ChainedCommands) => chain.toggleBulletList() },
  { name: "orderedList", label: "有序列表", icon: IconListNumbers, run: (chain: ChainedCommands) => chain.toggleOrderedList() },
  { name: "taskList", label: "任务列表", icon: IconListCheck, run: (chain: ChainedCommands) => chain.toggleTaskList() },
];
const blockTools = [
  { name: "blockquote", label: "引用", icon: IconBlockquote, run: (chain: ChainedCommands) => chain.toggleBlockquote() },
  { name: "codeBlock", label: "代码块", icon: IconSourceCode, run: (chain: ChainedCommands) => chain.toggleCodeBlock() },
];
const scriptTools = [
  { name: "superscript", label: "上标", icon: IconSuperscript, run: (chain: ChainedCommands) => chain.unsetSubscript().toggleSuperscript() },
  { name: "subscript", label: "下标", icon: IconSubscript, run: (chain: ChainedCommands) => chain.unsetSuperscript().toggleSubscript() },
];
const alignmentTools = [
  { value: "left", label: "左对齐", icon: IconAlignLeft },
  { value: "center", label: "居中对齐", icon: IconAlignCenter },
  { value: "right", label: "右对齐", icon: IconAlignRight },
  { value: "justify", label: "两端对齐", icon: IconAlignJustified },
];
const insertItems = [{ value: "image", label: "图片链接", icon: IconPhoto }, { value: "table", label: "表格", icon: IconTable }, { value: "divider", label: "分隔线", icon: IconSeparator }];
const listItems = listTools.map((item, value) => ({ value, label: item.label, icon: item.icon }));
const tableTools = [
  { command: "addRowAfter", label: "在下方插入行" },
  { command: "addColumnAfter", label: "在右侧插入列" },
  { command: "deleteRow", label: "删除当前行" },
  { command: "deleteColumn", label: "删除当前列" },
  { command: "deleteTable", label: "删除表格" },
] as const;

const tableItems = tableTools.map(item => ({ value: item.command, label: item.label }));
function setList(value: UiValue) {
  if (editor.value && typeof value === "number") listTools[value]?.run(editor.value.chain().focus()).run();
}

function setTextStyle(value: UiValue) {
  if (typeof value !== "number" || value !== 0 && !headingLevels.includes(value as HeadingLevel)) return;
  const level = value as HeadingLevel | 0;
  const chain = editor.value?.chain().focus();
  if (level === 0) chain?.setParagraph().run();
  else chain?.setHeading({ level }).run();
}

function editTable(value: UiValue) {
  const item = tableTools.find(item => item.command === value);
  if (item) editor.value?.chain().focus()[item.command]().run();
}

async function openSearch() {
  editor.value?.commands.setSearchTerm(searchTerm.value);
  await nextTick();
  searchInput.value?.focus();
}

async function editLink() {
  const currentEditor = editor.value;
  if (!currentEditor) return;
  try {
    const { value } = await feedback.prompt("输入链接地址，留空可移除链接", "链接", {
      inputValue: currentEditor.getAttributes("link").href || "",
      inputValidator: (value) => !value?.trim() || /^(https?:\/\/|mailto:)\S+$/i.test(value.trim()) || "请输入有效的 https、http 或 mailto 链接",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });
    if (currentEditor.isDestroyed) return;
    const chain = currentEditor.chain().focus().extendMarkRange("link");
    if (value?.trim()) chain.setLink({ href: value.trim() }).run();
    else chain.unsetLink().run();
  } catch {
    // 关闭弹窗时保留原有内容。
  }
}

async function insertContent(command: UiValue) {
  if (command !== "image" && command !== "table" && command !== "divider") return;
  const currentEditor = editor.value;
  if (!currentEditor) return;
  if (command === "table") return currentEditor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  if (command === "divider") return currentEditor.chain().focus().setHorizontalRule().run();
  try {
    const { value } = await feedback.prompt("输入图片地址", "插入图片", {
      inputValidator: (value) => /^https?:\/\/\S+$/i.test(value?.trim() || "") || "请输入有效的 https 或 http 图片地址",
      confirmButtonText: "插入",
      cancelButtonText: "取消",
    });
    if (!currentEditor.isDestroyed) currentEditor.chain().focus().setImage({ src: value.trim() }).run();
  } catch {
    // 关闭弹窗时保留原有内容。
  }
}

async function copyMarkdown() {
  if (!editor.value) return;
  try {
    await writeClipboardText(serializeMarkdown(editor.value));
    feedback.message({ tone: "success", message: "已复制 Markdown" });
  } catch {
    feedback.message({ tone: "error", message: "复制失败，请检查剪贴板权限" });
  }
}

onDeactivated(() => {
  searchVisible.value = false;
  editor.value?.commands.clearSearch();
  editor.value?.commands.blur();
});
</script>

<style scoped lang="scss">
.documentPanel {
  display: grid;
  grid-template-columns: clamp(240px, 20vw, 280px) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background: var(--uiBackgroundBase);
  .editorSurface {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--uiSurfaceRaised);
    .editorFrame { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; }
    .openingOverlay { position: absolute; inset: 0; }
    .documentHeader {
      display: flex; align-items: center; flex-wrap: wrap; gap: 12px; min-height: 60px; padding: 12px 24px; border-bottom: 1px solid var(--uiBorderDefault);
      .documentIdentity { flex: 1; min-width: 100px; display: flex; flex-direction: column; gap: 2px;
        .documentName { font-size: var(--uiFontTitle); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .documentPath { font-size: var(--uiFontControl); color: var(--uiTextMuted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      }
      .outputSelect { width: 180px; max-width: 100%; }
      .saveStatus { color: var(--uiTextMuted); font-size: var(--uiFontControl); white-space: nowrap; }
    }
    .editorToolbar {
      display: flex; flex-wrap: wrap; flex-shrink: 0; align-items: center; gap: 6px 0; padding: 8px 12px; border-bottom: 1px solid var(--uiBorderDefault); background: var(--uiBackgroundSubtle);
      .toolbarGroup { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; padding: 0 6px; border-right: 1px solid var(--uiBorderDefault); &:last-child { border: 0; } }
      .toolButton, .dropdownButton { &.active { color: var(--uiTextPrimary); background: var(--uiActionSoft); } }
    }
    .editorBody {
      contain: inline-size;
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 40px clamp(24px, 4vw, 64px) 64px;
      overscroll-behavior: contain;

      :deep(.tiptap) {
        box-sizing: border-box;
        width: 100%;
        min-height: 100%;
        cursor: text;
        outline: none;
        color: var(--uiTextPrimary);
        font-size: 15px;
        line-height: 1.8;
        overflow-wrap: anywhere;

        > :first-child {
          margin-top: 0;
        }
        p {
          margin: 0.6em 0;
        }
        h1,
        h2,
        h3,
        h4,
        h5,
        h6 {
          margin: 1.4em 0 0.5em;
          font-weight: 600;
          line-height: 1.35;
        }
        h1 {
          font-size: 2em;
        }
        h2 {
          font-size: 1.6em;
        }
        h3 {
          font-size: 1.3em;
        }
        h4,
        h5,
        h6 {
          font-size: 1.1em;
        }
        ul,
        ol {
          padding-left: 1.6em;
        }
        li > p {
          margin: 0.2em 0;
        }
        a {
          color: var(--uiActionPrimary);
          text-decoration: underline;
        }
        mark {
          padding: 1px 2px;
          border-radius: 3px;
          background: var(--uiStatusWarningSoft);
          color: inherit;
        }
        blockquote {
          margin: 1em 0;
          padding-left: 1em;
          border-left: 3px solid var(--uiBorderDefault);
          color: var(--uiTextMuted);
        }
        code {
          padding: 2px 5px;
          border-radius: 4px;
          background: var(--uiSurfaceHover);
          font-family: monospace;
          font-size: 0.9em;
        }
        pre {
          padding: 14px 18px;
          border-radius: 8px;
          background: var(--uiBackgroundSubtle);
          overflow-x: auto;
          code {
            padding: 0;
            background: none;
          }
        }
        hr {
          margin: 1.5em 0;
          border: 0;
          border-top: 1px solid var(--uiBorderDefault);
        }
        img {
          display: block;
          max-width: 100%;
          height: auto;
          border-radius: 6px;
        }
        .ProseMirror-selectednode {
          outline: 2px solid var(--uiActionPrimary);
        }
        ul[data-type="taskList"] {
          padding-left: 0;
          list-style: none;
          li {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            > label {
              flex: 0 0 auto;
              padding-top: 3px;
              user-select: none;
            }
            > div {
              flex: 1;
              min-width: 0;
            }
            input {
              accent-color: var(--uiActionPrimary);
              cursor: pointer;
            }
          }
        }
        table {
          width: 100%;
          margin: 1em 0;
          border-collapse: collapse;
          table-layout: fixed;
          td,
          th {
            position: relative;
            min-width: 40px;
            padding: 6px 10px;
            border: 1px solid var(--uiBorderDefault);
            vertical-align: top;
          }
          th {
            background: var(--uiBackgroundSubtle);
            font-weight: 600;
            text-align: left;
          }
          .selectedCell {
            background: var(--uiActionSoft);
          }
        }
      }
    }
  }
}

.findPanel {
  display: flex; flex-direction: column; gap: 8px;
  .findActions { display: flex; align-items: center; gap: 2px; > span { flex: 1; color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
}
</style>

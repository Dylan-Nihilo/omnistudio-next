<template>
  <div class="promptInput nodrag nopan nowheel" :class="{ isEmpty: !text }" @keydown.capture="handleMentionKey" @click.capture="previewReference"><div ref="editorElement" /><teleport v-for="target in mentionTargets" :key="target.key" :to="target.element"><slot name="mention" :id="target.tag.id" :name="target.tag.name">@{{ target.tag.name }}</slot></teleport></div>
  <uiPopover v-model:visible="menuVisible" trigger="manual" :anchor="menuAnchor" placement="bottom-start" :width="280" role="listbox" title="选择参考">
    <div class="referenceMenu"><button v-for="(reference, index) in options" :key="reference.id" class="referenceOption" :class="{ isActive: index === activeIndex }" type="button" role="option" :aria-selected="index === activeIndex" @pointerdown.prevent @pointermove="activeIndex = index" @click="insertReference(reference)"><img v-if="reference.avatar" :src="String(reference.avatar)" alt="" draggable="false" /><span>{{ reference.name }}</span></button><p v-if="!options.length" class="noReferences">没有匹配的参考</p></div>
  </uiPopover>
  <uiImageViewer v-if="previewUrl" :modelValue="true" :urls="[previewUrl]" title="图片预览" @update:modelValue="value => { if (!value) previewReferenceId = undefined; }" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { Editor, Node, getHTMLFromFragment, type JSONContent } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { uiPopover, uiImageViewer } from "@toonflow/ui";
import type { RichInputModel, RichInputReference, RichInputTag } from "../richInputTypes";

const props = withDefaults(defineProps<{ references?: RichInputReference[]; disabled?: boolean; label?: string; placeholder?: string; referenceMenuEnabled?: boolean }>(), { references: () => [], disabled: false, label: "生成提示词", placeholder: "描述一下生成风格提示词，输入 @ 引用参考", referenceMenuEnabled: true });
const emit = defineEmits<{ change: []; cursorChange: []; mentionClick: [id: string] }>();
const mentionTargets = shallowRef<{ key: symbol; element: HTMLElement; tag: Extract<RichInputTag, { type: "Mention" }> }[]>([]);
const model = defineModel<RichInputModel>({ required: true });
const text = defineModel<string>("text", { default: "" });
const editorElement = ref<HTMLElement>();
const menuVisible = ref(false);
const query = ref("");
const activeIndex = ref(0);
const menuAnchor = shallowRef({ getBoundingClientRect: () => new DOMRect() });
const options = computed(() => props.references.filter(reference => `${reference.name} ${reference.pinyin ?? ""}`.toLocaleLowerCase().includes(query.value.toLocaleLowerCase())));
const previewReferenceId = ref<string>();
const previewUrl = computed(() => String(props.references.find(reference => reference.id === previewReferenceId.value)?.avatar ?? ""));
let editor: Editor | undefined;
let lastModel = "";
let normalizing = false;
let mentionStart = 0;
let dismissedMention = "";
let compositionFrame = 0;

function referenceAttrs(reference: RichInputReference) {
  return { id: reference.id, name: reference.name, avatar: String(reference.avatar ?? ""), value: reference.value };
}
function referenceHtml(reference: RichInputReference) {
  const tag = document.createElement("span");
  tag.className = "imageReference";
  tag.dataset.referenceId = reference.id;
  tag.dataset.value = reference.value;
  if (reference.avatar) {
    const image = document.createElement("img");
    image.src = String(reference.avatar); image.alt = ""; image.draggable = false; tag.append(image);
  }
  tag.append(document.createTextNode(reference.name));
  return `<span style="display: inline-block;">${tag.outerHTML}</span>`;
}
function tagText(tag: RichInputTag) {
  if (tag.type === "Write") return tag.text;
  if (tag.type === "Input") return tag.text || tag.placeholder;
  if (tag.type !== "Custom") return (tag.type === "Mention" ? "@" : tag.type === "Trigger" ? tag.key : "") + tag.name;
  const template = document.createElement("template"); template.innerHTML = tag.html;
  for (const reference of template.content.querySelectorAll<HTMLElement>(".imageReference[data-value]")) reference.replaceWith(reference.dataset.value ?? "");
  return template.content.textContent ?? "";
}
function validTag(value: unknown): value is RichInputTag {
  if (!value || typeof value !== "object") return false;
  const tag = value as Record<string, unknown>;
  if (tag.type === "Write") return typeof tag.text === "string";
  if (tag.type === "Custom") return typeof tag.html === "string";
  if (tag.type === "Input") return typeof tag.key === "string" && typeof tag.placeholder === "string" && (tag.text === undefined || typeof tag.text === "string");
  return ["Mention", "Trigger", "Select"].includes(String(tag.type)) && typeof tag.id === "string" && typeof tag.name === "string" && (tag.type === "Mention" || typeof tag.key === "string");
}
function validModel(value: unknown): value is RichInputModel {
  return Array.isArray(value) && value.every(line => Array.isArray(line) && line.every(validTag));
}
function parseTag(element: HTMLElement) {
  try { const tag: unknown = JSON.parse(element.dataset.promptTag ?? ""); return validTag(tag) ? { tag } : false; }
  catch { return false; }
}
function tagNode(tag: RichInputTag): JSONContent[] {
  if (tag.type === "Write") return tag.text.split(/(\{\{ref \d+\}\})/g).flatMap<JSONContent>(value => {
    const reference = props.references.find(reference => reference.value === value);
    return reference ? [{ type: "promptReference", attrs: referenceAttrs(reference) }] : value ? [{ type: "text", text: value }] : [];
  });
  if (tag.type === "Custom") {
    const template = document.createElement("template"); template.innerHTML = tag.html;
    const id = template.content.querySelector<HTMLElement>(".imageReference[data-reference-id]")?.dataset.referenceId;
    if (id) { const reference = props.references.find(reference => reference.id === id); return reference ? [{ type: "promptReference", attrs: referenceAttrs(reference) }] : []; }
  }
  return [{ type: tag.type === "Input" ? "promptInputToken" : "promptToken", attrs: { tag: { ...tag } } }];
}
function documentModel(value: RichInputModel): JSONContent {
  if (!validModel(value)) throw new Error("提示词数据格式无效");
  return { type: "doc", content: (value.length ? value : [[]]).map(line => ({ type: "paragraph", content: line.flatMap(tagNode) })) };
}
function readModel(content: JSONContent[]): RichInputModel {
  const lines: RichInputModel = [[{ type: "Write", text: "" }]];
  let paragraph = false;
  function add(tag: RichInputTag) {
    const line = lines.at(-1)!; const previous = line.at(-1)!;
    if (tag.type === "Write" && previous.type === "Write") previous.text += tag.text;
    else { line.push(tag); if (tag.type !== "Write") line.push({ type: "Write", text: "" }); }
  }
  function read(node: JSONContent) {
    if (node.type === "paragraph") { if (paragraph) lines.push([{ type: "Write", text: "" }]); paragraph = true; node.content?.forEach(read); }
    else if (node.type === "hardBreak") lines.push([{ type: "Write", text: "" }]);
    else if (node.type === "text") add({ type: "Write", text: node.text ?? "" });
    else if (node.type === "promptReference") { const reference = props.references.find(reference => reference.id === node.attrs?.id); if (reference) add({ type: "Custom", html: referenceHtml(reference) }); }
    else if (validTag(node.attrs?.tag)) add({ ...node.attrs!.tag });
    else node.content?.forEach(read);
  }
  content.forEach(read); return lines;
}
function publish() {
  if (!editor || editor.isDestroyed) return;
  const value = readModel(editor.getJSON().content ?? []); const serialized = JSON.stringify(value);
  if (serialized !== lastModel) { lastModel = serialized; model.value = value; }
  const prompt = value.map(line => line.map(tagText).join("")).join("\n");
  if (text.value !== prompt) text.value = prompt;
  emit("change");
}

const referenceNode = Node.create({
  name: "promptReference", group: "inline", inline: true, atom: true,
  addAttributes: () => ({ id: { default: "", rendered: false }, name: { default: "", rendered: false }, avatar: { default: "", rendered: false }, value: { default: "", rendered: false } }),
  parseHTML: () => [{ tag: "span.imageReference[data-reference-id]", getAttrs: element => { const reference = props.references.find(reference => reference.id === element.dataset.referenceId); return reference ? referenceAttrs(reference) : false; } }],
  renderHTML({ node }) { const attrs = { class: "imageReference", "data-reference-id": node.attrs.id, "data-value": node.attrs.value, contenteditable: "false" }; return node.attrs.avatar ? ["span", attrs, ["img", { src: node.attrs.avatar, alt: "", draggable: "false" }], node.attrs.name] : ["span", attrs, node.attrs.name]; },
  renderText: ({ node }) => node.attrs.value,
});
const tokenNode = Node.create({
  name: "promptToken", group: "inline", inline: true, atom: true,
  addAttributes: () => ({ tag: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: "span[data-prompt-tag]:not([data-prompt-input])", getAttrs: parseTag }],
  renderHTML: ({ node }) => ["span", { class: "promptToken", "data-prompt-tag": JSON.stringify(node.attrs.tag), contenteditable: "false" }, tagText(node.attrs.tag)],
  renderText: ({ node }) => tagText(node.attrs.tag),
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span"); dom.className = "promptToken"; dom.contentEditable = "false";
      const key = Symbol();
      function update(current: typeof node) {
        const tag = current.attrs.tag as RichInputTag;
        dom.dataset.promptTag = JSON.stringify(tag);
        if (tag.type === "Mention") {
          let button = dom.querySelector("button");
          if (!button) {
            button = document.createElement("button"); button.type = "button"; button.className = "promptMention";
            button.addEventListener("click", () => { const target = mentionTargets.value.find(item => item.key === key); if (target) emit("mentionClick", target.tag.id); });
            dom.replaceChildren(button);
          }
          button.setAttribute("aria-label", `预览 ${tag.name}`);
          const target = { key, element: button, tag };
          mentionTargets.value = [...mentionTargets.value.filter(item => item.key !== key), target];
        } else {
          mentionTargets.value = mentionTargets.value.filter(item => item.key !== key);
          dom.textContent = tagText(tag);
        }
      }
      update(node);
      return { dom, update(next) { if (next.type !== node.type) return false; update(next); return true; }, stopEvent: event => event.target instanceof Element && !!event.target.closest("button"), ignoreMutation: () => true, destroy() { mentionTargets.value = mentionTargets.value.filter(item => item.key !== key); } };
    };
  },
});
const inputNode = Node.create({
  name: "promptInputToken", group: "inline", inline: true, atom: true,
  addAttributes: () => ({ tag: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: "span[data-prompt-input][data-prompt-tag]", getAttrs: element => { const value = parseTag(element); return value && value.tag.type === "Input" ? value : false; } }],
  renderHTML: ({ node }) => ["span", { "data-prompt-input": "", "data-prompt-tag": JSON.stringify(node.attrs.tag) }, tagText(node.attrs.tag)],
  renderText: ({ node }) => tagText(node.attrs.tag),
  addNodeView() {
    return ({ node, getPos, editor: instance }) => {
      const dom = document.createElement("span"), input = document.createElement("input"); dom.className = "promptInputToken"; dom.contentEditable = "false"; dom.append(input);
      let current = node;
      const update = () => { const tag = current.attrs.tag as Extract<RichInputTag, { type: "Input" }>; input.disabled = props.disabled; input.value = tag.text ?? ""; input.placeholder = tag.placeholder; input.setAttribute("aria-label", tag.key || tag.placeholder); input.size = Math.max(1, (tag.text || tag.placeholder).length); };
      update();
      input.addEventListener("input", () => { const position = getPos(); if (typeof position === "number" && !instance.isDestroyed) instance.view.dispatch(instance.state.tr.setNodeMarkup(position, undefined, { tag: { ...current.attrs.tag, text: input.value } })); });
      input.addEventListener("keydown", event => { const position = getPos(); if (event.key === "Enter" && !event.isComposing && typeof position === "number" && !instance.isDestroyed) { event.preventDefault(); event.stopPropagation(); instance.chain().focus().setTextSelection(position + current.nodeSize).insertContent({ type: "hardBreak" }).run(); } });
      return { dom, update(next) { if (next.type !== current.type) return false; current = next; update(); return true; }, stopEvent: event => input.contains(event.target as globalThis.Node), ignoreMutation: () => true };
    };
  },
});

function normalizeReferences(recordHistory = true) {
  if (!editor || editor.isDestroyed || editor.view.composing) return;
  const instance = editor; const edits: { from: number; to: number; attrs?: ReturnType<typeof referenceAttrs> }[] = [];
  instance.state.doc.descendants((node, position) => {
    if (node.type.name === "promptReference") { const reference = props.references.find(reference => reference.id === node.attrs.id); const attrs = reference && referenceAttrs(reference); if (!attrs || JSON.stringify(node.attrs) !== JSON.stringify(attrs)) edits.push({ from: position, to: position + node.nodeSize, attrs }); }
    else if (node.isText) for (const match of node.text!.matchAll(/\{\{ref \d+\}\}/g)) { const reference = props.references.find(reference => reference.value === match[0]); if (reference) edits.push({ from: position + match.index!, to: position + match.index! + match[0].length, attrs: referenceAttrs(reference) }); }
  });
  if (!edits.length) return;
  const transaction = instance.state.tr;
  for (const edit of edits.reverse()) { const node = transaction.doc.nodeAt(edit.from); if (edit.attrs && node?.type.name === "promptReference") transaction.setNodeMarkup(edit.from, undefined, edit.attrs); else if (edit.attrs) transaction.replaceWith(edit.from, edit.to, instance.schema.nodes.promptReference!.create(edit.attrs)); else transaction.delete(edit.from, edit.to); }
  normalizing = true;
  try { instance.view.dispatch(transaction.setMeta("addToHistory", recordHistory)); } finally { normalizing = false; }
}
function updateMenu() {
  if (!props.referenceMenuEnabled || props.disabled || !editor || editor.isDestroyed || editor.view.composing || !editor.view.hasFocus() || !editor.view.dom.getClientRects().length || !editor.state.selection.empty) { menuVisible.value = false; return; }
  const position = editor.state.selection.from; const before = editor.state.doc.textBetween(editor.state.selection.$from.start(), position, "\n", "\ufffc");
  const match = before.match(/@([^\s@]*)$/);
  if (!match) { menuVisible.value = false; dismissedMention = ""; return; }
  mentionStart = position - match[0].length;
  query.value = match[1]!; activeIndex.value = Math.min(activeIndex.value, Math.max(0, options.value.length - 1));
  const coords = editor.view.coordsAtPos(position); menuAnchor.value = { getBoundingClientRect: () => new DOMRect(coords.left, coords.bottom, 0, 0) };
  menuVisible.value = dismissedMention !== `${mentionStart}:${query.value}`;
}
function insertReference(reference: RichInputReference) {
  if (!editor || editor.isDestroyed) return;
  const current = props.references.find(item => item.id === reference.id); if (!current) return;
  menuVisible.value = false;
  editor.chain().focus().deleteRange({ from: mentionStart, to: editor.state.selection.from }).insertContent({ type: "promptReference", attrs: referenceAttrs(current) }).run();
}
function handleMentionKey(event: KeyboardEvent) {
  if (!menuVisible.value || event.isComposing || !["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  if (event.key === "Escape") { dismissedMention = `${mentionStart}:${query.value}`; menuVisible.value = false; return; }
  if (!options.value.length) return;
  if (event.key === "Enter") insertReference(options.value[activeIndex.value]!);
  else activeIndex.value = (activeIndex.value + (event.key === "ArrowDown" ? 1 : -1) + options.value.length) % options.value.length;
}
function previewReference(event: MouseEvent) {
  const tag = event.target instanceof Element ? event.target.closest<HTMLElement>(".imageReference[data-reference-id]") : null;
  const reference = props.references.find(reference => reference.id === tag?.dataset.referenceId); if (!reference?.avatar) return;
  event.preventDefault(); event.stopPropagation(); menuVisible.value = false; previewReferenceId.value = reference.id;
}
function copySelection(view: Editor["view"], event: ClipboardEvent, cut = false) {
  if (!event.clipboardData || view.state.selection.empty) return false;
  const fragment = view.state.selection.content().content; const value = readModel(fragment.toJSON() ?? []);
  event.clipboardData.setData("application/chat-nodes", JSON.stringify(value)); event.clipboardData.setData("text/plain", value.map(line => line.map(tagText).join("")).join("\n")); event.clipboardData.setData("text/html", getHTMLFromFragment(fragment, view.state.schema)); event.preventDefault();
  if (cut && editor?.isEditable) view.dispatch(view.state.tr.deleteSelection().scrollIntoView()); return true;
}
function createEditor(value: RichInputModel) {
  if (!editorElement.value) return;
  menuVisible.value = false;
  editor?.destroy();
  editor = new Editor({
    element: editorElement.value,
    editable: !props.disabled,
    extensions: [StarterKit.configure({ blockquote: false, bold: false, bulletList: false, code: false, codeBlock: false, heading: false, horizontalRule: false, italic: false, link: false, listItem: false, listKeymap: false, orderedList: false, strike: false, underline: false, dropcursor: false, gapcursor: false, trailingNode: false }), referenceNode, tokenNode, inputNode],
    content: documentModel(value),
    editorProps: {
      attributes: { class: "richEditor", role: "textbox", "aria-label": props.label, "aria-multiline": "true", "data-placeholder": props.placeholder, spellcheck: "false" },
      handlePaste(view, event) { const copied = event.clipboardData?.getData("application/chat-nodes"); if (!copied || !editor || !view.editable) return false; try { const value: unknown = JSON.parse(copied); if (!validModel(value)) return false; editor.commands.insertContent(documentModel(value).content ?? []); return true; } catch { return false; } },
      handleDOMEvents: { copy: (view, event) => copySelection(view, event), cut: (view, event) => copySelection(view, event, true), compositionend() { cancelAnimationFrame(compositionFrame); compositionFrame = requestAnimationFrame(() => { normalizeReferences(); publish(); updateMenu(); }); return false; } },
    },
    onUpdate() { if (!normalizing) normalizeReferences(); publish(); if (!normalizing) updateMenu(); },
    onSelectionUpdate() { updateMenu(); emit("cursorChange"); },
    onFocus: updateMenu,
    onBlur: () => { menuVisible.value = false; },
  });
  publish();
}
onMounted(() => createEditor(model.value.length ? model.value : text.value.split("\n").map(text => [{ type: "Write" as const, text }])));
watch(() => props.disabled, disabled => { editor?.setEditable(!disabled, false); editorElement.value?.querySelectorAll("input").forEach(input => { input.disabled = disabled; }); if (disabled) menuVisible.value = false; });
watch(model, value => {
  if (!editor || editor.isDestroyed || JSON.stringify(value) === lastModel) return;
  const selection = editor.state.selection;
  editor.commands.setContent(documentModel(value), { emitUpdate: false });
  editor.commands.setTextSelection({ from: Math.min(selection.from, editor.state.doc.content.size), to: Math.min(selection.to, editor.state.doc.content.size) });
  publish();
}, { deep: true });
watch(() => props.references, () => { normalizeReferences(false); publish(); updateMenu(); }, { deep: true });
onBeforeUnmount(() => { cancelAnimationFrame(compositionFrame); if (JSON.stringify(model.value) === lastModel) publish(); editor?.destroy(); editor = undefined; });
defineExpose({
  getEditor: () => editor,
  getText: (mapTag?: (tag: RichInputTag) => string | undefined) => readModel(editor?.getJSON().content ?? []).map(line => line.map(tag => mapTag?.(tag) ?? tagText(tag)).join("")).join("\n"),
  setModel(value: RichInputModel = [], clearHistory = true) {
    if (clearHistory) createEditor(value);
    else { editor?.commands.setContent(documentModel(value), { emitUpdate: false }); publish(); }
  },
});
</script>

<style scoped lang="scss">
.promptInput { position: relative; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); cursor: text; user-select: text; &:focus-within { border-color: var(--uiBorderFocus); outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; } :deep(.richEditor) { position: relative; min-height: 96px; max-height: 200px; padding: 12px; overflow: auto; outline: none; color: var(--uiTextPrimary); font-size: var(--uiFontBody); line-height: 1.7; white-space: pre-wrap; p { margin: 0; } } &.isEmpty :deep(.richEditor)::before { content: attr(data-placeholder); position: absolute; pointer-events: none; color: var(--uiTextMuted); } :deep(.imageReference), :deep(.promptToken) { display: inline-flex; align-items: center; gap: 6px; padding: 2px 6px; margin-inline: 3px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl); background: var(--uiActionSoft); color: var(--uiTextBody); vertical-align: middle; font-size: var(--uiFontControl); line-height: 1.6; &[data-reference-id]:has(img) { cursor: zoom-in; } img { width: 22px; height: 22px; flex-shrink: 0; object-fit: cover; border-radius: 3px; pointer-events: none; } } :deep(.promptMention) { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; } :deep(.promptInputToken) { display: inline-flex; vertical-align: baseline; input { min-width: 1ch; max-width: 100%; padding: 0 4px; border: 0; border-bottom: 1px solid var(--uiActionPrimary); background: transparent; color: var(--uiTextPrimary); font: inherit; } } }
.referenceMenu { display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow: auto; .referenceOption { display: flex; align-items: center; gap: 12px; width: 100%; padding: 8px; border: 0; border-radius: var(--uiRadiusControl); background: transparent; color: var(--uiTextBody); font: inherit; font-size: var(--uiFontControl); text-align: left; cursor: pointer; &.isActive, &:hover { background: var(--uiActionSoft); } img { width: 32px; height: 32px; flex-shrink: 0; object-fit: cover; border-radius: var(--uiRadiusControl); } span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } } .noReferences { margin: 8px; color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
</style>

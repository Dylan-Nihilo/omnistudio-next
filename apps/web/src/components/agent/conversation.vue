<template>
  <div class="agentConversation">
    <div class="messageViewport">
      <div ref="messageList" class="messageList" role="region" aria-label="对话消息" tabindex="0">
        <div v-if="!messages.length && !disabled" class="welcomeArea">
            <section class="welcomeMessage" aria-label="开始新对话">
              <div class="welcomeHeader">
                <span class="welcomeIcon" aria-hidden="true"><img class="welcomeLogo" :src="logoUrl" alt="OmniStudio" /></span>
                <div>
                  <p class="welcomeLabel">你好，我是 Toonflow 助手</p>
                  <h3>从一个想法开始</h3>
                </div>
              </div>
              <p class="welcomeDescription">聊聊你的故事、画面或镜头，让我们一起把想法落到画布上。</p>
              <div class="welcomeSuggestions">
                <uiButton v-for="item in welcomeSuggestions" :key="item.label" class="welcomeSuggestion" variant="secondary" :disabled="locked" :aria-label="`填入提示：${item.label}`" @click="fillPrompt(item.prompt)">
                  <component :is="item.icon" :size="19" aria-hidden="true" />
                  <span class="suggestionContent"><strong>{{ item.label }}</strong><span>{{ item.description }}</span></span>
                  <icon-arrow-up-right class="suggestionArrow" :size="15" aria-hidden="true" />
                </uiButton>
              </div>
              <p class="welcomeHint">点击填入提示，也可以直接输入，或粘贴图片、视频。</p>
            </section>
          </div>
        <div class="messageSpace" :style="{ height: `${messageVirtualizer.getTotalSize()}px` }">
          <div
            v-for="{ item, row } in visibleMessages"
            :key="item.id"
            :ref="measureMessage"
            :data-index="row.index"
            :data-message-id="item.id"
            class="messageRow"
            :style="{ transform: `translateY(${row.start}px)` }"
            :class="{ userMessage: item.role === 'user', editingMessage: editingId === item.id }">
            <article class="messageBubble" :aria-label="item.role === 'user' ? '你的消息' : '助手消息'">
              <div v-if="item.streaming && !compacting && !item.parts?.some(part => part.type === 'tool' || part.content)" class="replyingIndicator" role="status"><icon-loader-2 class="isLoading" :size="15" aria-hidden="true" />正在回复…</div>
                <div class="messageContent">
                  <div v-if="item.report" class="reportHeader"><icon-users-group :size="14" />{{ item.report.name }} 上报</div>
                  <template v-for="part in item.parts" :key="part.id">
                    <details v-if="part.type === 'thinking' && part.content" class="messageReasoning" :open="!(part.collapsed ?? true)" @toggle="part.collapsed = !($event.target as HTMLDetailsElement).open">
                      <summary>
                        <span class="reasoningHeader">
                          <icon-atom :size="14" />
                          <span>思考</span>
                          <span v-if="part.duration !== undefined" class="thinkingDuration">{{ part.duration.toFixed(1) }} 秒</span>
                        </span>
                      </summary>
                      <messageMarkdown v-if="!(part.collapsed ?? true)" :content="part.content" :streaming="!!item.streaming" :directory="directory" />
                    </details>
                    <toolMessage v-else-if="part.type === 'tool'" v-model:collapsed="part.collapsed" :tool="part.tool" :directory="directory" @copy="copyMessage" />
                    <messageMarkdown v-else-if="part.type === 'text' && part.content" :content="part.content" :streaming="!!item.streaming" :directory="directory" />
                  </template>
                  <attachmentList v-if="item.attachments?.length" :attachments="item.attachments" :directory="directory" />
                  <div v-if="item.role === 'user'" class="messageText"><mentionContent :content="item.content" :mentions="item.mentions" :directory="directory" /></div>
                  <div v-if="item.error" class="messageError" role="alert">{{ item.error }}</div>
                </div>
            </article>
            <div v-if="!item.streaming" class="messageActions">
              <template v-if="editingId === item.id">
                <uiButton variant="ghost" size="small" :disabled="busy || deletingId !== undefined" @click="cancelEdit"><icon-x :size="14" />取消</uiButton>
                <span class="editingHint">正在下方编辑</span>
              </template>
              <template v-else>
                <uiButton v-if="item.content" class="messageAction" variant="ghost" aria-label="复制消息" title="复制消息" @click="copyMessage(mentionPlainText(item.content, item.mentions))"><icon-copy :size="14" /></uiButton>
                <template v-if="item.role === 'user'">
                  <uiButton class="messageAction" variant="ghost" :disabled="locked || remoteRunning" aria-label="编辑消息" title="编辑消息" @click="editMessage(item)"><icon-pencil :size="14" /></uiButton>
                </template>
                <uiButton v-if="!item.report" class="messageAction" variant="ghost" :loading="deletingId === item.id" :disabled="locked || remoteRunning" aria-label="删除消息" title="删除消息" @click="deleteMessage(item)"><icon-trash v-if="deletingId !== item.id" :size="14" /></uiButton>
              </template>
            </div>
          </div>
        </div>
      </div>
      <uiButton v-if="messages.length && !atLatestMessage" class="scrollBottom" aria-label="回到最新消息" title="回到最新消息" @click="messageVirtualizer.scrollToEnd()"><icon-arrow-down :size="18" /></uiButton>
    </div>
    <div v-if="compacting" class="compactionStatus" role="status">
      <icon-loader-2 class="isLoading" :size="14" aria-hidden="true" />
      <span>正在压缩上下文…</span>
    </div>
    <div class="messageInput">
      <div v-if="editingId" class="editingBanner"><span>编辑消息</span><uiButton variant="ghost" size="small" :disabled="busy" @click="cancelEdit">取消</uiButton></div>
      <div
        class="senderResizeHandle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="调整输入框高度"
        aria-valuemin="44"
        :aria-valuemax="senderMaxHeight"
        :aria-valuenow="senderHeight"
        tabindex="0"
        title="拖动调整输入框高度"
        @focus="senderHeight = getSenderHeight()"
        @pointerdown="startSenderResize"
        @pointermove="moveSenderResize"
        @pointerup="stopSenderResize"
        @pointercancel="stopSenderResize"
        @lostpointercapture="stopSenderResize"
        @keydown.up.prevent="setSenderHeight((getSenderHeight()) + 16)"
        @keydown.down.prevent="setSenderHeight((getSenderHeight()) - 16)" />
      <attachmentList v-if="draftAttachments.length" class="draftAttachments" :attachments="draftAttachments" :directory="directory" removable @remove="draftAttachments.splice($event, 1)" />
      <div ref="senderElement" class="senderEditor" :style="{ '--senderHeight': senderFixedHeight ? senderFixedHeight + 'px' : undefined }" @keydown.capture="handleSenderKeydown">
        <promptInput ref="senderInput" v-model="draftModel" v-model:text="draftText" :disabled="locked || !active" label="消息" placeholder="输入消息，@ 提及节点输出或全局素材…" :referenceMenuEnabled="false" @change="updateDraftQuery" @cursorChange="updateDraftQuery" @mentionClick="id => draftMentionPreview?.preview(id)">
          <template #mention="{ id, name }"><mentionThumbnail v-if="draftMentions.find(mention => mention.id === id)" class="draftMentionThumbnail" v-bind="mentionThumbnailProps(draftMentions.find(mention => mention.id === id)!)" :directory="directory"><icon-photo :size="14" /></mentionThumbnail><span>@{{ name }}</span></template>
        </promptInput>
      </div>
      <mentionContent ref="draftMentionPreview" :mentions="draftMentions" :directory="directory" removable @remove="removeDraftMention" />
      <div class="senderActions">
        <modelPopover v-model="selectedModel" v-model:reasoningEffort="reasoningEffort" :active="active" :disabled="disabled" />
        <mentionMenu ref="mentionMenuRef" :directory="directory" :active="active" :disabled="locked || !directory" :query="mentionQuery" :editor="senderElement" :currentCanvasId="createCanvasContext?.()?.id" @open="captureMentionPosition" @select="insertMentions" @dismiss="mentionQuery = undefined" />
        <skillMenu ref="skillMenuRef" :directory="directory" :active="active" :disabled="locked || !directory" :query="skillQuery" :editor="senderElement" @select="selectSkill" @dismiss="skillQuery = undefined" />
        <uiPopover
          v-model:visible="contextMenuVisible"
          trigger="click"
          placement="top"
          :width="280"
          :offset="10"
          title="上下文用量">
          <template #reference="{ triggerAttrs }">
            <uiButton v-bind="triggerAttrs" class="contextButton" variant="ghost" aria-label="查看上下文用量" title="查看上下文用量">
              <icon-circle-dashed :size="14" />
            </uiButton>
          </template>
          <div class="contextUsage">
            <div class="contextHeader"><span>上下文用量</span><span class="contextHint">估算</span></div>
            <template v-if="contextUsage?.tokens != null">
              <div class="contextTokens">
                <span>{{ contextUsage.tokens.toLocaleString() }} / {{ contextWindow.toLocaleString() }} tok</span>
                <span>{{ contextPercent.toFixed(1) }}%</span>
              </div>
              <uiProgress :percentage="Math.min(100, contextPercent)" label="上下文用量" />
            </template>
            <span v-else class="contextHint">{{ contextUsage ? "等待下一次回复更新用量" : "尚无用量数据" }}</span>
            <div v-if="stats" class="contextStats">
              <div class="contextHeader">对话累计用量</div>
              <div class="contextTokens"><span>输入</span><span>{{ inputTokens.toLocaleString() }} tok</span></div>
              <div class="contextTokens"><span>输出</span><span>{{ stats.tokens.output.toLocaleString() }} tok</span></div>
              <div v-if="inputTokens > 0" class="contextTokens"><span>缓存命中</span><span>{{ (stats.tokens.cacheRead / inputTokens * 100).toFixed(1) }}%</span></div>
              <div v-if="stats.tokensPerSecond !== undefined" class="contextTokens"><span>生成速度</span><span>{{ stats.tokensPerSecond.toFixed(1) }} tok/s</span></div>
            </div>
          </div>
        </uiPopover>
        <uiButton class="sendButton" variant="primary" :disabled="!busy && locked" :aria-label="busy ? '停止生成' : editingId ? '重发消息' : '发送消息'" :title="busy ? '停止生成' : editingId ? '重发消息' : '发送消息'" @click="busy ? stopMessage() : submitMessage()">
          <icon-player-stop-filled v-if="busy" :size="14" />
          <icon-arrow-up v-else :size="16" />
        </uiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, reactive, ref, watch, type ComponentPublicInstance } from "vue";
import { defaultRangeExtractor, observeElementRect, useVirtualizer } from "@tanstack/vue-virtual";
import axios from "axios";
import {
  IconArrowUp, IconArrowDown, IconAtom, IconCopy,
  IconCircleDashed, IconPencil, IconPlayerStopFilled, IconX, IconLoader2,
  IconTrash, IconLayoutGrid, IconMovie, IconPhoto, IconArrowUpRight, IconUsersGroup,
} from "@tabler/icons-vue";
import { uiButton, uiPopover, uiProgress, useUiFeedback } from "@toonflow/ui";
import promptInput from "@toonflow/nodes-scaffold/promptInput";
import type { RichInputModel } from "@toonflow/nodes-scaffold/richInputTypes";
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
import modelPopover from "@/components/modelPopover.vue";
import skillMenu from "./skillMenu.vue";
import mentionMenu from "./mentionMenu.vue";
import mentionContent from "./mentionContent.vue";
import mentionThumbnail from "./mentionThumbnail.vue";
import { mentionName, mentionParts, mentionPlainText, mentionThumbnailProps } from "./mentionText";
import toolMessage from "./toolMessage.vue";
import attachmentList from "./attachmentList.vue";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { writeClipboardText } from "@/lib/clipboard";
import anonymousData from "@/lib/anonymousData";
import { modelChoices } from "@/stores/settings";
import { useWorkspaceStore } from "@/stores/workspace";
import type { AgentAttachment, AgentConversation, AgentMessage } from "./types";
import type { AgentEvent, AgentMention } from "@toonflow/server/agent/types";
import { createConversationStream, readAgentEvents } from "./replyStream";
import type { CanvasContext } from "@toonflow/tool-canvas/runtime";
import messageMarkdown from "@/components/messageMarkdown.vue";

const props = defineProps<{ active: boolean; initialSession: AgentConversation | null; sessionFile?: string; disabled: boolean }>();
const emit = defineEmits<{ session: [file: string]; sent: [prompt: string]; event: [event: AgentEvent] }>();
const workspaceStore = useWorkspaceStore();
const feedback = useUiFeedback();
const senderInput = ref<InstanceType<typeof promptInput>>();
const draftModel = ref<RichInputModel>([]);
const draftText = ref("");
const directory = workspaceStore.project?.directory;
const draftAttachments = ref<AgentAttachment[]>([]);
const createCanvasContext = inject<(() => CanvasContext | undefined) | undefined>("canvas", undefined);
const messages = ref<AgentMessage[]>((props.initialSession?.messages ?? []).map(message => ({ ...message })));
const stream = createConversationStream(messages);
const remoteRunning = ref(props.initialSession?.running ?? false);
const stats = ref(props.initialSession?.stats);
const contextUsage = ref(props.initialSession?.contextUsage);
const busy = ref(false);
const compacting = ref(false);
const deletingId = ref<string>();
const locked = computed(() => props.disabled || busy.value || deletingId.value !== undefined);
const editingId = ref<string>();
const draftMentions = ref<AgentMention[]>([]);
const draftMentionPreview = ref<InstanceType<typeof mentionContent>>();
let editDraft: { model: RichInputModel; mentions: AgentMention[]; attachments: AgentAttachment[] } | undefined;
const messageList = ref<HTMLDivElement>();
const atLatestMessage = ref(true);
let messageListInitialized = false;
let messageScrollOffset = 0;
const messageKeys = computed(() => messages.value.map(item => item.id));
const retainedMessages = computed(() => messages.value.flatMap((item, index) => item.streaming || item.id === editingId.value ? [index] : []));
const messageVirtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>(computed(() => {
  const keys = messageKeys.value;
  const retained = retainedMessages.value;
  return {
    count: keys.length,
    getScrollElement: () => messageList.value ?? null,
    getItemKey: (index: number) => keys[index]!,
    estimateSize: () => 240,
    overscan: 3,
    paddingStart: 12,
    anchorTo: "end" as const,
    followOnAppend: true,
    scrollEndThreshold: 48,
    useAnimationFrameWithResizeObserver: true,
    useCachedMeasurements: !props.active,
    // ACT: v-show 隐藏时保留视口与行高，避免零尺寸清空正在输入的工具表单。
    observeElementRect: (instance, onChange) => observeElementRect(instance, rect => { if (rect.height) onChange(rect); }),
    rangeExtractor: range => [...new Set([...defaultRangeExtractor(range), ...retained])].sort((left, right) => left - right),
    onChange(instance) {
      if (!messageListInitialized || !props.active || !messageList.value?.clientHeight) return;
      atLatestMessage.value = instance.isAtEnd();
      messageScrollOffset = instance.scrollOffset ?? 0;
    },
  };
}));
const visibleMessages = computed(() => messageVirtualizer.value.getVirtualItems().map(row => ({ row, item: messages.value[row.index]! })));

function measureMessage(element: Element | ComponentPublicInstance | null) {
  messageVirtualizer.value.measureElement(element instanceof HTMLDivElement ? element : null);
}

watch([() => props.active, messageList], async ([active, element]) => {
  if (!active || !element) return;
  await nextTick();
  if (!props.active) return;
  if (!messageListInitialized || atLatestMessage.value) messageVirtualizer.value.scrollToEnd();
  else messageVirtualizer.value.scrollToOffset(messageScrollOffset);
  messageListInitialized = true;
}, { immediate: true, flush: "post" });
function getSender() { return senderInput.value?.getEditor(); }
function getSenderHeight() { return senderElement.value?.querySelector<HTMLElement>(".richEditor")?.clientHeight ?? 44; }
let controller: AbortController | undefined;
const senderElement = ref<HTMLElement>();
const skillMenuRef = ref<InstanceType<typeof skillMenu>>();
const skillQuery = ref<string>();
const mentionMenuRef = ref<InstanceType<typeof mentionMenu>>();
const mentionQuery = ref<string>();
let mentionPosition: { from: number; to: number } | undefined;
let insertingMentions = false;
const senderHeight = ref(44);
const senderFixedHeight = ref<number>();
const senderMaxHeight = ref(Math.max(44, window.innerHeight / 2));
let senderResize: { pointerId: number; y: number; height: number } | undefined;
const pendingMessage = props.initialSession?.parentFile ? undefined : workspaceStore.pendingAgentMessage;
const selectedModel = ref(pendingMessage?.model ?? (props.initialSession?.providerId && props.initialSession.modelId
  ? JSON.stringify([props.initialSession.providerId, props.initialSession.modelId]) : ""));
const contextMenuVisible = ref(false);
const reasoningEffort = ref(pendingMessage?.reasoningEffort ?? (props.initialSession?.thinkingLevel === "off" ? "" : props.initialSession?.thinkingLevel ?? ""));
const selectedModelChoice = computed(() => modelChoices.value.find(item => item.value === selectedModel.value));
const contextWindow = computed(() => contextUsage.value?.contextWindow ?? selectedModelChoice.value?.contextWindow ?? 262144);
const contextPercent = computed(() => (contextUsage.value?.tokens ?? 0) / contextWindow.value * 100);
const inputTokens = computed(() => stats.value ? stats.value.tokens.input + stats.value.tokens.cacheRead + stats.value.tokens.cacheWrite : 0);
const welcomeSuggestions = [
  { label: "搭建创作画布", description: "把创意串成清晰的节点流程", icon: IconLayoutGrid, prompt: "帮我搭建一个创作画布，先和我确认需要的节点与流程。" },
  { label: "梳理故事分镜", description: "拆解故事，安排画面与镜头", icon: IconMovie, prompt: "帮我把故事整理成分镜，先和我确认故事内容、时长和画面风格。" },
  { label: "生成图片素材", description: "为角色和场景寻找视觉方向", icon: IconPhoto, prompt: "帮我生成图片素材，先和我确认画面内容、风格和使用的模型。" },
];
watch([locked, () => props.active], ([locked, active]) => {
  getSender()?.setEditable(active && !locked, false);
});
watch(() => props.active, active => {
  if (!active) contextMenuVisible.value = false;
});

function applyEvent(event: AgentEvent) {
  switch (event.type) {
    case "subAgent":
    case "subAgentEvent": emit("event", event); break;
    case "report":
      if (event.parentFile !== props.sessionFile) { emit("event", event); break; }
      if (!messages.value.some(message => message.id === event.id)) messages.value.push({
        id: event.id, role: "assistant", content: event.content,
        parts: [{ id: event.id, type: "text", content: event.content }], report: { file: event.file, name: event.name },
      });
      break;
    case "compaction": compacting.value = event.active; break;
    case "session": emit("session", event.file); break;
    case "stats": stats.value = event.stats; contextUsage.value = event.contextUsage; break;
    default: stream.receive(event);
  }
}

function receiveEvent(event: AgentEvent) {
  if (event.type === "done" || event.type === "error") {
    remoteRunning.value = false;
    compacting.value = false;
  } else if (["userMessage", "text", "thinking", "tool"].includes(event.type)) remoteRunning.value = true;
  applyEvent(event);
}

defineExpose({ receiveEvent });

function getDraftContent() {
  return senderInput.value?.getText(tag => tag.type === "Mention" ? `{{mention:${tag.id}}}` : undefined).replace(/[\ufeff\u200b]/g, "") ?? "";
}

function captureMentionPosition() {
  const editor = getSender();
  if (!editor || editor.isDestroyed) return;
  const { from, to } = editor.state.selection;
  mentionPosition = { from: Math.max(0, from - (mentionQuery.value === undefined ? 0 : mentionQuery.value.length + 1)), to };
  skillQuery.value = undefined;
}

function updateDraftQuery() {
  const editor = getSender();
  if (!editor || insertingMentions || editor.view.composing) return;
  skillQuery.value = /^\/([^\s/]*)$/.exec(draftText.value)?.[1];
  if (!editor.view.hasFocus() || !editor.state.selection.empty) return;
  const { from, $from } = editor.state.selection;
  const before = editor.state.doc.textBetween($from.start(), from, "\n", "\ufffc");
  mentionQuery.value = /(?:^|[^\w@])@([^\s@]*)$/.exec(before)?.[1];
  if (mentionQuery.value !== undefined) captureMentionPosition();
}

function handleSenderKeydown(event: KeyboardEvent) {
  if (mentionMenuRef.value?.handleKeydown(event)) return;
  skillMenuRef.value?.handleKeydown(event);
  if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || getSender()?.view.composing) return;
  if (event.key === "Enter" && !event.shiftKey && event.target instanceof Element && event.target.closest(".richEditor") && !event.target.closest("button,input")) {
    event.preventDefault();
    void submitMessage();
  }
}

async function insertMentions(mentions: AgentMention[]) {
  const editor = getSender();
  if (!editor || editor.isDestroyed || locked.value || !props.active) return;
  const currentIds = new Set(draftModel.value.flat().flatMap(tag => tag.type === "Mention" ? [tag.id] : []));
  if (currentIds.size + mentions.length > 20) return feedback.message({ tone: "warning", message: "每条消息最多提及 20 个输出或素材" });
  insertingMentions = true;
  try {
    const range = mentionPosition ?? { from: editor.state.doc.content.size - 1, to: editor.state.doc.content.size - 1 };
    draftMentions.value.push(...mentions);
    editor.chain().focus().deleteRange(range).insertContent(mentions.map(mention => ({ type: "promptToken", attrs: { tag: { type: "Mention", id: mention.id, name: mentionName(mention) } } }))).run();
  } catch (error) {
    feedback.message({ tone: "error", message: error instanceof Error ? error.message : "添加提及失败" });
  } finally {
    mentionQuery.value = undefined;
    mentionPosition = undefined;
    insertingMentions = false;
  }
}

async function removeDraftMention(id: string) {
  const editor = getSender();
  if (locked.value || !editor || editor.isDestroyed) return;
  const positions: { from: number; to: number }[] = [];
  editor.state.doc.descendants((node, from) => { if (node.attrs.tag?.type === "Mention" && node.attrs.tag.id === id) positions.push({ from, to: from + node.nodeSize }); });
  const transaction = editor.state.tr;
  for (const range of positions.reverse()) transaction.delete(range.from, range.to);
  editor.view.dispatch(transaction);
}

function submitMessage() {
  return sendMessage(editingId.value ? messages.value.find(item => item.id === editingId.value) : undefined);
}

async function selectSkill(name: string) {
  const input = senderInput.value;
  if (!input || locked.value) return;
  const model = structuredClone(draftModel.value.map(line => line.map(tag => ({ ...tag }))));
  const first = model[0]?.[0];
  if (first?.type === "Write") first.text = `/skill:${name} ${first.text.replace(skillQuery.value !== undefined ? /^\/\S*/ : /^\s*\/skill:\S+(?:\s+|$)/, "")}`;
  if (!model.length) model.push([]);
  if (first?.type !== "Write") model[0]!.unshift({ type: "Write", text: `/skill:${name} ` });
  skillQuery.value = undefined;
  mentionMenuRef.value?.closeMenu();
  input.setModel(model, false);
  await nextTick();
  if (senderInput.value === input) input.getEditor()?.commands.focus("end");
}

async function fillPrompt(prompt: string) {
  const input = senderInput.value;
  if (!input || locked.value) return;
  draftMentions.value = [];
  input.setModel([[{ type: "Write", text: prompt }]], false);
  await nextTick();
  if (senderInput.value === input) input.getEditor()?.commands.focus("end");
}

async function copyMessage(content: string) {
  try {
    await writeClipboardText(content);
    feedback.message({ tone: "success", message: "已复制" });
  } catch {
    feedback.message({ tone: "error", message: "复制失败，请重试" });
  }
}

async function editMessage(item: AgentMessage) {
  const instance = getSender();
  if (!instance || locked.value || remoteRunning.value || item.role !== "user") return;
  if (!editingId.value) editDraft = { model: draftModel.value.map(line => line.map(tag => ({ ...tag }))), mentions: [...draftMentions.value], attachments: [...draftAttachments.value] };
  editingId.value = item.id;
  draftMentions.value = [...item.mentions ?? []];
  draftAttachments.value = [...item.attachments ?? []];
  mentionMenuRef.value?.closeMenu();
  const model: RichInputModel = item.content.split("\n").map(line => mentionParts(line, item.mentions).map(part => part.mention
    ? { type: "Mention", id: part.mention.id, name: mentionName(part.mention) } : { type: "Write", text: part.text }));
  senderInput.value?.setModel(model);
  await nextTick();
  getSender()?.commands.focus("end");
}

async function restoreEditingDraft() {
  const draft = editDraft;
  editDraft = undefined;
  editingId.value = undefined;
  draftMentions.value = draft?.mentions ?? [];
  draftAttachments.value = draft?.attachments ?? [];
  senderInput.value?.setModel(draft?.model ?? []);
}

async function cancelEdit() {
  if (busy.value || deletingId.value !== undefined) return;
  await restoreEditingDraft();
}

async function deleteMessage(item: AgentMessage) {
  if (locked.value || remoteRunning.value || item.streaming || item.report) return;
  deletingId.value = item.id;
  try {
    if (item.entryId || item.replyTo) {
      if (!directory || !props.sessionFile) throw new Error("请重新打开对话后再删除");
      const { data } = await axios.delete<{ code: number; data: AgentConversation; message?: string }>("/api/agent/message", {
        data: {
          directory, sessionFile: props.sessionFile,
          ...(item.replyTo ? { replyTo: item.replyTo } : { entryIds: [item.entryId!] }),
        },
        headers: { "x-toonflow-workspace": "1" },
      });
      if (data.code !== 200) throw new Error(data.message || "删除消息失败");
      stats.value = data.data.stats;
      contextUsage.value = data.data.contextUsage;
    }
    messages.value = messages.value.filter(message => message.id !== item.id);
  } catch (error) {
    const message = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message : undefined;
    feedback.message({ tone: "error", message: message || (error instanceof Error ? error.message : "删除消息失败") });
  } finally {
    deletingId.value = undefined;
  }
}

function setSenderHeight(height: number) {
  if (!getSender()) return;
  senderMaxHeight.value = Math.max(44, window.innerHeight / 2);
  senderHeight.value = Math.max(44, Math.min(senderMaxHeight.value, Math.round(height)));
  senderFixedHeight.value = senderHeight.value;
}

function startSenderResize(event: PointerEvent) {
  if (event.button !== 0 || senderResize || !getSender()) return;
  event.preventDefault();
  senderResize = { pointerId: event.pointerId, y: event.clientY, height: getSenderHeight() };
  senderHeight.value = senderResize.height;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function moveSenderResize(event: PointerEvent) {
  if (senderResize?.pointerId !== event.pointerId) return;
  setSenderHeight(senderResize.height + senderResize.y - event.clientY);
}

function stopSenderResize(event: PointerEvent) {
  if (senderResize?.pointerId === event.pointerId) senderResize = undefined;
}

function stopMessage() {
  controller?.abort();
}

async function uploadAttachments(attachments: AgentAttachment[], directory: string, signal: AbortSignal) {
  if (!attachments.some(item => item.file)) return;
  const files = useWorkspaceFiles(directory);
  for (const path of ["assets", "assets/chat"]) {
    await files.mkdir(path).catch(error => {
      if (error?.response?.data?.data?.code !== "EEXIST") throw error;
    });
    signal.throwIfAborted();
  }
  for (const attachment of attachments) {
    if (!attachment.file) continue;
    const extension = attachment.name.match(/\.[a-zA-Z0-9]{1,10}$/)?.[0].toLowerCase() ?? "";
    const path = `assets/chat/${crypto.randomUUID()}${extension}`;
    await files.write(path, attachment.file, true, signal);
    attachment.path = path;
    attachment.file = undefined;
    signal.throwIfAborted();
  }
}

async function sendCanvasResult(event: Extract<AgentEvent, { type: "canvasCall" }>, canvasContext: CanvasContext | undefined, signal: AbortSignal) {
  let body: string;
  try {
    if (!canvasContext) throw new Error("当前页面没有激活的画布");
    const result = await canvasContext.call(event, signal);
    body = JSON.stringify({ directory, callId: event.callId, result: result ?? null });
  } catch (error) {
    body = JSON.stringify({ directory, callId: event.callId, error: (error instanceof Error && error.message ? error.message : "画布操作失败").slice(0, 8000) });
  }
  const cancelled = signal.aborted;
  if (cancelled) body = JSON.stringify({ directory, callId: event.callId, error: "画布操作已取消" });
  const response = await fetch("/api/agent/canvasResult", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" },
    body,
    keepalive: cancelled,
    signal: cancelled ? AbortSignal.timeout(5000) : signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.message || "画布操作结果回传失败");
  }
}

async function sendMessage(source?: AgentMessage) {
  const instance = getSender();
  const editing = source && editingId.value === source.id;
  const prompt = (source && !editing ? source.content : getDraftContent()).trim();
  const attachments = reactive((source && !editing ? source.attachments ?? [] : draftAttachments.value).map(item => ({ ...item })));
  const mentionedIds = source && !editing ? (source.mentions ?? []).filter(mention => prompt.includes(`{{mention:${mention.id}}}`)).map(mention => mention.id)
    : draftModel.value.flat().flatMap(tag => tag.type === "Mention" ? [tag.id] : []);
  const references = source && !editing ? source.mentions ?? [] : draftMentions.value;
  const mentions = references.filter(mention => mentionedIds.includes(mention.id)).map(mention => ({ ...mention }));
  if (mentionedIds.some(id => !mentions.some(mention => mention.id === id))) return feedback.message({ tone: "warning", message: "存在无法读取的提及，请删除后重新选择" });
  if (!source && editingId.value !== undefined) return;
  const resendIndex = source ? messages.value.findIndex(item => item.id === source.id) : -1;
  if (source && (source.role !== "user" || resendIndex < 0)) return;
  const resendFrom = source ? source.entryId ?? messages.value.slice(resendIndex + 1).find(item => item.role === "user" && item.entryId)?.entryId : undefined;
  if (locked.value || !instance || (!prompt && !attachments.length)) return;
  const model = selectedModelChoice.value;
  if (!directory) return feedback.message({ tone: "warning", message: "请先打开项目" });
  if (!model) return feedback.message({ tone: "warning", message: "请先选择模型" });

  const requestController = new AbortController();
  const canvasContext = createCanvasContext?.();
  controller = requestController;
  busy.value = true;
  compacting.value = false;
  instance.setEditable(false, false);
  const reply = reactive<AgentMessage>({ id: crypto.randomUUID(), role: "assistant", content: "", parts: [], streaming: true });
  const userMessage = reactive<AgentMessage>({ id: crypto.randomUUID(), role: "user", content: prompt, attachments, mentions });
  let ownsStream = !remoteRunning.value;
  let forwarded = false;
  if (!source) {
    messages.value.push(userMessage);
    if (ownsStream) messages.value.push(reply);
    draftAttachments.value = [];
    draftMentions.value = [];
  }
  let accepted = false;
  if (ownsStream) stream.begin(reply);
  const handledCanvasCalls = new Set<string>();
  const pendingQuestions = new Map<string, string>();
  const activeChildFiles = new Set<string>();
  const finishStats = anonymousData.startAgent();
  try {
    if (!source) senderInput.value?.setModel();
    requestController.signal.throwIfAborted();
    await uploadAttachments(attachments, directory, requestController.signal);
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" },
      body: JSON.stringify({ prompt, mentions, attachments: attachments.map(({ name, path, mimeType }) => ({ name, path, mimeType })), directory, providerId: model.providerId, modelId: model.modelId, thinkingLevel: reasoningEffort.value || undefined, sessionFile: props.sessionFile, resendFrom, canvas: canvasContext ? { id: canvasContext.id, tools: canvasContext.tools } : undefined }),
      signal: requestController.signal,
    });
    for await (const event of readAgentEvents(response, requestController.signal)) {
      // 子任务复用发起委派时的画布与取消通道，界面切换不改变工具执行目标。
      let toolEvent: AgentEvent = event;
      let scope = "";
      while (toolEvent.type === "subAgentEvent") {
        if (toolEvent.event.type === "done" || toolEvent.event.type === "error") activeChildFiles.delete(toolEvent.file);
        else activeChildFiles.add(toolEvent.file);
        scope += `${toolEvent.file}/`;
        toolEvent = toolEvent.event;
      }
      if (toolEvent.type === "question") pendingQuestions.set(`${scope}${toolEvent.toolCallId}`, toolEvent.callId);
      if (toolEvent.type === "tool" && toolEvent.tool.status !== "running") pendingQuestions.delete(`${scope}${toolEvent.tool.id}`);
      if (toolEvent.type === "canvasCall") {
        if (handledCanvasCalls.has(toolEvent.callId)) throw new Error("收到重复的画布调用");
        handledCanvasCalls.add(toolEvent.callId);
        await sendCanvasResult(toolEvent, canvasContext, requestController.signal);
        continue;
      }
      switch (event.type) {
        case "accepted":
          forwarded = true;
          if (ownsStream) {
            stream.finish();
            messages.value = messages.value.filter(message => message !== reply);
          }
          break;
        case "userMessage":
          if (!ownsStream) {
            messages.value.push(reply);
            stream.begin(reply);
          }
          userMessage.entryId = event.id;
          reply.replyTo = event.id;
          if (source && !accepted) {
            messages.value.splice(resendIndex, messages.value.length - resendIndex, userMessage, reply);
            stats.value = undefined;
            contextUsage.value = undefined;
            await restoreEditingDraft();
          }
          accepted = true;
          ownsStream = true;
          applyEvent(event);
          break;
        case "stats":
          if (source && !accepted) break;
          applyEvent(event);
          break;
        default: applyEvent(event);
      }
    }
    if (source && !accepted) throw new Error("服务端未确认重发，请重新打开对话后重试");
    finishStats("success");
    emit("sent", mentionPlainText(prompt, mentions) || attachments[0]?.name || "新对话");
  } catch (error) {
    finishStats(requestController.signal.aborted ? "cancelled" : "failed");
    const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    const message = requestController.signal.aborted ? "已停止生成" : responseMessage || (error instanceof Error ? error.message : "发送失败，请重试");
    if ((source && !accepted) || !ownsStream) { userMessage.error = message; feedback.message({ tone: "error", message: message }); }
    else reply.error = message;
    if (ownsStream && props.initialSession?.parentFile && props.sessionFile) {
      emit("event", { type: "subAgentEvent", file: props.sessionFile, event: { type: "error", message } });
    }
  } finally {
    for (const file of activeChildFiles) emit("event", { type: "subAgentEvent", file, event: { type: "error", message: "委派连接已结束，请重新打开子会话查看结果" } });
    // ACT: Bun 的流断开事件可能不触发；主动结束仍在等待的提问，不依赖断开通知。
    for (const callId of pendingQuestions.values()) {
      void fetch("/api/agent/answer", {
        method: "POST", headers: { "Content-Type": "application/json", "x-toonflow-workspace": "1" },
        body: JSON.stringify({ directory, callId, cancelled: true }), keepalive: true,
      }).catch(() => {});
    }
    if (ownsStream && !forwarded) stream.finish();
    compacting.value = false;
    busy.value = false;
    controller = undefined;
  }
}

function pasteAttachments(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []);
  if (!files.length) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (locked.value) return;
  for (const file of files) {
    if (!/^(image|video)\//.test(file.type)) {
      feedback.message({ tone: "warning", message: "只支持图片和视频文件" });
      continue;
    }
    if (!file.size || file.size > 100 * 1024 * 1024) {
      feedback.message({ tone: "warning", message: "附件不能为空且不能超过 100 MB" });
      continue;
    }
    if (draftAttachments.value.length >= 20) {
      feedback.message({ tone: "warning", message: "每条消息最多添加 20 个附件" });
      break;
    }
    draftAttachments.value.push({ name: file.name, path: "", mimeType: file.type, file });
  }
}

watch(senderElement, (element, _previous, onCleanup) => {
  if (!element) return;
  element.addEventListener("paste", pasteAttachments, true);
  onCleanup(() => element.removeEventListener("paste", pasteAttachments, true));
});
onBeforeUnmount(() => { controller?.abort(); senderResize = undefined; });

watch(() => !props.initialSession?.parentFile && !!workspaceStore.pendingAgentMessage && props.active && !locked.value && !!senderInput.value && !!createCanvasContext?.(), async ready => {
  const message = workspaceStore.pendingAgentMessage;
  const instance = getSender();
  if (!ready || !message || !instance || message.directory !== directory) return;
  workspaceStore.pendingAgentMessage = null;
  await fillPrompt(message.prompt);
  if (getSender() === instance && props.active) void sendMessage();
}, { flush: "post" });
</script>

<style scoped lang="scss">
.agentConversation {
  display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden;
  .messageViewport { position: relative; flex: 1; min-height: 0;
    .messageList { height: 100%; overflow: auto; overflow-anchor: none; scrollbar-gutter: stable; overscroll-behavior: contain; padding-inline: 18px; }
    .welcomeArea { padding: 24px 0; }
    .welcomeMessage { display: flex; flex-direction: column; gap: 20px;
      .welcomeHeader { display: flex; flex-wrap: wrap; align-items: center; gap: 16px;
        .welcomeIcon { display: flex; .welcomeLogo { width: 112px; height: auto; object-fit: contain; } }
        .welcomeLabel { margin: 0 0 4px; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
        h3 { margin: 0; font-size: var(--uiFontHeading); font-weight: 500; }
      }
      .welcomeDescription, .welcomeHint { margin: 0; color: var(--uiTextBody); font-size: var(--uiFontControl); line-height: 1.7; }
      .welcomeHint { color: var(--uiTextMuted); }
      .welcomeSuggestions { display: grid; gap: 8px;
        .welcomeSuggestion { :deep(.buttonLabel) { display: flex; align-items: center; gap: 12px; width: 100%; } justify-content: flex-start; gap: 12px; width: 100%; padding: 12px; text-align: left; white-space: normal;
          svg { flex-shrink: 0; }
          .suggestionContent { display: flex; flex: 1; flex-direction: column; gap: 4px; min-width: 0; strong { font-weight: 500; } span { color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
        }
      }
    }
    .messageSpace { position: relative; width: 100%; }
    .messageRow { position: absolute; top: 0; left: 0; width: 100%; padding-bottom: 20px;
      .messageBubble { padding: 12px 0; min-width: 0; }
      &.userMessage .messageBubble { width: fit-content; max-width: 90%; margin-left: auto; padding: 12px 16px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundSubtle); }
      &.editingMessage .messageBubble { border-color: var(--uiBorderFocus); }
      .messageContent { display: flex; flex-direction: column; gap: 12px; min-width: 0; color: var(--uiTextPrimary); font-size: var(--uiFontBody); line-height: 1.7; overflow-wrap: anywhere;
        .messageText { white-space: pre-wrap; }
        .messageError { color: var(--uiStatusError); }
        .reportHeader { display: flex; align-items: center; gap: 6px; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
        .messageReasoning { padding: 8px 12px; border-left: 2px solid var(--uiBorderDefault); color: var(--uiTextBody);
          summary { cursor: pointer; .reasoningHeader { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 8px; color: var(--uiTextMuted); font-size: var(--uiFontControl); .thinkingDuration { margin-left: auto; } } }
        }
      }
      .messageActions { display: flex; justify-content: flex-end; align-items: center; gap: 4px; .messageAction { width: 28px; height: 28px; padding: 0; } .editingHint { color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
    }
    .scrollBottom { position: absolute; right: 24px; bottom: 16px; padding: 8px; border-radius: 50%; box-shadow: var(--uiShadowPopover); }
  }
  .compactionStatus, .replyingIndicator { display: flex; align-items: center; gap: 8px; padding: 8px 18px; color: var(--uiTextMuted); font-size: var(--uiFontControl); }
  .messageInput { position: relative; flex-shrink: 0; min-width: 0; margin: 8px 12px 4px; border: 1px solid var(--uiBorderControl); border-radius: var(--uiRadiusControl); background: var(--uiBackgroundBase);
    &:focus-within { border-color: var(--uiBorderFocus); }
    .editingBanner { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--uiBorderDefault); font-size: var(--uiFontControl); }
    .senderResizeHandle { height: 7px; cursor: ns-resize; touch-action: none; &:hover { background: var(--uiSurfaceHover); } &:focus-visible { outline-offset: -2px; } }
    .draftAttachments { padding: 8px 12px; }
    .senderEditor { min-width: 0;
      :deep(.promptInput) { border: 0; background: transparent; &:focus-within { outline: none; } .richEditor { min-height: 44px; height: var(--senderHeight, auto); max-height: 50vh; padding: 4px 12px 8px; font-size: var(--uiFontBody); } .promptToken { max-width: 100%; } .promptMention span { overflow: hidden; text-overflow: ellipsis; } }
      .draftMentionThumbnail { width: 24px; height: 24px; border-radius: 3px; }
    }
    .senderActions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; min-width: 0; padding: 8px;
      :deep(.modelPopover) { flex: 1; min-width: 120px; }
      .contextButton { width: 30px; padding: 0; }
      .sendButton { width: 36px; height: 36px; padding: 0; border-radius: 50%; }
    }
  }
  .isLoading { animation: agentSpin 1s linear infinite; }
}
.contextUsage { display: flex; flex-direction: column; gap: 12px; font-size: var(--uiFontControl); .contextHeader, .contextTokens { display: flex; justify-content: space-between; gap: 12px; } .contextHint { color: var(--uiTextMuted); } .contextStats { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid var(--uiBorderDefault); } }
@keyframes agentSpin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .agentConversation .isLoading { animation: none; } }
</style>

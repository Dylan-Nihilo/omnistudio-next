<template>
  <uiDialog v-model="visible" title="Agent 系统提示词" :width="960" :closeOnClickModal="false" :closeOnPressEscape="!saving" :showClose="!saving">
    <div v-if="loading" class="loadState" role="status">正在读取系统提示词…</div>
    <div v-else-if="loadError" class="loadState"><uiAlert :title="loadError" tone="error" /><uiButton variant="secondary" @click="loadPrompt">重试</uiButton></div>
    <div v-else class="promptEditor"><div class="promptDescription"><p>保存后下一条消息生效，留空使用默认提示词。</p><p v-pre>保留 {{tools}}、{{guidelines}}、{{environment}} 及相关条件块，以自动填入工具规则和运行环境。</p></div><uiTextarea v-model="draft" class="promptInput" :maxlength="maxLength" resize="none" :disabled="saving" aria-label="Agent 系统提示词" /><div class="characterCount">{{ draft.length }} / {{ maxLength }}</div><uiAlert v-if="saveError" :title="saveError" tone="error" /></div>
    <template #footer><div class="dialogFooter"><uiButton variant="ghost" :disabled="loading || !!loadError || saving" @click="draft = defaultSystemPrompt">恢复默认</uiButton><div class="footerActions"><uiButton variant="secondary" :disabled="saving" @click="visible = false">取消</uiButton><uiButton :loading="saving" :disabled="loading || !!loadError || !maxLength || draft.length > maxLength" @click="save">保存</uiButton></div></div></template>
  </uiDialog>
</template>

<script setup lang="ts">
import axios from "axios";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { uiDialog, uiAlert, uiButton, uiTextarea, useUiFeedback } from "@omnistudio-next/ui";
import { saveSettings, settings } from "@/stores/settings";

const feedback = useUiFeedback();
const visible = defineModel<boolean>({ default: false });
const draft = ref("");
const defaultSystemPrompt = ref("");
const maxLength = ref(0);
const loading = ref(false);
const saving = ref(false);
const loadError = ref("");
const saveError = ref("");
const controller = new AbortController();
onBeforeUnmount(() => controller.abort());
onMounted(loadPrompt);

async function loadPrompt() {
  if (loading.value) return;
  loading.value = true;
  loadError.value = "";
  try {
    const { data } = await axios.get<{ code: number; data: { defaultSystemPrompt: string; maxLength: number }; message?: string }>("/api/settings/systemPrompt", {
      headers: { "x-omnistudio-next-workspace": "1", "Cache-Control": "no-cache" }, signal: controller.signal,
    });
    if (data.code !== 200) throw new Error(data.message || "读取系统提示词失败");
    if (typeof data.data?.defaultSystemPrompt !== "string" || !Number.isSafeInteger(data.data.maxLength) || data.data.maxLength <= 0) {
      throw new Error("系统提示词格式错误");
    }
    defaultSystemPrompt.value = data.data.defaultSystemPrompt;
    maxLength.value = data.data.maxLength;
    const saved = settings.value.agentSystemPrompt;
    draft.value = typeof saved === "string" && saved.trim() ? saved : defaultSystemPrompt.value;
  } catch (error) {
    loadError.value = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "读取系统提示词失败，请重试" : error instanceof Error ? error.message : "读取系统提示词失败，请重试";
  } finally { loading.value = false; }
}

async function save() {
  if (saving.value || loading.value || loadError.value || !maxLength.value || draft.value.length > maxLength.value) return;
  const agentSystemPrompt = !draft.value.trim() || draft.value === defaultSystemPrompt.value ? "" : draft.value;
  saving.value = true;
  saveError.value = "";
  try {
    await saveSettings(() => ({ agentSystemPrompt }));
    feedback.message({ tone: "success", message: "系统提示词已保存" });
    visible.value = false;
  } catch (error) {
    saveError.value = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "保存失败，请重试；当前内容已保留" : error instanceof Error ? error.message : "保存失败，请重试；当前内容已保留";
  } finally { saving.value = false; }
}
</script>

<style lang="scss" scoped>
.loadState { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px; min-height: 140px; }
.promptEditor { display: flex; flex-direction: column; gap: 16px; height: min(600px, 62dvh); min-height: 0; .promptDescription { color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; p { margin: 0; overflow-wrap: anywhere; } } .promptInput { flex: 1; min-height: 140px; font-family: ui-monospace, Consolas, monospace; } .characterCount { color: var(--uiTextMuted); font-size: var(--uiFontControl); font-variant-numeric: tabular-nums; text-align: right; } }
.dialogFooter { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; width: 100%; .footerActions { display: flex; gap: 8px; margin-left: auto; } }
</style>

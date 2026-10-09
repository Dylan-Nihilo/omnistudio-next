<template>
  <section class="questionCard" aria-label="确认问题" @keydown.stop @keyup.stop>
    <div class="questionHeader">
      <icon-message-question :size="18" />
      <span class="questionTitle">{{ title }}</span>
      <uiTag class="questionStatus" :tone="answer && !skipped ? 'success' : 'neutral'">{{ statusText }}</uiTag>
    </div>
    <template v-if="tool.status === 'error'">
      <p class="questionText">表单暂时未生成，请 AI 重新整理。</p>
      <details v-if="tool.result" class="errorDetails">
        <summary>查看错误详情</summary>
        <pre class="errorText">{{ tool.result }}</pre>
      </details>
    </template>
    <p v-else-if="question" class="questionText">{{ question }}</p>
    <template v-if="waiting">
      <uiRuleForm v-if="formRules.length" v-model="formValues" v-model:api="formApi" :rule="formRules" :disabled="submitting" />
      <template v-else>
        <uiRadioGroup v-if="options.length" :modelValue="selected" :options="answerOptions" class="questionOptions" variant="bordered" :disabled="submitting" :aria-label="question" @update:modelValue="value => { if (typeof value === 'string') selected = value; }" />
        <uiTextarea
          v-model="text"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :disabled="submitting"
          :maxlength="8000"
          :placeholder="options.length ? '也可以直接回答或补充说明' : '输入你的回答'"
          aria-label="回答问题" />
        <p v-if="draftAnswer.length > 8000" class="answerError" role="alert">回答（含选项）不能超过 8000 字</p>
      </template>
      <div class="questionActions">
        <uiButton :loading="submitting" :disabled="!directory || (formRules.length ? !formApi : !draftAnswer || draftAnswer.length > 8000)" @click="submitAnswer(false)">
          提交回答
        </uiButton>
        <uiButton variant="secondary" :disabled="!directory || submitting" @click="submitAnswer(true)">跳过</uiButton>
      </div>
    </template>
    <p v-else-if="answer" class="answerText">{{ answer }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import axios from "axios";
import { uiButton, uiRadioGroup, uiRuleForm, uiTag, uiTextarea, useUiFeedback, type UiFieldRule, type UiRuleFormApi } from "@omnistudio-next/ui";
import { IconMessageQuestion } from "@tabler/icons-vue";
import type { ToolCall } from "@omnistudio-next/tools-scaffold/runtime";

const feedback = useUiFeedback();
const props = defineProps<{ tool: ToolCall; directory?: string }>();
const title = computed(() => props.tool.question?.title || (typeof props.tool.args?.title === "string" ? props.tool.args.title.trim() : "") || "请确认");
const selected = ref("");
const text = ref("");
const submitting = ref(false);
const submittedAnswer = ref("");
const submittedSkipped = ref(false);
const formApi = shallowRef<UiRuleFormApi>();
const formValues = ref<Record<string, unknown>>({});
const formRules = computed<UiFieldRule[]>(() => (props.tool.question?.fields ?? []).map(field => ({
  type: field.type === "textarea" ? "input" : field.type,
  field: field.field,
  title: field.title,
  required: field.required,
  value: field.type === "checkbox" ? [] : field.type === "switch" ? false : field.type === "inputNumber" ? undefined : "",
  props: {
    placeholder: field.placeholder,
    ...(field.type === "textarea" ? { type: "textarea", autosize: { minRows: 2, maxRows: 6 } } : {}),
    ...(["input", "textarea"].includes(field.type) ? { maxlength: 8000 } : {}),
    ...(field.type === "select" ? { clearable: true } : {}),
  },
  options: field.options?.map(value => ({ label: value, value })),
  validate: field.required ? [{
    required: true,
    type: field.type === "checkbox" ? "array" : field.type === "inputNumber" ? "number" : field.type === "switch" ? "boolean" : "string",
    message: `请填写${field.title}`,
    ...(field.type === "checkbox" ? { min: 1 } : {}),
    ...(["input", "textarea"].includes(field.type) ? { whitespace: true } : {}),
  }] : [],
})));
const question = computed(() => props.tool.question?.question ?? (typeof props.tool.args?.question === "string" ? props.tool.args.question : ""));
const options = computed(() => {
  const values = props.tool.question?.options ?? props.tool.args?.options;
  return Array.isArray(values) ? [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))] : [];
});
const answerOptions = computed(() => [...options.value.map(value => ({ value, label: value })), { value: "", label: "自行填写" }]);
const toolResult = computed(() => {
  if (props.tool.status !== "success" || !props.tool.result) return;
  try {
    return JSON.parse(props.tool.result) as { answer?: unknown; skipped?: boolean };
  } catch { return; }
});
const skipped = computed(() => submittedSkipped.value || toolResult.value?.skipped === true);
const answer = computed(() => {
  if (submittedAnswer.value) return submittedAnswer.value;
  if (props.tool.status !== "success") return "";
  return typeof toolResult.value?.answer === "string" ? toolResult.value.answer : props.tool.result ?? "";
});
const waiting = computed(() => props.tool.status === "running" && !!props.tool.question?.callId && !answer.value);
const draftAnswer = computed(() => [selected.value, text.value.trim()].filter(Boolean).join("\n"));
const statusText = computed(() => {
  if (props.tool.status === "error") return "待重新生成";
  if (skipped.value) return "已跳过";
  if (answer.value) return "已回答";
  if (props.tool.status === "interrupted") return "已停止";
  return waiting.value ? "等待回答" : "提问记录";
});

async function submitAnswer(skip: boolean) {
  const callId = props.tool.question?.callId;
  const value = draftAnswer.value;
  if (!waiting.value || submitting.value || !props.directory || !callId) return;
  if (!skip && !formRules.value.length && (!value || value.length > 8000)) return;
  submitting.value = true;
  try {
    if (!skip && formRules.value.length && !(await formApi.value?.validate().catch(() => false))) return;
    const response = await axios.post("/api/agent/answer", {
      directory: props.directory,
      callId,
      ...(skip ? { skipped: true } : formRules.value.length ? { values: formApi.value!.formData() } : { answer: value }),
    }, { headers: { "x-omnistudio-next-workspace": "1" } });
    if (response.data.code !== 200) throw new Error(response.data.message || "提交回答失败");
    submittedAnswer.value = response.data.data.answer;
    submittedSkipped.value = response.data.data.skipped === true;
  } catch (error) {
    const message = axios.isAxiosError(error) ? error.response?.data?.message : undefined;
    feedback.message({ tone: "error", message: message || (error instanceof Error ? error.message : "提交回答失败") });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
.questionCard {
  padding: 16px;
  border: 1px solid var(--uiBorderDefault);
  border-radius: var(--uiRadiusControl);
  background: var(--uiBackgroundSubtle);
  .answerError { color: var(--uiStatusError); }
  .questionHeader {
    display: flex;
    align-items: center;
    gap: 8px;

    .questionTitle {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .questionStatus {
      margin-left: auto;
      flex-shrink: 0;
    }
  }

  .questionText,
  .answerText,
  .errorText {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .errorDetails {
    color: var(--uiTextMuted);
    font-size: 12px;

    summary {
      cursor: pointer;
    }

    .errorText {
      max-height: 240px;
      margin-bottom: 0;
      overflow: auto;
      font-family: inherit;
    }
  }

  .questionOptions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin-bottom: 12px;

    :deep(.uiRadio) { width: 100%; margin: 0; padding: 8px 12px; .radioLabel { white-space: normal; overflow-wrap: anywhere; } }
  }

  .questionActions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 12px;

    .uiButton {
      margin: 0;
    }
  }
}
</style>

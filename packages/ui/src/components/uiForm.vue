<template>
  <form ref="form" class="uiForm" novalidate :aria-busy="validating || undefined" @submit.prevent="submit">
    <fieldset :disabled="disabled"><slot :validating="validating" /></fieldset>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, toRaw } from "vue";
import Schema from "async-validator";
import type { ValidateError } from "async-validator";
import { uiFormKey, type UiFormRule, type UiFormRules } from "../form";
import { readPath } from "../values";
const props = withDefaults(defineProps<{ model: Record<string, unknown>; rules?: UiFormRules; disabled?: boolean }>(), { rules: () => ({}), disabled: false });
const emit = defineEmits<{ submit: [model: Record<string, unknown>]; invalid: [errors: Record<string, string>] }>();
const form = ref<HTMLFormElement>();
const errors = ref<Record<string, string>>({});
const activeValidations = ref(0);
const validating = computed(() => activeValidations.value > 0);
const registered = new Map<string, { label?: string; required?: boolean }>();
const versions = new Map<string, number>();
const initialModel = structuredClone(toRaw(props.model));
let disposed = false;
function rulesFor(field: string) {
  const configured = props.rules[field];
  const rules: UiFormRule[] = configured ? Array.isArray(configured) ? [...configured] : [configured] : [];
  if (registered.get(field)?.required && !rules.some(rule => rule.required)) {
    const value = readPath(props.model, field);
    rules.push({ required: true, type: Array.isArray(value) ? "array" : typeof value === "number" ? "number" : typeof value === "boolean" ? "boolean" : "string", message: "请填写" + (registered.get(field)?.label ?? field) });
  }
  return rules;
}
async function validateOne(field: string, trigger?: string) {
  const version = (versions.get(field) ?? 0) + 1;
  versions.set(field, version);
  const value = readPath(props.model, field);
  const rules = rulesFor(field).filter(rule => !trigger || !rule.trigger || (Array.isArray(rule.trigger) ? rule.trigger.includes(trigger) : rule.trigger === trigger));
  if (!rules.length) return;
  try {
    await new Schema({ [field]: rules }).validate({ ...props.model, [field]: value }, { suppressWarning: true });
    if (disposed || !Object.is(value, readPath(props.model, field))) throw new Error("字段已变化，请重新校验");
    if (versions.get(field) === version) { const next = { ...errors.value }; delete next[field]; errors.value = next; }
  } catch (failure) {
    const items = (failure as { errors?: ValidateError[] }).errors;
    const message = items?.[0]?.message ?? (failure instanceof Error ? failure.message : "校验失败");
    if (!disposed && versions.get(field) === version && Object.is(value, readPath(props.model, field))) errors.value = { ...errors.value, [field]: String(message) };
    throw failure;
  }
}
async function validateField(fields: string | string[], trigger?: string) {
  const names = Array.isArray(fields) ? fields : [fields];
  const result = await Promise.allSettled(names.map(field => validateOne(field, trigger)));
  const failed = result.find(item => item.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return true;
}
async function validate() {
  activeValidations.value++;
  try {
    const snapshot = JSON.stringify(props.model), rules = props.rules, fields = [...registered.keys()];
    await validateField(fields);
    if (snapshot !== JSON.stringify(props.model) || rules !== props.rules || fields.join("\\0") !== [...registered.keys()].join("\\0")) throw new Error("表单已变化，请重新校验");
    return true;
  }
  finally { activeValidations.value--; }
}
function clearValidate(fields?: string | string[]) {
  for (const field of fields == null ? new Set([...registered.keys(), ...Object.keys(errors.value)]) : typeof fields === "string" ? [fields] : fields) {
    versions.set(field, (versions.get(field) ?? 0) + 1);
    const next = { ...errors.value }; delete next[field]; errors.value = next;
  }
}
function resetFields() {
  for (const key of Object.keys(props.model)) delete props.model[key];
  Object.assign(props.model, structuredClone(initialModel));
  clearValidate();
}
async function submit() {
  if (props.disabled || validating.value) return;
  try { await validate(); emit("submit", props.model); }
  catch { emit("invalid", errors.value); await nextTick(); form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }
}
const context = {
  validate, validateField, clearValidate, resetFields,
  errors: computed(() => errors.value), disabled: computed(() => props.disabled),
  required: (field: string) => rulesFor(field).some(rule => rule.required),
  register(field: string, label?: string, required?: boolean) {
    registered.set(field, { label, required });
    return () => { registered.delete(field); clearValidate(field); };
  },
};
provide(uiFormKey, context);
onBeforeUnmount(() => { disposed = true; clearValidate(); });
defineExpose({ validate, validateField, clearValidate, resetFields, form });
</script>

<style scoped lang="scss">
.uiForm { min-width: 0; fieldset { min-width: 0; margin: 0; padding: 0; border: 0; display: flex; flex-direction: column; gap: 20px; } }
</style>

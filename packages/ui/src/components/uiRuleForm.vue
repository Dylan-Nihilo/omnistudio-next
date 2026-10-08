<template>
  <uiAlert v-if="unsupported.length" tone="error" :title="'不支持的表单字段：' + unsupported.join('、')" />
  <uiForm ref="form" :model="values" :rules="validationRules" :disabled="disabled">
    <uiFormField v-for="rule in visibleRules" :key="rule.field" :prop="rule.field" :label="rule.title" :help="rule.info" :required="requiredFields.has(rule.field)">
      <template #default="{ id, describedBy, invalid, required }">
        <component :is="components[rule.type === 'input' && rule.props?.type === 'textarea' ? 'textarea' : rule.type]" v-if="Object.hasOwn(components, rule.type)" v-bind="rule.props" :id="id" :modelValue="values[rule.field]" :options="rule.options ?? []" :aria-describedby="describedBy" :aria-label="rule.title" :required="required && ['input', 'textarea', 'inputNumber', 'select'].includes(rule.type)" :error="invalid" :disabled="disabled || rule.props?.disabled === true" @update:modelValue="(value: unknown) => update(rule.field, value)" />
      </template>
    </uiFormField>
  </uiForm>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from "vue";
import uiAlert from "./uiAlert.vue";
import uiForm from "./uiForm.vue";
import uiFormField from "./uiFormField.vue";
import uiInput from "./uiInput.vue";
import uiTextarea from "./uiTextarea.vue";
import uiNumberInput from "./uiNumberInput.vue";
import uiSelect from "./uiSelect.vue";
import uiSwitch from "./uiSwitch.vue";
import uiCheckboxGroup from "./uiCheckboxGroup.vue";
import uiRadioGroup from "./uiRadioGroup.vue";
import uiSlider from "./uiSlider.vue";
import uiColorPicker from "./uiColorPicker.vue";
import uiTagInput from "./uiTagInput.vue";
import type { UiFieldRule, UiFormRules, UiRuleFormApi } from "../form";
const props = withDefaults(defineProps<{ rule: UiFieldRule[]; disabled?: boolean }>(), { disabled: false });
const values = defineModel<Record<string, unknown>>({ default: () => ({}) });
const api = defineModel<UiRuleFormApi | undefined>("api");
const form = ref<InstanceType<typeof uiForm>>();
const components: Record<string, object> = { input: uiInput, textarea: uiTextarea, inputNumber: uiNumberInput, select: uiSelect, switch: uiSwitch, checkbox: uiCheckboxGroup, radio: uiRadioGroup, slider: uiSlider, colorPicker: uiColorPicker, inputTag: uiTagInput };
const fieldCounts = computed(() => { const counts = new Map<string, number>(); for (const rule of props.rule) counts.set(rule.field, (counts.get(rule.field) ?? 0) + 1); return counts; });
const unsupported = computed(() => props.rule.filter(rule => !Object.hasOwn(components, rule.type) || !safeField(rule.field) || (fieldCounts.value.get(rule.field) ?? 0) > 1 || rule.control?.some(control => ![undefined, "required", "display"].includes(control.method) || !Array.isArray(control.rule) || control.rule.some(field => !safeField(field) || !fieldCounts.value.has(field)))).map(rule => rule.title || rule.field || rule.type));
const controls = computed(() => props.rule.flatMap(rule => (rule.control ?? []).map(control => ({ ...control, matched: values.value[rule.field] === control.value }))));
const displayTargets = computed(() => new Set(controls.value.filter(control => control.method !== "required").flatMap(control => control.rule)));
const visibleRules = computed(() => props.rule.filter(rule => !displayTargets.value.has(rule.field) || controls.value.some(control => control.method !== "required" && control.matched && control.rule.includes(rule.field))));
const requiredFields = computed(() => new Set([...props.rule.filter(rule => rule.required).map(rule => rule.field), ...controls.value.filter(control => control.method === "required" && control.matched).flatMap(control => control.rule)]));
const validationRules = computed<UiFormRules>(() => Object.fromEntries(visibleRules.value.map(rule => [rule.field, rule.validate ?? []])));
watch(() => props.rule, () => {
  const next = { ...toRaw(values.value) };
  for (const rule of props.rule) if (safeField(rule.field) && !Object.hasOwn(next, rule.field)) next[rule.field] = rule.value === undefined ? undefined : structuredClone(toRaw(rule.value));
  values.value = next;
}, { immediate: true });
function safeField(field: string) { return typeof field === "string" && !!field && !field.includes(".") && !["__proto__", "constructor", "prototype"].includes(field); }
function update(field: string, value: unknown) { values.value = { ...toRaw(values.value), [field]: value }; }
function formData() { return structuredClone(toRaw(values.value)); }
async function validate() { if (unsupported.value.length) throw new Error("表单包含不支持的字段"); await nextTick(); return await form.value?.validate() ?? false; }
const exposed: UiRuleFormApi = {
  validate, formData,
  validateField: async (fields, trigger) => { if (unsupported.value.length) throw new Error("表单包含不支持的字段"); await nextTick(); return await form.value?.validateField(fields, trigger) ?? false; },
  clearValidate: fields => form.value?.clearValidate(fields),
  resetFields: () => form.value?.resetFields(),
};
watch(form, value => { api.value = value ? exposed : undefined; }, { flush: "post" });
defineExpose(exposed);
</script>

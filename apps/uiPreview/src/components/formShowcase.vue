<template>
  <div class="uiStack">
    <section><h2>选择</h2><div class="uiGrid"><uiField label="媒体类型"><template #default="{ id }"><uiSelect :id="id" v-model="kind" :options="kinds" clearable filterable aria-label="媒体类型" /></template></uiField><uiField label="素材标签"><template #default="{ id }"><uiTagInput :id="id" v-model="tags" placeholder="输入标签后按 Enter" aria-label="素材标签" /></template></uiField><uiField label="镜头数量"><template #default="{ id }"><uiNumberInput :id="id" v-model="count" :min="0" :max="100" :precision="0" aria-label="镜头数量" /></template></uiField><uiField label="画面比例"><template #default="{ id }"><uiSelect :id="id" v-model="ratio" :options="ratios" filterable allowCreate clearable aria-label="画面比例" /></template></uiField></div></section>
    <section><h2>选项</h2><div class="uiStack"><uiRadioGroup v-model="radio" :options="kinds" aria-label="输出类型" /><uiRadioGroup v-model="radio" :options="kinds" variant="segmented" aria-label="输出类型切换" /><uiCheckboxGroup v-model="selected" :options="kinds" aria-label="引用类型" /><div class="uiRow"><uiCheckbox v-model="remember">记住当前选择</uiCheckbox><uiCheckbox :modelValue="true" indeterminate>部分选中</uiCheckbox><uiSwitch v-model="audio">生成音频</uiSwitch><uiSwitch :modelValue="true" loading>正在处理</uiSwitch><uiColorPicker v-model="color" aria-label="节点颜色" /></div></div></section>
    <section><h2>项目</h2><uiSwitch v-model="locked">暂停编辑</uiSwitch><uiForm ref="form" :model="project" :rules="rules" :disabled="locked" @submit="checked = true">
      <uiFormField prop="name" label="项目名称"><template #default="{ id, invalid, describedBy, required, disabled }"><uiInput :id="id" v-model="project.name" :error="invalid" :aria-describedby="describedBy" :required="required" :disabled="disabled" clearable /></template></uiFormField>
      <uiFormField prop="count" label="镜头数量"><template #default="{ id, invalid, disabled }"><uiNumberInput :id="id" v-model="project.count" :min="1" :max="100" :error="invalid" :disabled="disabled" /></template></uiFormField>
      <div class="uiRow"><uiButton htmlType="submit">校验项目</uiButton><uiButton variant="secondary" @click="form?.resetFields(); checked = false">重置</uiButton></div>
    </uiForm><uiAlert v-if="checked" title="项目名称可以使用。" tone="success" /></section>
    <section><h2>搜索配置</h2><uiRuleForm ref="ruleForm" v-model="config" :rule="searchRules" /><uiButton class="validateButton" @click="validateConfig">校验配置</uiButton></section>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue";
import { uiField, uiSelect, uiTagInput, uiNumberInput, uiRadioGroup, uiCheckboxGroup, uiCheckbox, uiSwitch, uiColorPicker, uiForm, uiFormField, uiInput, uiButton, uiAlert, uiRuleForm, useUiFeedback, type UiOption, type UiValue, type UiFormRules, type UiFieldRule } from "@toonflow/ui";
const feedback = useUiFeedback();
const kinds: UiOption[] = [{ value: "image", label: "图片" }, { value: "video", label: "视频" }, { value: "text", label: "文本" }];
const ratios: UiOption[] = [{ value: "16:9", label: "16:9" }, { value: "9:16", label: "9:16" }, { value: "1:1", label: "1:1" }];
const kind = ref<UiValue | UiValue[] | undefined>("image"), ratio = ref<UiValue | UiValue[] | undefined>("16:9"), radio = ref<UiValue>("image");
const selected = ref<UiValue[]>(["image"]), tags = ref(["分镜"]), count = ref<number | undefined>(8), color = ref("#ff6b35");
const remember = ref(false), audio = ref(true), locked = ref(false), checked = ref(false);
const project = reactive({ name: "雾山来信", count: 8 as number | undefined });
const form = ref<InstanceType<typeof uiForm>>(), ruleForm = ref<InstanceType<typeof uiRuleForm>>();
const rules: UiFormRules = { name: [{ required: true, whitespace: true, message: "请输入项目名称", trigger: "blur" }, { max: 80, message: "项目名称不能超过 80 字" }], count: [{ required: true, type: "number", min: 1, message: "镜头数量至少为 1" }] };
const config = ref<Record<string, unknown>>({});
const searchRules: UiFieldRule[] = [
  { type: "select", field: "provider", title: "搜索服务", value: "duckduckgo", options: [{ value: "duckduckgo", label: "DuckDuckGo（免 Key）" }, { value: "deepseek", label: "DeepSeek" }, { value: "tavily", label: "Tavily" }], control: [{ value: "deepseek", rule: ["apiKey"] }, { value: "deepseek", method: "required", rule: ["apiKey"] }, { value: "tavily", rule: ["tavilyApiKey"] }, { value: "tavily", method: "required", rule: ["tavilyApiKey"] }] },
  { type: "input", field: "apiKey", title: "DeepSeek API Key", value: "", props: { type: "password", showPassword: true } },
  { type: "input", field: "tavilyApiKey", title: "Tavily API Key", value: "", props: { type: "password", showPassword: true } },
  { type: "inputNumber", field: "maxResults", title: "最多返回结果", value: 8, props: { min: 1, max: 20, stepStrictly: true } },
];
async function validateConfig() { try { await ruleForm.value?.validate(); feedback.message({ message: "配置校验通过", tone: "success" }); } catch { /* Field messages retain the user's input. */ } }
</script>

<style scoped lang="scss">
.validateButton { margin-top: 20px; }
</style>

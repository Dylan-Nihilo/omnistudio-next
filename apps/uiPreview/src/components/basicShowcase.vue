<template>
  <div class="uiStack">
    <section><h2>操作</h2><div class="uiRow"><uiButton :icon="IconPlus" @click="dialogVisible = true">添加项目</uiButton><uiButton variant="secondary">保存</uiButton><uiButton variant="ghost">取消</uiButton><uiButton variant="danger">移除</uiButton><uiButton disabled>不可用</uiButton><uiButton loading>正在保存</uiButton><uiIconButton :icon="IconPlus" label="添加素材" /></div></section>
    <section><h2>尺寸</h2><div class="uiRow"><uiButton size="small">紧凑</uiButton><uiButton>默认</uiButton><uiButton size="large">主要操作</uiButton></div></section>
    <section><h2>输入</h2><div class="uiGrid">
      <uiField label="项目名称" required help="名称可以稍后修改。"><template #default="{ id, describedBy, required }"><uiInput :id="id" v-model="name" :required="required" :aria-describedby="describedBy" clearable /></template></uiField>
      <uiField label="API Key"><template #default="{ id }"><uiInput :id="id" v-model="key" type="password" showPassword autocomplete="off" /></template></uiField>
      <uiField label="工作目录"><template #default="{ id }"><uiInput :id="id" modelValue="~/Projects/雾山来信" readonly /></template></uiField>
      <uiField label="项目名称" error="项目名称不能为空。"><template #default="{ id, invalid, describedBy }"><uiInput :id="id" modelValue="" :error="invalid" :aria-describedby="describedBy" /></template></uiField>
      <uiField label="暂不可编辑"><template #default="{ id }"><uiInput :id="id" modelValue="雾山来信" disabled /></template></uiField>
    </div></section>
    <uiField label="创作描述"><template #default="{ id }"><uiTextarea :id="id" v-model="description" :autosize="{ minRows: 2, maxRows: 6 }" placeholder="写下故事、角色或镜头的想法…" /></template></uiField>
    <section><h2>状态</h2><div class="uiRow"><uiTag>文本</uiTag><uiTag tone="success">就绪</uiTag><uiTag tone="warning">待处理</uiTag><uiTag tone="error">未完成</uiTag><uiBadge :value="3" label="3 个条目"><uiButton variant="secondary">素材</uiButton></uiBadge></div></section>
    <section><h2>反馈</h2><div class="uiStack"><uiAlert title="名称可以稍后修改。" /><uiAlert title="项目名称不能为空。" tone="error" /><uiProgress :percentage="progress" aria-label="任务进度" /><uiSlider v-model="progress" aria-label="进度" /><div class="uiRow"><uiProgress :percentage="progress" type="circle" aria-label="任务进度" /><uiProgress indeterminate type="circle" aria-label="正在处理" /></div><uiSkeleton :rows="3" /></div></section>
    <uiCard title="雾山来信"><uiTag>项目</uiTag></uiCard>
    <uiEmpty title="当前目录为空"><uiButton variant="secondary" @click="dialogVisible = true">添加项目</uiButton></uiEmpty>
    <uiDialog v-model="dialogVisible" title="添加项目" destroyOnClose><template #footer><uiButton variant="secondary" @click="dialogVisible = false">关闭</uiButton></template></uiDialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconPlus } from "@tabler/icons-vue";
import { uiButton, uiIconButton, uiInput, uiTextarea, uiField, uiTag, uiBadge, uiAlert, uiProgress, uiSlider, uiSkeleton, uiCard, uiEmpty, uiDialog } from "@omnistudio-next/ui";
const name = ref("雾山来信"), key = ref(""), description = ref("");
const dialogVisible = ref(false), progress = ref(42);
</script>

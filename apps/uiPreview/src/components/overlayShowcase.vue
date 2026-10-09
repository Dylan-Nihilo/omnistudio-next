<template>
  <div class="uiStack">
    <section><h2>菜单与浮层</h2><div class="uiRow">
      <uiTooltip content="添加素材"><uiButton variant="secondary">素材</uiButton></uiTooltip>
      <uiPopover title="素材" :width="300"><template #reference><uiButton variant="secondary">查看素材</uiButton></template><uiTag>图片</uiTag></uiPopover>
      <uiDropdown :items="menu" @command="value => chosen = String(value)"><template #reference="props"><uiButton variant="secondary" v-bind="props.triggerAttrs">更多操作</uiButton></template></uiDropdown>
      <uiPopconfirm title="从当前列表移除选中项？" danger confirmButtonText="移除" @confirm="chosen = ''"><template #reference><uiButton variant="danger">移除选中项</uiButton></template></uiPopconfirm>
      <uiTag v-if="chosen">{{ chosen }}</uiTag>
    </div></section>
    <section><h2>消息与通知</h2><div class="uiRow"><uiButton variant="secondary" @click="feedback.message('请选择要使用的模型')">提示</uiButton><uiButton variant="secondary" @click="feedback.notify({ title: '项目名称', message: name, duration: 0 })">通知</uiButton><uiButton variant="secondary" @click="rename">修改名称</uiButton><uiButton variant="danger" @click="confirmRemove">确认移除</uiButton></div><p class="uiTextMuted">{{ name }}</p></section>
    <section><h2>弹窗</h2><uiButton @click="dialogVisible = true">项目设置</uiButton></section>
    <uiDialog ref="dialog" v-model="dialogVisible" title="项目设置" :beforeClose="beforeClose" :showClose="!locked" :closeOnPressEscape="!locked" :closeOnClickModal="!locked">
      <div class="uiStack"><uiField label="名称"><template #default="{ id }"><uiInput :id="id" v-model="draft" /></template></uiField><uiSwitch v-model="locked">禁止关闭</uiSwitch><uiButton variant="secondary" @click="innerVisible = true">选择工作目录</uiButton></div>
      <uiDialog v-model="innerVisible" title="选择工作目录"><template #footer><uiButton variant="secondary" @click="innerVisible = false">关闭</uiButton></template></uiDialog>
      <template #footer><uiButton variant="secondary" :disabled="locked" @click="dialog?.close()">关闭</uiButton></template>
    </uiDialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { uiButton, uiTooltip, uiPopover, uiDropdown, uiPopconfirm, uiTag, uiDialog, uiField, uiInput, uiSwitch, useUiFeedback, isUiCancelledError, type UiMenuItem } from "@omnistudio-next/ui";
const feedback = useUiFeedback();
const menu: UiMenuItem[] = [{ value: "详情", label: "查看详情" }, { value: "新建", label: "新建", children: [{ value: "文本", label: "文本" }, { value: "图片", label: "图片" }] }, { value: "重命名", label: "重命名" }, { value: "移除", label: "移除", divided: true }, { value: "处理中", label: "正在处理", disabled: true }];
const chosen = ref(""), name = ref("雾山来信"), draft = ref("雾山来信");
const dialogVisible = ref(false), innerVisible = ref(false), locked = ref(false);
const dialog = ref<InstanceType<typeof uiDialog>>();
async function rename() { try { const result = await feedback.prompt("请输入项目名称", "修改名称", { inputValue: name.value, inputValidator: value => !!value.trim() || "项目名称不能为空。" }); name.value = result.value; } catch (error) { if (!isUiCancelledError(error)) throw error; } }
async function confirmRemove() { try { await feedback.confirm("将清空当前名称。工作区文件不会被删除。", "移除名称", { danger: true, confirmButtonText: "移除" }); name.value = ""; } catch (error) { if (!isUiCancelledError(error)) throw error; } }
async function beforeClose(done: () => void) { if (locked.value) return; if (draft.value !== name.value) { try { await feedback.confirm("名称尚未应用，确定放弃修改并关闭吗？", "未应用的修改", { confirmButtonText: "放弃修改" }); } catch (error) { if (isUiCancelledError(error)) return; throw error; } } done(); }
</script>

<template>
  <authShell title="创建平台管理员" eyebrow="首次初始化" description="root 管理员负责平台 API、模型与积分配置。完成初始化后，其他用户即可创建自己的账户。">
    <uiForm class="authForm" :model="form" :rules="rules" :disabled="submitting" @submit="submit">
      <uiFormField prop="displayName" label="管理员名称" required><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model.trim="form.displayName" class="authInput" autocomplete="name" maxlength="120" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" /></template></uiFormField>
      <uiFormField prop="email" label="邮箱" required><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model.trim="form.email" class="authInput" type="email" autocomplete="email" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" /></template></uiFormField>
      <uiFormField prop="password" label="密码" required help="至少 12 位，请妥善保管管理员密码。"><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model="form.password" class="authInput" type="password" maxlength="200" autocomplete="new-password" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" showPassword /></template></uiFormField>
      <uiFormField prop="confirmation" label="再次输入密码" required><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model="form.confirmation" class="authInput" type="password" maxlength="200" autocomplete="new-password" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" showPassword /></template></uiFormField>
      <uiFormField v-if="auth.requiresSetupToken" prop="setupToken" label="管理员初始化凭据" required help="使用部署时生成的管理员初始化凭据。"><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model.trim="form.setupToken" class="authInput" type="password" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" /></template></uiFormField>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <uiButton class="submitButton" htmlType="submit" :loading="submitting" :disabled="submitting">创建 root 管理员</uiButton>
    </uiForm>
    <div class="authLinks"><a href="#/auth/login">已有账户，返回登录</a></div>
  </authShell>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { uiButton, uiForm, uiFormField, uiInput, type UiFormRules } from "@omnistudio-next/ui";
import axios from "axios";
import authShell from "@/components/auth/authShell.vue";
import { useAuthStore } from "@/stores/auth";
const router = useRouter(); const auth = useAuthStore();
const form = reactive({ displayName: "", email: "", password: "", confirmation: "", setupToken: "" });
const rules: UiFormRules = {
  displayName: { required: true, whitespace: true, message: "请输入管理员名称" },
  email: [{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效的邮箱地址" }],
  password: [{ required: true, message: "请输入密码" }, { min: 12, message: "密码至少需要 12 位" }],
  confirmation: { validator: (_rule, value) => value && value === form.password ? true : new Error("两次输入的密码不一致") },
  setupToken: { required: true, whitespace: true, message: "请输入管理员初始化凭据" },
};
const errorMessage = ref(""); const submitting = ref(false);
onMounted(async () => { try { if (await auth.loadSetupStatus()) await router.replace("/auth/login"); } catch { errorMessage.value = "读取初始化状态失败，请重试"; } });
async function submit() {
  if (submitting.value) return;
  submitting.value = true; errorMessage.value = "";
  try { await auth.completeSetup({ displayName: form.displayName, email: form.email, password: form.password, ...(auth.requiresSetupToken ? { setupToken: form.setupToken } : {}) }); await router.replace("/home"); }
  catch (error) { errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "初始化失败，请重试" : error instanceof Error ? error.message : "初始化失败，请重试"; }
  finally { submitting.value = false; }
}
</script>

<template>
  <authShell title="开启你的创作空间" description="创建独立账户，保存自己的项目、资产与积分。协作时，再选择加入团队。">
    <p v-if="invitation" class="invitationNote">你受邀加入「{{ invitation.teamName }}」，请使用 {{ invitation.email }} 注册。</p>
    <uiForm class="authForm" :model="form" :rules="rules" :disabled="submitting" @submit="submit">
      <uiFormField prop="displayName" label="显示名称" required><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model.trim="form.displayName" class="authInput" autocomplete="name" maxlength="120" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" /></template></uiFormField>
      <uiFormField prop="email" label="邮箱" required><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model.trim="form.email" class="authInput" type="email" autocomplete="email" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" :readonly="!!invitation" /></template></uiFormField>
      <uiFormField prop="password" label="密码" required help="至少 12 位，建议使用容易记住的长密码。"><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model="form.password" class="authInput" type="password" maxlength="200" autocomplete="new-password" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" showPassword /></template></uiFormField>
      <uiFormField prop="confirmation" label="再次输入密码" required><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model="form.confirmation" class="authInput" type="password" maxlength="200" autocomplete="new-password" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" showPassword /></template></uiFormField>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <uiButton class="submitButton" htmlType="submit" :loading="submitting" :disabled="submitting || invitationFailed">{{ invitation ? '创建账户并加入团队' : '创建账户' }}</uiButton>
    </uiForm>
    <div class="authLinks"><span>已有账户？</span><a :href="loginHref">登录账户</a></div>
    <div v-if="invitationFailed" class="authLinks"><a href="#/auth/register">创建个人账户，不使用邀请</a></div>
  </authShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { uiButton, uiForm, uiFormField, uiInput, type UiFormRules } from "@omnistudio-next/ui";
import axios from "axios";
import authShell from "@/components/auth/authShell.vue";
import { useAuthStore } from "@/stores/auth";
import { getInvitation } from "@/lib/authApi";
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const form = reactive({ displayName: "", email: "", password: "", confirmation: "" });
const rules: UiFormRules = {
  displayName: { required: true, whitespace: true, message: "请输入显示名称" },
  email: [{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效的邮箱地址" }],
  password: [{ required: true, message: "请输入密码" }, { min: 12, message: "密码至少需要 12 位" }],
  confirmation: { validator: (_rule, value) => value && value === form.password ? true : new Error("两次输入的密码不一致") },
};
const errorMessage = ref(""); const submitting = ref(false); const invitationFailed = ref(false);
const invitation = ref<Awaited<ReturnType<typeof getInvitation>>>();
const token = typeof route.query.invite === "string" ? route.query.invite : "";
const loginHref = computed(() => `#/auth/login${token ? '?invite=' + encodeURIComponent(token) : ''}`);
onMounted(async () => {
  try {
    if (!(await auth.loadSetupStatus())) { await router.replace("/auth/setup"); return; }
    if (token) { invitation.value = await getInvitation(token); form.email = invitation.value.email; }
  } catch (error) { invitationFailed.value = !!token; errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "读取邀请失败" : "读取账户状态失败，请重试"; }
});
async function submit() {
  if (submitting.value || invitationFailed.value) return;
  submitting.value = true; errorMessage.value = "";
  try { await auth.signUp({ email: form.email, displayName: form.displayName, password: form.password, ...(token ? { inviteToken: token } : {}) }); await router.replace(token ? "/teams" : "/home"); }
  catch (error) { errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "注册失败，请重试" : error instanceof Error ? error.message : "注册失败，请重试"; }
  finally { submitting.value = false; }
}
</script>

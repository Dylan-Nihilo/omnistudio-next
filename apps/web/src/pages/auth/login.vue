<template>
  <authShell title="欢迎回来" description="登录你的账户，继续自己的创作。">
    <p v-if="invitation" class="invitationNote">登录后加入团队「{{ invitation.teamName }}」。请使用 {{ invitation.email }}。</p>
    <uiForm class="authForm" :model="form" :rules="rules" :disabled="submitting" @submit="submit">
      <uiFormField prop="email" label="邮箱" required><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model.trim="form.email" class="authInput" type="email" autocomplete="email" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" /></template></uiFormField>
      <uiFormField prop="password" label="密码" required><template #default="{ id, describedBy, invalid, required }"><uiInput :id="id" v-model="form.password" class="authInput" type="password" maxlength="200" autocomplete="current-password" :aria-describedby="describedBy" :error="invalid" :required="required" :disabled="submitting" showPassword /></template></uiFormField>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <uiButton class="submitButton" htmlType="submit" :loading="submitting" :disabled="submitting">{{ invitation ? '登录并加入团队' : '登录账户' }}</uiButton>
    </uiForm>
    <div class="authLinks"><span>还没有账户？</span><a :href="registrationHref">创建账户</a></div>
    <div v-if="canSetup" class="authLinks"><a href="#/auth/setup">初始化平台管理员</a></div>
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
import { acceptInvite } from "@/lib/accountApi";
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const form = reactive({ email: typeof route.query.email === "string" ? route.query.email : "", password: "" });
const rules: UiFormRules = {
  email: [{ required: true, message: "请输入邮箱" }, { type: "email", message: "请输入有效的邮箱地址" }],
  password: { required: true, message: "请输入密码" },
};
const errorMessage = ref("");
const submitting = ref(false);
const canSetup = ref(false);
const invitation = ref<Awaited<ReturnType<typeof getInvitation>>>();
const token = typeof route.query.invite === "string" ? route.query.invite : "";
const registrationHref = computed(() => `#/auth/register${token ? '?invite=' + encodeURIComponent(token) : ''}`);
onMounted(async () => {
  try {
    canSetup.value = !(await auth.loadSetupStatus());
    if (token) { invitation.value = await getInvitation(token); form.email = invitation.value.email; }
  } catch (error) { errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "读取邀请失败" : "读取账户状态失败，请重试"; }
});
async function submit() {
  if (submitting.value) return;
  submitting.value = true; errorMessage.value = "";
  try {
    await auth.signIn({ email: form.email, password: form.password });
    if (token) { await acceptInvite(token); await auth.restoreSession(); await router.replace("/teams"); }
    else {
      const target = typeof route.query.redirect === "string" && route.query.redirect.startsWith("/") && !route.query.redirect.startsWith("//") && !route.query.redirect.startsWith("/auth") ? route.query.redirect : "/home";
      await router.replace(target);
    }
  } catch (error) { errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "登录失败，请重试" : error instanceof Error ? error.message : "登录失败，请重试"; }
  finally { submitting.value = false; }
}
</script>

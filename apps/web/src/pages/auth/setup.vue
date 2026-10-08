<template>
  <authShell title="初始化 OmniStudio" description="创建平台管理员和第一个 Workspace，之后即可开始创作并使用平台统一的模型与积分。">
    <form class="authForm" @submit.prevent="submit">
      <uiField label="管理员名称" required><template #default="{ id, required }"><uiInput class="authInput" :id="id" v-model.trim="displayName" type="text" autocomplete="name" :required="required" /></template></uiField>
      <uiField label="邮箱" required><template #default="{ id, required }"><uiInput class="authInput" :id="id" v-model.trim="email" type="email" autocomplete="email" :required="required" /></template></uiField>
      <uiField label="密码" required><template #default="{ id, required }"><uiInput class="authInput" :id="id" v-model="password" type="password" minlength="12" autocomplete="new-password" :required="required" showPassword /></template></uiField>
      <uiField label="Workspace 名称" required><template #default="{ id, required }"><uiInput class="authInput" :id="id" v-model.trim="workspaceName" type="text" :required="required" /></template></uiField>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <uiButton class="loginButton" htmlType="submit" :loading="submitting" :disabled="submitting">{{ submitting ? "初始化中…" : "完成初始化" }}</uiButton>
    </form>
    <div class="secondaryActions"><a href="#/auth/login">已有账户，返回登录</a></div>
  </authShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import authShell from "@/components/auth/authShell.vue";
import { uiButton, uiField, uiInput } from "@toonflow/ui";

const router = useRouter();
const auth = useAuthStore();
const displayName = ref("");
const email = ref("");
const password = ref("");
const workspaceName = ref("我的工作区");
const errorMessage = ref("");
const submitting = ref(false);
onMounted(async () => { if (await auth.loadSetupStatus()) await router.replace("/auth/login"); });
async function submit() {
  if (submitting.value) return;
  submitting.value = true;
  errorMessage.value = "";
  try { await auth.completeSetup({ displayName: displayName.value, email: email.value, password: password.value, workspaceName: workspaceName.value }); await router.replace("/home"); }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : "初始化失败，请重试"; }
  finally { submitting.value = false; }
}
</script>

<template>
  <authShell title="登录 OmniStudio" description="登录后继续你的漫剧创作，Workspace、项目和平台积分会保持在同一个账户体系中。">
    <form class="authForm" @submit.prevent="submit">
      <uiField label="邮箱" required><template #default="{ id, required }"><uiInput class="authInput" :id="id" v-model.trim="email" type="email" autocomplete="email" :required="required" /></template></uiField>
      <uiField label="密码" required><template #default="{ id, required }"><uiInput class="authInput" :id="id" v-model="password" type="password" autocomplete="current-password" :required="required" showPassword /></template></uiField>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <uiButton class="loginButton" htmlType="submit" :loading="submitting" :disabled="submitting">{{ submitting ? "登录中…" : "登录" }}</uiButton>
    </form>
    <div v-if="canSetup" class="secondaryActions"><a href="#/auth/setup">首次使用，创建管理员</a></div>
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
const email = ref("");
const password = ref("");
const errorMessage = ref("");
const submitting = ref(false);
const canSetup = ref(false);
onMounted(async () => { canSetup.value = !(await auth.loadSetupStatus()); });
async function submit() {
  if (submitting.value) return;
  submitting.value = true;
  errorMessage.value = "";
  try { await auth.signIn({ email: email.value, password: password.value }); await router.replace("/home"); }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : "登录失败，请重试"; }
  finally { submitting.value = false; }
}
</script>

<template>
  <authShell title="登录 OmniStudio" description="登录后继续你的漫剧创作，Workspace、项目和平台积分会保持在同一个账户体系中。">
    <form class="authForm" @submit.prevent="submit">
      <label class="field">邮箱<input v-model.trim="email" class="authInput" type="email" autocomplete="email" required /></label>
      <label class="field">密码<input v-model="password" class="authInput" type="password" autocomplete="current-password" required /></label>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <button class="loginButton" type="submit" :disabled="submitting">{{ submitting ? "登录中…" : "登录" }}</button>
    </form>
    <div v-if="canSetup" class="secondaryActions"><a href="#/auth/setup">首次使用，创建管理员</a></div>
  </authShell>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import authShell from "@/components/auth/authShell.vue";

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

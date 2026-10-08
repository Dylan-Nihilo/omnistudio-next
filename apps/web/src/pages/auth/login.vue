<template>
  <main class="authPage">
    <form class="authPanel" @submit.prevent="submit">
      <img class="authLogo" :src="logoUrl" alt="OmniStudio" />
      <h1>登录 OmniStudio</h1>
      <label>邮箱<input v-model.trim="email" type="email" autocomplete="email" required /></label>
      <label>密码<input v-model="password" type="password" autocomplete="current-password" required /></label>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="submitting">{{ submitting ? "登录中…" : "登录" }}</button>
      <a v-if="canSetup" href="#/auth/setup">首次使用，创建管理员</a>
    </form>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
import { useAuthStore } from "@/stores/auth";

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

<style scoped>
.authPage { min-height: 100dvh; display: grid; place-items: center; background: #090909; color: #f5f5f5; }
.authPanel { width: min(420px, calc(100% - 40px)); display: grid; gap: 16px; padding: 32px; border: 1px solid #333; border-radius: 8px; background: #151515; }
.authLogo { width: 180px; margin: 0 auto 8px; border-radius: 8px; }
.authPanel h1 { margin: 0 0 8px; text-align: center; font-size: 26px; }
.authPanel label { display: grid; gap: 8px; color: #bbb; }
.authPanel input { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #444; border-radius: 4px; background: #0f0f0f; color: #fff; }
.authPanel button { padding: 11px 14px; border: 0; border-radius: 4px; background: #ff6b35; color: #fff; cursor: pointer; }
.authPanel button:disabled { opacity: .6; cursor: wait; }
.authPanel a { color: #ff9a75; text-align: center; }
.errorMessage { margin: 0; color: #ff8c8c; }
</style>

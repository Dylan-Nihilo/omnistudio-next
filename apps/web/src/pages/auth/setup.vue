<template>
  <main class="authPage">
    <form class="authPanel" @submit.prevent="submit">
      <img class="authLogo" :src="logoUrl" alt="OmniStudio" />
      <h1>初始化 OmniStudio</h1>
      <p class="hint">创建平台管理员和第一个 Workspace。</p>
      <label>管理员名称<input v-model.trim="displayName" type="text" autocomplete="name" required /></label>
      <label>邮箱<input v-model.trim="email" type="email" autocomplete="email" required /></label>
      <label>密码<input v-model="password" type="password" minlength="12" autocomplete="new-password" required /></label>
      <label>Workspace 名称<input v-model.trim="workspaceName" type="text" required /></label>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <button type="submit" :disabled="submitting">{{ submitting ? "初始化中…" : "完成初始化" }}</button>
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

<style scoped>
.authPage { min-height: 100dvh; display: grid; place-items: center; background: #090909; color: #f5f5f5; }
.authPanel { width: min(420px, calc(100% - 40px)); display: grid; gap: 16px; padding: 32px; border: 1px solid #333; border-radius: 8px; background: #151515; }
.authLogo { width: 180px; margin: 0 auto 8px; border-radius: 8px; }
.authPanel h1 { margin: 0 0 8px; text-align: center; font-size: 26px; }
.hint { margin: 0; color: #aaa; text-align: center; }
.authPanel label { display: grid; gap: 8px; color: #bbb; }
.authPanel input { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1px solid #444; border-radius: 4px; background: #0f0f0f; color: #fff; }
.authPanel button { padding: 11px 14px; border: 0; border-radius: 4px; background: #ff6b35; color: #fff; cursor: pointer; }
.authPanel button:disabled { opacity: .6; cursor: wait; }
.errorMessage { margin: 0; color: #ff8c8c; }
</style>

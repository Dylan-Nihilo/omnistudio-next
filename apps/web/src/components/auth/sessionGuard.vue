<template>
  <uiDialog :modelValue="!!sessionInvalidated" title="当前账户需要重新确认" :showClose="false" :closeOnClickModal="false" :closeOnPressEscape="false" width="min(480px, calc(100vw - 32px))">
    <div class="sessionRecovery">
      <p>{{ sessionInvalidated === 'changed' ? '账户已在其他页面切换，当前页面已暂停保存。' : '登录状态已失效，当前页面已暂停保存。' }}</p>
      <p>请重新登录 <strong>{{ auth.user?.email }}</strong> 后恢复编辑。未保存的内容会留在当前页面。</p>
      <p v-if="errorMessage" class="recoveryError" role="alert">{{ errorMessage }}</p>
      <uiButton tag="a" :href="loginHref" target="_blank" rel="noopener noreferrer" variant="secondary">在新页面重新登录</uiButton>
    </div>
    <template #footer><uiButton variant="ghost" @click="leaveAccount">放弃当前编辑</uiButton><uiButton :loading="restoring" :disabled="restoring" @click="restore">已重新登录，恢复编辑</uiButton></template>
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { uiButton, uiDialog, useUiFeedback } from "@omnistudio-next/ui";
import { useAuthStore } from "@/stores/auth";
import { sessionInvalidated } from "@/lib/sessionState";
const auth = useAuthStore(); const feedback = useUiFeedback();
const restoring = ref(false); const errorMessage = ref("");
const loginHref = computed(() => `#/auth/login?switch=1&email=${encodeURIComponent(auth.user?.email ?? '')}`);
async function restore() {
  restoring.value = true; errorMessage.value = "";
  try { if (!await auth.restoreSession(auth.user?.id)) errorMessage.value = "尚未登录原账户，请在新页面登录后再恢复编辑。"; }
  finally { restoring.value = false; }
}
async function leaveAccount() {
  try { await feedback.confirm("未保存的编辑内容会被放弃。确定重新加载并进入当前账户？", "离开当前编辑", { danger: true, confirmButtonText: "放弃并重新加载", cancelButtonText: "保留编辑" }); location.reload(); }
  catch { }
}
</script>

<style lang="scss" scoped>
.sessionRecovery { display: grid; gap: 16px; p { margin: 0; color: var(--uiTextBody); line-height: 1.7; overflow-wrap: anywhere; } .recoveryError { color: var(--uiStatusError); } }
</style>

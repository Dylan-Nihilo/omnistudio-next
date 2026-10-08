<template>
  <nav class="workspaceMenu" aria-label="项目操作"><uiBadge dot :hidden="!hasDesktopUpdate" label="有新版本可用"><uiIconButton variant="ghost" :icon="IconSettings" :label="hasDesktopUpdate ? '设置，有新版本可用' : '设置'" title="设置" @click="emit('openSettings')" /></uiBadge><uiIconButton variant="secondary" :icon="IconArrowLeft" label="退出项目" title="退出项目" @click="exitVisible = true" />
    <uiDialog v-model="exitVisible" title="退出项目" :width="400" :closeOnClickModal="false" :closeOnPressEscape="!leaving" :showClose="!leaving"><p class="exitMessage">是否退出当前项目并返回首页？</p><template #footer><uiButton variant="secondary" :disabled="leaving" @click="exitVisible = false">取消</uiButton><uiButton :loading="leaving" @click="exitProject">退出项目</uiButton></template></uiDialog>
  </nav>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { IconArrowLeft, IconSettings } from "@tabler/icons-vue";
import { uiIconButton, uiBadge, uiDialog, uiButton } from "@toonflow/ui";
import { hasDesktopUpdate } from "@/stores/desktopUpdate";

const emit = defineEmits<{ openSettings: [] }>();
const router = useRouter();
const exitVisible = ref(false);
const leaving = ref(false);

async function exitProject() {
  if (leaving.value) return;
  leaving.value = true;
  try {
    await router.push("/home");
  } finally {
    leaving.value = false;
  }
}
</script>

<style scoped lang="scss">
.workspaceMenu { display: flex; align-items: center; gap: 8px; min-width: 0; }
.exitMessage { margin: 0; color: var(--uiTextBody); font-size: var(--uiFontBody); line-height: 1.7; }
</style>

<template>
  <uiDialog v-model="visible" title="上传到团队空间" :width="500" :closeOnClickModal="!busy">
    <div class="shareAssetForm"><p>将「{{ fileName }}」复制到团队空间。团队成员均可访问共享副本，个人原件仍保留。</p><uiField label="接收团队" required><template #default="{ id }"><uiSelect :id="id" :modelValue="teamId" :options="teamOptions" :disabled="busy || loading" placeholder="选择接收团队" @update:modelValue="value => typeof value === 'string' && (teamId = value)" /></template></uiField><p v-if="!loading && !teamOptions.length" class="shareHint">你还没有加入团队。<router-link to="/teams" @click="visible = false">前往团队空间</router-link></p><p v-if="errorMessage" class="shareError" role="alert">{{ errorMessage }}</p></div>
    <template #footer><uiButton variant="secondary" :disabled="busy" @click="visible = false">取消上传</uiButton><uiButton :loading="busy" :disabled="busy || loading || !teamId" @click="share">上传共享副本</uiButton></template>
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import axios from "axios";
import { uiButton, uiDialog, uiField, uiSelect, useUiFeedback } from "@omnistudio-next/ui";
import { authClient } from "@/lib/authApi";
import { copyAssetToTeam, getTeams } from "@/lib/accountApi";
const props = defineProps<{ path: string; directory?: string; mimeType?: string }>();
const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ shared: [] }>();
const feedback = useUiFeedback(); const teamOptions = ref<{ value: string; label: string }[]>([]); const teamId = ref(""); const loading = ref(false); const busy = ref(false); const errorMessage = ref("");
const fileName = computed(() => props.path.split(/[\\/]/).at(-1) ?? props.path);
watch(visible, async open => { if (!open) return; loading.value = true; errorMessage.value = ""; try { teamOptions.value = (await getTeams()).filter(team => team.status !== "archived").map(team => ({ value: team.id, label: team.name })); teamId.value = teamOptions.value[0]?.value ?? ""; } catch (error) { errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "读取团队失败" : "读取团队失败，请重试"; } finally { loading.value = false; } });
async function share() {
  const input = { teamId: teamId.value, path: props.path, ...(props.directory ? { directory: props.directory } : {}), mimeType: props.mimeType ?? "application/octet-stream" };
  busy.value = true; errorMessage.value = "";
  try {
    if (!props.mimeType && !props.directory) { const response = await authClient.head("/api/assets/read", { params: { path: input.path } }); input.mimeType = String(response.headers["content-type"] ?? "application/octet-stream").split(";")[0]!; }
    await copyAssetToTeam(input); visible.value = false; emit("shared"); feedback.message({ tone: "success", message: "已上传到团队空间，个人原件保留" });
  } catch (error) { errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "上传未确认，请刷新团队资产后重试" : error instanceof Error ? error.message : "上传失败，请重试"; }
  finally { busy.value = false; }
}
</script>

<style lang="scss" scoped>
.shareAssetForm { display: grid; gap: 20px; p { margin: 0; line-height: 1.7; color: var(--uiTextBody); overflow-wrap: anywhere; } .shareHint { color: var(--uiTextMuted); font-size: 12px; a { color: var(--uiActionPrimary); } } .shareError { color: var(--uiStatusError); font-size: var(--uiFontControl); } }
</style>

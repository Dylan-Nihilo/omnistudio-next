<template>
  <authShell title="一起把故事做出来" description="加入团队后，可以使用团队共享资产。你的个人项目和积分仍独立保存。">
    <p v-if="invitation" class="invitationNote">团队：{{ invitation.teamName }}<br />邀请邮箱：{{ invitation.email }}</p>
    <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
    <template v-if="invitation && auth.isAuthenticated"><p v-if="auth.user?.email !== invitation.email" class="errorMessage">当前登录邮箱与邀请不一致，请切换到被邀请的账户。</p><uiButton v-else class="submitButton" :loading="busy" :disabled="busy" @click="join">接受邀请并加入团队</uiButton><div class="authLinks"><a :href="loginHref">使用被邀请的账户登录</a></div></template>
    <template v-else-if="invitation"><uiButton tag="a" :href="registerHref" class="submitButton">创建账户并加入团队</uiButton><div class="authLinks"><span>已有账户？</span><a :href="loginHref">登录并加入团队</a></div></template>
    <div v-else class="authLinks"><a href="#/auth">返回账户入口</a></div>
  </authShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import axios from "axios";
import { uiButton } from "@omnistudio-next/ui";
import authShell from "@/components/auth/authShell.vue";
import { useAuthStore } from "@/stores/auth";
import { getInvitation } from "@/lib/authApi";
import { acceptInvite } from "@/lib/accountApi";
const route = useRoute(); const router = useRouter(); const auth = useAuthStore();
const token = typeof route.query.token === "string" ? route.query.token : "";
const invitation = ref<Awaited<ReturnType<typeof getInvitation>>>(); const errorMessage = ref(""); const busy = ref(false);
const loginHref = computed(() => `#/auth/login?switch=1&invite=${encodeURIComponent(token)}`);
const registerHref = computed(() => `#/auth/register?invite=${encodeURIComponent(token)}`);
onMounted(async () => { try { invitation.value = await getInvitation(token); } catch (error) { errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "邀请已失效" : "无法读取邀请，请重试"; } });
async function join() { busy.value = true; try { const result = await acceptInvite(token); await auth.restoreSession(); auth.selectTeam(result.teamId); await router.replace("/teams"); } catch (error) { errorMessage.value = axios.isAxiosError(error) ? error.response?.data?.message || "加入团队失败" : "加入团队失败，请重试"; } finally { busy.value = false; } }
</script>

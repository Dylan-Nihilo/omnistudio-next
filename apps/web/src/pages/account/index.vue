<template>
  <main class="accountPage">
    <header class="accountHeader"><a href="#/home" class="backLink">← 返回创作工作台</a><button type="button" class="signOutButton" @click="signOut">退出登录</button></header>
    <section class="accountContent">
      <div class="accountTitle"><div><span class="eyebrow">ACCOUNT</span><h1>账户与 Workspace</h1><p>{{ auth.user?.email }}</p></div><label class="workspaceSelect">当前 Workspace<select :value="auth.currentWorkspaceId" @change="switchWorkspace"><option v-for="item in auth.workspaces" :key="item.id" :value="item.id">{{ item.name }}（{{ item.role }}）</option></select></label></div>
      <p v-if="errorMessage" class="errorMessage" role="alert">{{ errorMessage }}</p>
      <div class="summaryGrid"><article class="summaryCard"><span>可用积分</span><strong>{{ wallet ? wallet.available.toLocaleString() : "—" }}</strong><small>总余额 {{ wallet ? wallet.total.toLocaleString() : "—" }} · 冻结 {{ wallet?.frozen?.toLocaleString() ?? "—" }}</small></article><article class="summaryCard"><span>Workspace 成员</span><strong>{{ members.length || "—" }}</strong><small>当前工作空间的访问成员</small></article></div>
      <section v-if="adminWorkspaces" class="accountSection adminSection"><header><div><h2>平台积分管理</h2><p>管理员可以为开发阶段的 Workspace 发放平台积分，所有操作都会写入审计流水。</p></div><button type="button" class="refreshButton" @click="loadAdmin">刷新</button></header><p v-if="adminError" class="errorMessage" role="alert">{{ adminError }}</p><div class="adminWorkspaceList"><div v-for="item in adminWorkspaces" :key="item.id" class="adminWorkspaceRow"><div><strong>{{ item.name }}</strong><span>{{ item.memberCount }} 位成员 · 可用 {{ item.available.toLocaleString() }} · 冻结 {{ item.frozen.toLocaleString() }}</span></div><button type="button" class="grantQuickButton" @click="grantWorkspaceId = item.id">选择</button></div></div><div class="inlineForm adminGrantForm"><select v-model="grantWorkspaceId" aria-label="选择 Workspace"><option value="" disabled>选择 Workspace</option><option v-for="item in adminWorkspaces" :key="item.id" :value="item.id">{{ item.name }}</option></select><input v-model.number="grantAmount" type="number" min="1" step="1" placeholder="发放积分" aria-label="发放积分" /><input v-model.trim="grantReason" maxlength="500" placeholder="发放原因" aria-label="发放原因" /><button type="button" :disabled="saving || !grantWorkspaceId || !grantAmount || grantAmount < 1 || !grantReason" @click="grantCredits">发放积分</button></div></section>
      <section class="accountSection"><header><div><h2>Workspace 管理</h2><p>创建工作空间或邀请协作者。每个 Workspace 的积分和成员相互隔离。</p></div></header><div class="inlineForm"><input v-model.trim="workspaceName" placeholder="新 Workspace 名称" maxlength="160" /><button type="button" :disabled="!workspaceName || saving" @click="createNewWorkspace">创建 Workspace</button></div><div class="members"><div v-for="member in members" :key="member.id" class="memberRow"><div><strong>{{ member.displayName }}</strong><span>{{ member.email }}</span></div><span class="roleTag">{{ member.role }}</span></div></div><div v-if="canInvite" class="inlineForm inviteForm"><input v-model.trim="inviteEmail" type="email" placeholder="协作者邮箱" /><select v-model="inviteRole"><option value="member">成员</option><option value="admin">管理员</option></select><button type="button" :disabled="!inviteEmail || saving" @click="createInvite">生成邀请</button></div><p v-if="inviteToken" class="inviteResult">邀请令牌：<code>{{ inviteToken }}</code>（有效期 7 天）</p></section>
      <section class="accountSection"><header><div><h2>积分流水</h2><p>生成任务会先冻结积分，完成后扣除，失败会自动释放。</p></div><button type="button" class="refreshButton" @click="loadAccount">刷新</button></header><div class="ledger"><div v-for="entry in ledger" :key="entry.id" class="ledgerRow"><div><strong>{{ ledgerLabels[entry.kind] ?? entry.kind }}</strong><span>{{ entry.reason || "平台积分变动" }}</span></div><div class="ledgerAmount" :class="{ negative: entry.amount < 0 }">{{ entry.amount > 0 ? "+" : "" }}{{ entry.amount.toLocaleString() }}<small>{{ formatDate(entry.createdAt) }}</small></div></div><p v-if="!ledger.length" class="emptyState">暂无积分流水</p></div></section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { createWorkspace, getAdminWorkspaces, getLedger, getMembers, getWallet, grantAdminCredits, inviteMember, type AdminWorkspace, type LedgerEntry, type Wallet, type WorkspaceMember } from "@/lib/accountApi";

const router = useRouter();
const auth = useAuthStore();
const wallet = ref<Wallet>();
const ledger = ref<LedgerEntry[]>([]);
const members = ref<WorkspaceMember[]>([]);
const errorMessage = ref("");
const saving = ref(false);
const workspaceName = ref("");
const inviteEmail = ref("");
const inviteRole = ref<"admin" | "member">("member");
const inviteToken = ref("");
const adminWorkspaces = ref<AdminWorkspace[]>();
const adminError = ref("");
const grantWorkspaceId = ref("");
const grantAmount = ref<number | null>(null);
const grantReason = ref("");
const canInvite = computed(() => ["owner", "admin"].includes(auth.currentWorkspace?.role ?? ""));
const ledgerLabels: Record<string, string> = { grant: "积分发放", adjustment: "积分调整", reserve: "生成预留", capture: "生成扣除", release: "失败释放" };

async function loadAccount() {
  const workspaceId = auth.currentWorkspaceId;
  if (!workspaceId) return;
  errorMessage.value = "";
  try { [wallet.value, ledger.value, members.value] = await Promise.all([getWallet(workspaceId), getLedger(workspaceId), getMembers(workspaceId)]); }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : "账户信息读取失败"; }
}
async function switchWorkspace(event: Event) { auth.selectWorkspace((event.target as HTMLSelectElement).value); inviteToken.value = ""; await loadAccount(); }
async function createNewWorkspace() {
  if (!workspaceName.value || saving.value) return;
  saving.value = true;
  try { const created = await createWorkspace(workspaceName.value, auth.csrfToken); await auth.restoreSession(); auth.selectWorkspace(created.id); workspaceName.value = ""; await loadAccount(); }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : "创建 Workspace 失败"; }
  finally { saving.value = false; }
}
async function createInvite() {
  if (!inviteEmail.value || saving.value || !auth.currentWorkspaceId) return;
  saving.value = true;
  try { inviteToken.value = (await inviteMember(auth.currentWorkspaceId, inviteEmail.value, inviteRole.value, auth.csrfToken)).token; inviteEmail.value = ""; }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : "生成邀请失败"; }
  finally { saving.value = false; }
}
async function loadAdmin() {
  adminError.value = "";
  try {
    adminWorkspaces.value = await getAdminWorkspaces();
    if (!grantWorkspaceId.value) grantWorkspaceId.value = adminWorkspaces.value[0]?.id ?? "";
  } catch (error) {
    if ((error as { status?: number }).status === 403) return;
    adminError.value = error instanceof Error ? error.message : "管理员积分信息读取失败";
  }
}
async function grantCredits() {
  if (!grantWorkspaceId.value || !grantAmount.value || grantAmount.value < 1 || !grantReason.value || saving.value) return;
  saving.value = true;
  try {
    await grantAdminCredits(grantWorkspaceId.value, Math.floor(grantAmount.value), grantReason.value, auth.csrfToken);
    grantAmount.value = null;
    grantReason.value = "";
    await loadAdmin();
    if (grantWorkspaceId.value === auth.currentWorkspaceId) await loadAccount();
  } catch (error) { adminError.value = error instanceof Error ? error.message : "发放积分失败"; }
  finally { saving.value = false; }
}
async function signOut() { await auth.signOut(); await router.replace("/auth/login"); }
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }
watch(() => auth.currentWorkspaceId, () => { void loadAccount(); });
onMounted(() => { void loadAccount(); void loadAdmin(); });
</script>

<style scoped>
.accountPage { min-height: 100dvh; color: #f5f5f5; background: #090909; }
.accountHeader { display: flex; justify-content: space-between; align-items: center; padding: 20px 5vw; border-bottom: 1px solid #282828; }
.backLink { color: #ff9a75; text-decoration: none; }.signOutButton, .refreshButton { border: 1px solid #444; border-radius: 6px; padding: 8px 12px; color: #ddd; background: #171717; cursor: pointer; }.signOutButton:hover, .refreshButton:hover { border-color: #ff6b35; }
.accountContent { width: min(980px, calc(100% - 40px)); margin: 0 auto; padding: 48px 0 80px; }.accountTitle { display: flex; justify-content: space-between; align-items: end; gap: 24px; margin-bottom: 28px; }.eyebrow { color: #ff6b35; font-size: 12px; letter-spacing: .18em; }.accountTitle h1 { margin: 8px 0; font-size: clamp(30px, 5vw, 48px); }.accountTitle p, .accountSection p { margin: 0; color: #999; }.workspaceSelect { display: grid; gap: 8px; min-width: 240px; color: #aaa; }.workspaceSelect select, .inlineForm input, .inlineForm select { width: 100%; box-sizing: border-box; border: 1px solid #444; border-radius: 6px; padding: 10px 12px; color: #fff; background: #151515; }.summaryGrid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px; }.summaryCard, .accountSection { border: 1px solid #2b2b2b; border-radius: 10px; background: #121212; }.summaryCard { display: grid; gap: 8px; padding: 20px; }.summaryCard span, .summaryCard small { color: #999; }.summaryCard strong { font-size: 32px; }.accountSection { margin-top: 20px; padding: 24px; }.accountSection header { display: flex; justify-content: space-between; gap: 20px; align-items: start; margin-bottom: 20px; }.accountSection h2 { margin: 0 0 8px; }.inlineForm { display: flex; gap: 8px; margin-bottom: 20px; }.inlineForm button { flex: 0 0 auto; border: 0; border-radius: 6px; padding: 10px 14px; color: #fff; background: #ff6b35; cursor: pointer; }.inlineForm button:disabled { opacity: .55; cursor: wait; }.inviteForm { max-width: 620px; }.inviteForm select { width: 130px; }.members, .ledger { display: grid; gap: 8px; }.memberRow, .ledgerRow { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid #292929; }.memberRow div, .ledgerRow div { display: grid; gap: 4px; }.memberRow span, .ledgerRow span, .ledgerAmount small { color: #999; font-size: 13px; }.roleTag { color: #ff9a75 !important; }.ledgerAmount { display: grid; gap: 4px; text-align: right; color: #76d59a; }.ledgerAmount.negative { color: #ff9b8e; }.ledgerAmount small { color: #777; }.inviteResult { padding: 12px; border-radius: 6px; color: #ffd2c1 !important; background: #291914; overflow-wrap: anywhere; }.emptyState { padding: 16px 0; text-align: center; }.errorMessage { margin: 0 0 20px; color: #ff8c8c; }
.adminWorkspaceList { display: grid; gap: 8px; margin-bottom: 20px; }.adminWorkspaceRow { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; border-top: 1px solid #292929; }.adminWorkspaceRow div { display: grid; gap: 4px; }.adminWorkspaceRow span { color: #999; font-size: 13px; }.grantQuickButton { border: 1px solid #555; border-radius: 6px; padding: 7px 11px; color: #ddd; background: #181818; cursor: pointer; }.adminGrantForm { max-width: 900px; }.adminGrantForm select { flex: 1 1 190px; }.adminGrantForm input { flex: 1 1 150px; }.adminGrantForm input[type="number"] { max-width: 140px; }
@media (max-width: 700px) { .accountTitle { align-items: stretch; flex-direction: column; }.workspaceSelect { min-width: 0; }.summaryGrid { grid-template-columns: 1fr; }.inlineForm { flex-wrap: wrap; }.inviteForm select { width: 100%; } }
</style>

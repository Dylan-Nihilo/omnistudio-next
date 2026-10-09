<template>
  <accountShell title="个人账户" eyebrow="我的空间" description="项目、资产和积分属于你的个人账户。团队协作不合并积分余额。">
    <template #actions><uiButton variant="secondary" :loading="loading" @click="loadAccount">刷新余额</uiButton><uiButton variant="ghost" :disabled="busy" @click="auth.signOut()">退出登录</uiButton></template>
    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
    <div class="balanceSummary" aria-label="个人积分余额"><div><span>可用积分</span><strong>{{ wallet?.available.toLocaleString() ?? '—' }}</strong></div><div><span>冻结积分</span><strong>{{ wallet?.frozen.toLocaleString() ?? '—' }}</strong></div><div><span>总余额</span><strong>{{ wallet?.total.toLocaleString() ?? '—' }}</strong></div></div>
    <div class="accountForms">
      <section class="accountSection" aria-labelledby="transferTitle">
        <header><h2 id="transferTitle">划转积分</h2><p>向同一团队的成员划转自己的可用积分。</p></header>
        <form class="sectionForm" @submit.prevent="submitTransfer">
          <uiField label="团队" required><template #default="{ id }"><uiSelect :id="id" :modelValue="transferTeamId" :options="transferTeamOptions" :disabled="busy || !transferTeamOptions.length" placeholder="选择你加入的团队" @update:modelValue="value => typeof value === 'string' && (transferTeamId = value)" /></template></uiField>
          <uiField label="接收成员" required><template #default="{ id }"><uiSelect :id="id" :modelValue="recipientId" :options="recipientOptions" :disabled="busy || membersLoading || !transferTeamId" placeholder="选择接收成员" @update:modelValue="value => typeof value === 'string' && (recipientId = value)" /></template></uiField>
          <uiField label="积分数量" required><template #default="{ id }"><uiNumberInput :id="id" v-model="amount" :min="1" :max="Math.max(1, wallet?.available ?? 0)" :step="1" :precision="0" :disabled="busy || !wallet || wallet.available < 1" /></template></uiField>
          <uiField label="备注"><template #default="{ id }"><uiInput :id="id" v-model.trim="note" maxlength="500" :disabled="busy" placeholder="本次划转的用途" /></template></uiField>
          <p v-if="!transferTeamOptions.length" class="sectionHint">创建或加入团队后，即可向同团队成员划转积分。<router-link to="/teams">前往团队空间</router-link></p>
          <p v-if="transferError" class="pageError" role="alert">{{ transferError }}</p>
          <uiButton htmlType="submit" :loading="busy" :disabled="busy || !recipientId || !amount || !wallet || amount > wallet.available">确认划转积分</uiButton>
        </form>
      </section>
      <section class="accountSection" aria-labelledby="profileTitle">
        <header><h2 id="profileTitle">账户资料</h2><p>{{ auth.user?.email }}</p></header>
        <form class="sectionForm" @submit.prevent="saveName"><uiField label="显示名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="displayName" maxlength="120" :disabled="busy" required /></template></uiField><uiButton variant="secondary" htmlType="submit" :disabled="busy || !displayName" :loading="busy">保存名称</uiButton></form>
        <div class="passwordSection"><h3>修改密码</h3><p class="sectionHint">修改后需重新登录，已开启的服务凭证也会停用。</p><form class="sectionForm" @submit.prevent="submitPassword"><uiField label="当前密码" required><template #default="{ id }"><uiInput :id="id" v-model="currentPassword" type="password" autocomplete="current-password" :disabled="busy" required showPassword /></template></uiField><uiField label="新密码" required><template #default="{ id }"><uiInput :id="id" v-model="password" type="password" minlength="12" maxlength="200" autocomplete="new-password" :disabled="busy" required showPassword /></template></uiField><uiField label="确认新密码" required><template #default="{ id }"><uiInput :id="id" v-model="confirmation" type="password" autocomplete="new-password" :disabled="busy" required showPassword /></template></uiField><uiButton variant="secondary" htmlType="submit" :disabled="busy || !currentPassword || !password" :loading="busy">修改密码</uiButton></form></div>
      </section>
    </div>
    <section class="ledgerSection" aria-labelledby="ledgerTitle"><header><h2 id="ledgerTitle">积分流水</h2><span>最近 100 条</span></header><uiTable :rows="ledger" :columns="ledgerColumns" :loading="loading" emptyText="还没有积分流水" label="个人积分流水"><template #cell="{ row, column }"><span v-if="column.key === 'kind'">{{ ledgerLabels[String(row.kind)] ?? row.kind }}</span><span v-else-if="column.key === 'amount'" :class="{ negative: Number(row.amount) < 0 }">{{ Number(row.amount) > 0 ? '+' : '' }}{{ Number(row.amount).toLocaleString() }}</span><span v-else-if="column.key === 'createdAt'">{{ new Date(String(row.createdAt)).toLocaleString('zh-CN', { hour12: false }) }}</span><span v-else>{{ row[column.key] ?? '—' }}</span></template></uiTable></section>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import axios from "axios";
import { uiButton, uiField, uiInput, uiNumberInput, uiSelect, uiTable, useUiFeedback, isUiCancelledError, type UiColumn } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import { useAuthStore } from "@/stores/auth";
import { getWallet, getLedger, getMembers, transferCredits, saveProfile, changePassword, type Wallet, type LedgerEntry, type TeamMember } from "@/lib/accountApi";
const auth = useAuthStore(); const feedback = useUiFeedback();
const wallet = ref<Wallet>(); const ledger = ref<LedgerEntry[]>([]); const loading = ref(false); const busy = ref(false); const errorMessage = ref("");
const transferTeamId = ref(""); const recipientId = ref(""); const amount = ref<number | null>(null); const note = ref(""); const transferError = ref(""); const members = ref<TeamMember[]>([]); const membersLoading = ref(false); let memberRevision = 0; let transferKey = crypto.randomUUID();
const displayName = ref(auth.user?.displayName ?? ""); const currentPassword = ref(""); const password = ref(""); const confirmation = ref("");
const transferTeamOptions = computed(() => auth.teams.filter(team => team.role !== "root" && team.status !== "archived").map(team => ({ value: team.id, label: team.name })));
const recipientOptions = computed(() => members.value.filter(member => member.id !== auth.user?.id && member.status === "active").map(member => ({ value: member.id, label: `${member.displayName} · ${member.email}` })));
const ledgerColumns: UiColumn[] = [{ key: "kind", label: "变动类型", width: 130 }, { key: "reason", label: "用途" }, { key: "amount", label: "积分变动", width: 130, align: "right" }, { key: "balanceAfter", label: "变动后余额", width: 130, align: "right" }, { key: "createdAt", label: "时间", width: 180 }];
const ledgerLabels: Record<string, string> = { grant: "管理员发放", adjustment: "管理员调整", reserve: "生成预留", capture: "生成扣除", release: "预留释放", transferIn: "成员划入", transferOut: "成员划出" };
function errorText(error: unknown) { return axios.isAxiosError(error) ? error.response?.data?.message || "连接中断，请刷新后确认结果" : error instanceof Error ? error.message : "操作失败，请重试"; }
async function loadAccount() { loading.value = true; errorMessage.value = ""; try { [wallet.value, ledger.value] = await Promise.all([getWallet(), getLedger()]); } catch (error) { errorMessage.value = errorText(error); } finally { loading.value = false; } }
watch(transferTeamId, async id => { const revision = ++memberRevision; members.value = []; recipientId.value = ""; if (!id) return; membersLoading.value = true; try { const data = await getMembers(id); if (revision === memberRevision) members.value = data; } catch (error) { if (revision === memberRevision) transferError.value = errorText(error); } finally { if (revision === memberRevision) membersLoading.value = false; } });
watch([transferTeamId, recipientId, amount, note], () => { transferKey = crypto.randomUUID(); transferError.value = ""; });
async function submitTransfer() {
  if (!amount.value || !recipientId.value || busy.value) return;
  const recipient = members.value.find(member => member.id === recipientId.value); if (!recipient) return;
  const input = { teamId: transferTeamId.value, recipientId: recipientId.value, amount: amount.value, reason: note.value || `划转给 ${recipient.displayName}`, key: transferKey };
  try { await feedback.confirm(`将 ${input.amount.toLocaleString()} 积分划转给 ${recipient.displayName}（${recipient.email}）。划转后积分归对方所有，不能自行撤回。`, "确认成员积分划转", { confirmButtonText: "划转积分", cancelButtonText: "保留积分" }); }
  catch { return; }
  busy.value = true; transferError.value = "";
  try { await transferCredits(input.teamId, input.recipientId, input.amount, input.reason, input.key); amount.value = null; note.value = ""; await loadAccount(); feedback.message({ tone: "success", message: "积分已划转" }); }
  catch (error) { transferError.value = errorText(error); }
  finally { busy.value = false; }
}
async function saveName() { busy.value = true; errorMessage.value = ""; try { await saveProfile(displayName.value); await auth.restoreSession(); feedback.message({ tone: "success", message: "名称已更新" }); } catch (error) { errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function submitPassword() {
  if (password.value !== confirmation.value) { errorMessage.value = "两次输入的新密码不一致"; return; }
  busy.value = true; errorMessage.value = "";
  try { await changePassword(currentPassword.value, password.value); auth.clear(); location.hash = "/auth/login"; location.reload(); }
  catch (error) { errorMessage.value = errorText(error); }
  finally { busy.value = false; }
}
onMounted(async () => { await auth.restoreSession(); transferTeamId.value = transferTeamOptions.value[0]?.value ?? ""; await loadAccount(); });
</script>

<style lang="scss" scoped>
.pageError { color: var(--uiStatusError); font-size: var(--uiFontControl); line-height: 1.6; margin: 0 0 20px; overflow-wrap: anywhere; }
.balanceSummary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px; margin-bottom: 36px; padding-bottom: 32px; border-bottom: 1px solid var(--uiBorderDefault); > div { display: grid; gap: 12px; min-width: 0; span { color: var(--uiTextMuted); font-size: var(--uiFontControl); } strong { font-size: clamp(26px, 3vw, 38px); line-height: 1.2; overflow-wrap: anywhere; } &:first-child strong { color: var(--uiActionPrimary); } } }
.accountForms { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; .accountSection { min-width: 0; header { margin-bottom: 24px; h2 { margin: 0 0 8px; font-size: 18px; } p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; overflow-wrap: anywhere; } } .sectionForm { display: grid; gap: 18px; max-width: 460px; } .sectionHint { margin: 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.7; a { color: var(--uiActionPrimary); } } .passwordSection { border-top: 1px solid var(--uiBorderDefault); margin-top: 28px; padding-top: 24px; h3 { margin: 0 0 8px; font-size: 16px; } .sectionHint { margin-bottom: 20px; } } } }
.ledgerSection { margin-top: 40px; padding-top: 28px; border-top: 1px solid var(--uiBorderDefault); header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 20px; h2 { margin: 0; font-size: 18px; } span { color: var(--uiTextMuted); font-size: 12px; } } .negative { color: var(--uiStatusError); } }
@media (max-width: 800px) { .accountForms { grid-template-columns: 1fr; gap: 32px; } .balanceSummary { gap: 16px; } }
</style>

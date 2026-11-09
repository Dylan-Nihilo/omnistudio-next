<template>
  <uiDialog v-model="open" title="项目成员" :width="720" :destroyOnClose="false">
    <div class="memberPanel">
      <header class="memberHeader"><div><span>项目成员</span><strong>按所属团队已有账户分配项目角色</strong></div><uiButton size="small" variant="secondary" :loading="loading" :disabled="busy" @click="loadMembers">刷新</uiButton></header>
      <p v-if="errorMessage" class="memberError" role="alert">{{ errorMessage }}</p>
      <section class="memberAdd" aria-label="添加项目成员">
        <uiField label="添加已有账户"><template #default="{ id }"><uiSelect :id="id" v-model="selectedUserId" :options="userOptions" :disabled="busy" placeholder="选择团队账户" noDataText="没有可添加的团队账户" /></template></uiField>
        <uiField label="项目角色"><template #default="{ id }"><uiSelect :id="id" v-model="selectedRole" :options="roleOptions" :disabled="busy" /></template></uiField>
        <uiButton :loading="!!selectedUserId && savingUserId === selectedUserId" :disabled="!selectedUserId || busy" @click="saveMember(selectedUserId, selectedRole)">添加成员</uiButton>
      </section>
      <section class="memberList" aria-label="当前项目成员">
        <div v-if="loading && !members.length" class="memberEmpty">正在读取成员…</div>
        <div v-else-if="!members.length" class="memberEmpty">当前项目还没有成员</div>
        <article v-for="member in activeMembers" :key="member.id" class="memberRow">
          <div class="memberIdentity"><strong>{{ member.displayName || member.email }}</strong><small>{{ member.email }}<template v-if="member.userId === currentUserId"> · 当前账户</template></small></div>
          <uiSelect :modelValue="member.role" :options="canManageMember(member) ? roleOptions : allRoleOptions" :disabled="busy || !canManageMember(member)" :aria-label="`${member.displayName || member.email}的项目角色`" @update:modelValue="value => saveMember(member.userId, String(value))" />
          <uiButton size="small" variant="ghost" :disabled="busy || !canManageMember(member) || member.userId === currentUserId" @click="removeMember(member)">移除</uiButton>
        </article>
      </section>
      <p class="memberHint">移除只会停用项目成员资格，历史审计记录和成片归属会保留。最后一名 owner 不能被降级或移除。</p>
    </div>
  </uiDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import axios from "axios";
import { uiButton, uiDialog, uiField, uiSelect } from "@omnistudio-next/ui";
import { getSessionSnapshot, sessionInvalidated } from "@/lib/sessionState";

type ProjectRole = "owner" | "producer" | "writer" | "director" | "artist" | "editor" | "reviewer" | "viewer";
type Member = { id: string; userId: string; email: string; displayName: string | null; role: ProjectRole; status: "active" | "removed" };
type UserOption = { id: string; email: string; displayName: string | null };
type ApiResponse<T> = { code: number; data: T; message: string };

const props = defineProps<{ projectId: string; currentUserId: string; currentRole: ProjectRole; refreshKey: number }>();
const emit = defineEmits<{ changed: [] }>();
const open = defineModel<boolean>({ default: false });
const members = ref<Member[]>([]);
const availableUsers = ref<UserOption[]>([]);
const selectedUserId = ref("");
const selectedRole = ref<ProjectRole>("viewer");
const loading = ref(false);
const errorMessage = ref("");
const savingUserId = ref("");
const busy = computed(() => loading.value || !!savingUserId.value);
const activeMembers = computed(() => members.value.filter(member => member.status === "active"));
const userOptions = computed(() => availableUsers.value.map(user => ({ value: user.id, label: `${user.displayName || user.email} · ${user.email}` })));
const allRoleOptions: { value: ProjectRole; label: string }[] = [
  { value: "viewer", label: "查看者" }, { value: "reviewer", label: "审片人" }, { value: "writer", label: "编剧" },
  { value: "director", label: "导演" }, { value: "artist", label: "美术" }, { value: "editor", label: "剪辑师" },
  { value: "producer", label: "制片人" }, { value: "owner", label: "项目所有者" },
];
const roleOptions = computed(() => props.currentRole === "producer" ? allRoleOptions.filter(option => option.value !== "owner" && option.value !== "producer") : allRoleOptions);
let active = true;
let requestVersion = 0;
let requestController: AbortController | undefined;

function cancelRequests() {
  requestVersion++;
  requestController?.abort();
  requestController = undefined;
  loading.value = false;
  savingUserId.value = "";
}
function beginRequest() {
  requestController?.abort();
  const controller = new AbortController();
  requestController = controller;
  const session = getSessionSnapshot();
  return { version: ++requestVersion, projectId: props.projectId, userId: props.currentUserId, session, signal: AbortSignal.any([controller.signal, session.signal]) };
}
function isCurrent(request: ReturnType<typeof beginRequest>) {
  const session = getSessionSnapshot();
  return active && open.value && request.version === requestVersion && request.projectId === props.projectId && request.userId === props.currentUserId
    && session.userId === request.userId && session.revision === request.session.revision && !request.signal.aborted;
}

function errorText(error: unknown) { return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "请求失败，请重试" : error instanceof Error ? error.message : "请求失败，请重试"; }
function canManageMember(member: Member) {
  if (props.currentRole !== "owner" && props.currentRole !== "producer") return false;
  if (props.currentRole === "producer" && (member.userId === props.currentUserId || member.role === "owner" || member.role === "producer")) return false;
  return true;
}
async function loadMembers() {
  if (!open.value || !props.projectId || busy.value || sessionInvalidated.value) return;
  const request = beginRequest();
  loading.value = true;
  errorMessage.value = "";
  try {
    const { data } = await axios.get<ApiResponse<{ members: Member[]; availableUsers: UserOption[] }>>("/api/productionProjects/members/list", { params: { projectId: request.projectId }, signal: request.signal });
    if (!isCurrent(request)) return;
    members.value = data.data.members;
    availableUsers.value = data.data.availableUsers;
    if (!availableUsers.value.some(user => user.id === selectedUserId.value)) selectedUserId.value = "";
  } catch (error) { if (isCurrent(request)) errorMessage.value = errorText(error); }
  finally { if (active && request.version === requestVersion) loading.value = false; }
}
async function saveMember(userId: string, role: string) {
  const member = members.value.find(item => item.userId === userId);
  if (!open.value || busy.value || !userId || !roleOptions.value.some(option => option.value === role) || (member && !canManageMember(member)) || sessionInvalidated.value) return;
  const request = beginRequest();
  savingUserId.value = userId;
  errorMessage.value = "";
  try {
    const { data } = await axios.put<ApiResponse<{ member: Member; changed: boolean }>>("/api/productionProjects/members/save", { projectId: request.projectId, userId, role }, { signal: request.signal });
    if (!isCurrent(request)) return;
    members.value = member ? members.value.map(item => item.userId === userId ? data.data.member : item) : [...members.value, data.data.member];
    availableUsers.value = availableUsers.value.filter(user => user.id !== userId);
    selectedUserId.value = "";
    emit("changed");
    if (userId === request.userId && role !== "owner" && role !== "producer") open.value = false;
  } catch (error) { if (isCurrent(request)) errorMessage.value = errorText(error); }
  finally { if (active && request.version === requestVersion) savingUserId.value = ""; }
}
async function removeMember(member: Member) {
  if (!open.value || busy.value || !canManageMember(member) || member.userId === props.currentUserId || sessionInvalidated.value) return;
  const request = beginRequest();
  savingUserId.value = member.userId;
  errorMessage.value = "";
  try {
    await axios.delete("/api/productionProjects/members/remove", { data: { projectId: request.projectId, userId: member.userId }, signal: request.signal });
    if (!isCurrent(request)) return;
    members.value = members.value.map(item => item.id === member.id ? { ...item, status: "removed" } : item);
    emit("changed");
  } catch (error) { if (isCurrent(request)) errorMessage.value = errorText(error); }
  finally { if (active && request.version === requestVersion) savingUserId.value = ""; }
}
watch([open, () => props.projectId, () => props.currentUserId, () => props.currentRole, () => props.refreshKey, sessionInvalidated], ([visible]) => {
  cancelRequests();
  members.value = [];
  availableUsers.value = [];
  selectedUserId.value = "";
  selectedRole.value = "viewer";
  errorMessage.value = "";
  if (sessionInvalidated.value || !["owner", "producer"].includes(props.currentRole)) { open.value = false; return; }
  if (visible) void loadMembers();
}, { immediate: true });
onBeforeUnmount(() => { active = false; cancelRequests(); });
</script>

<style scoped lang="scss">
.memberPanel {
  display: grid; gap: 16px; min-height: 260px;
  .memberHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--uiBorderDefault); span, strong { display: block; } span { color: var(--uiTextMuted); font-size: 10px; } strong { margin-top: 5px; color: var(--uiTextPrimary); font-size: 14px; } }
  .memberError { margin: 0; color: var(--uiStatusError); font-size: 12px; line-height: 1.5; }
  .memberAdd { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(150px, 1fr) auto; align-items: end; gap: 10px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 8px; background: var(--uiBackgroundSubtle); }
  .memberList {
    display: grid; gap: 7px;
    .memberRow {
      display: grid; grid-template-columns: minmax(0, 1fr) 160px auto; align-items: center; gap: 10px; min-width: 0; padding: 9px 0; border-bottom: 1px solid var(--uiBorderDefault);
      .memberIdentity { min-width: 0; strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } strong { color: var(--uiTextPrimary); font-size: 12px; } small { margin-top: 4px; color: var(--uiTextMuted); font-size: 10px; } }
    }
    .memberEmpty { color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; }
  }
  .memberHint { margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; }
  @media (max-width: 640px) { .memberAdd { grid-template-columns: 1fr; align-items: stretch; } .memberList .memberRow { grid-template-columns: minmax(0, 1fr) 130px; > :last-child { grid-column: 2; justify-self: end; } } }
}
</style>

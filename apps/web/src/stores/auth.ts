import { defineStore } from "pinia";
import { computed, ref } from "vue";
import axios from "axios";
import { getSetupStatus, login, logout, me, setup, type AuthUser, type AuthWorkspace } from "@/lib/authApi";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const workspaces = ref<AuthWorkspace[]>([]);
  const csrfToken = ref("");
  const initialized = ref<boolean | null>(null);
  const loading = ref(false);
  const currentWorkspaceId = ref("");
  const isAuthenticated = computed(() => Boolean(user.value));
  const currentWorkspace = computed(() => workspaces.value.find(item => item.id === currentWorkspaceId.value) ?? workspaces.value[0] ?? null);

  async function loadSetupStatus() {
    const status = await getSetupStatus();
    initialized.value = status.initialized;
    return status.initialized;
  }

  async function restoreSession() {
    try {
      const result = await me();
      user.value = result.user;
      workspaces.value = result.workspaces;
      csrfToken.value = result.csrfToken;
      const savedWorkspaceId = sessionStorage.getItem("omnistudio_workspace_id") ?? "";
      if (!currentWorkspaceId.value || !workspaces.value.some(item => item.id === currentWorkspaceId.value)) {
        currentWorkspaceId.value = workspaces.value.some(item => item.id === savedWorkspaceId) ? savedWorkspaceId : workspaces.value[0]?.id ?? "";
      }
      applyWorkspaceHeader();
      return true;
    } catch {
      clear();
      return false;
    }
  }

  async function initialize() {
    if (loading.value) return;
    loading.value = true;
    try {
      await loadSetupStatus();
      if (initialized.value) await restoreSession();
    } finally {
      loading.value = false;
    }
  }

  async function completeSetup(input: { email: string; displayName: string; password: string; workspaceName: string }) {
    const result = await setup(input);
    user.value = result.user;
    workspaces.value = [result.workspace];
    csrfToken.value = result.csrfToken;
    initialized.value = true;
    currentWorkspaceId.value = result.workspace.id;
    applyWorkspaceHeader();
  }

  async function signIn(input: { email: string; password: string }) {
    const result = await login(input);
    user.value = result.user;
    workspaces.value = result.workspaces;
    csrfToken.value = result.csrfToken;
    currentWorkspaceId.value = result.workspaces[0]?.id ?? "";
    applyWorkspaceHeader();
  }

  async function signOut() {
    if (csrfToken.value) await logout(csrfToken.value);
    clear();
  }

  function clear() {
    user.value = null;
    workspaces.value = [];
    csrfToken.value = "";
    currentWorkspaceId.value = "";
    sessionStorage.removeItem("omnistudio_workspace_id");
      delete axios.defaults.headers.common["x-workspace-id"];
      delete axios.defaults.headers.common["x-csrf-token"];
  }

  function selectWorkspace(id: string) {
    if (workspaces.value.some(item => item.id === id)) {
      currentWorkspaceId.value = id;
      sessionStorage.setItem("omnistudio_workspace_id", id);
      axios.defaults.headers.common["x-workspace-id"] = id;
    }
  }

  function applyWorkspaceHeader() {
    if (currentWorkspaceId.value) axios.defaults.headers.common["x-workspace-id"] = currentWorkspaceId.value;
    if (csrfToken.value) axios.defaults.headers.common["x-csrf-token"] = csrfToken.value;
    if (currentWorkspaceId.value) sessionStorage.setItem("omnistudio_workspace_id", currentWorkspaceId.value);
  }

  return { user, workspaces, csrfToken, initialized, loading, currentWorkspaceId, currentWorkspace, isAuthenticated, initialize, loadSetupStatus, restoreSession, completeSetup, signIn, signOut, clear, selectWorkspace, applyWorkspaceHeader };
});

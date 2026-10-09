import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { invalidateNodeModels } from "@omnistudio-next/nodes-scaffold/nodeAi";
import { getSetupStatus, login, logout, me, register, setup, type AccountInput, type AuthTeam, type AuthUser } from "@/lib/authApi";
import { invalidateBrowserSession, sessionInvalidated, setBrowserSession } from "@/lib/sessionState";
import { resetSettings, settings } from "@/stores/settings";
import { useWorkspaceStore } from "@/stores/workspace";
import { usePlatformModelsStore } from "@/stores/platformModels";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthUser | null>(null);
  const teams = ref<AuthTeam[]>([]);
  const csrfToken = ref("");
  const personalDirectory = ref("");
  const initialized = ref<boolean | null>(null);
  const requiresSetupToken = ref(false);
  const loading = ref(false);
  const currentTeamId = ref("");
  const isAuthenticated = computed(() => Boolean(user.value) && !sessionInvalidated.value);
  const isRoot = computed(() => user.value?.isRoot === true);
  const currentTeam = computed(() => teams.value.find(item => item.id === currentTeamId.value) ?? null);
  let restoration: Promise<boolean> | undefined;
  let initialization: Promise<void> | undefined;

  function resetAccountData() {
    resetSettings();
    useWorkspaceStore().resetWorkspace();
    usePlatformModelsStore().resetModels();
    invalidateNodeModels("language");
    invalidateNodeModels("media");
  }

  function adoptAccount(account: AuthUser, token: string) {
    if (user.value?.id !== account.id) resetAccountData();
    user.value = account;
    csrfToken.value = token;
    setBrowserSession(account.id, token);
  }

  async function loadSetupStatus() {
    const status = await getSetupStatus();
    initialized.value = status.initialized;
    requiresSetupToken.value = status.requiresSetupToken;
    return status.initialized;
  }

  function restoreSession(expectedUserId = user.value?.id) {
    if (restoration) return restoration;
    restoration = (async () => {
      try {
        const result = await me();
        if (expectedUserId && result.user.id !== expectedUserId) { invalidateBrowserSession("changed"); return false; }
        adoptAccount(result.user, result.csrfToken);
        if (!result.serviceStates.mcp && settings.value.mcp && typeof settings.value.mcp === "object") settings.value.mcp = { ...settings.value.mcp, enabled: false };
        teams.value = result.teams;
        personalDirectory.value = result.personalDirectory;
        const saved = sessionStorage.getItem(`omnistudio_team_${result.user.id}`);
        if (!teams.value.some(team => team.id === currentTeamId.value)) currentTeamId.value = teams.value.find(team => team.id === saved)?.id ?? teams.value[0]?.id ?? "";
        return true;
      } catch {
        if (user.value) invalidateBrowserSession("expired");
        else clear();
        return false;
      } finally { restoration = undefined; }
    })();
    return restoration;
  }

  function initialize() {
    if (initialization) return initialization;
    initialization = (async () => {
      loading.value = true;
      try { if (await loadSetupStatus()) await restoreSession(); }
      finally { loading.value = false; initialization = undefined; }
    })();
    return initialization;
  }

  async function completeSetup(input: AccountInput & { setupToken?: string }) {
    const result = await setup(input);
    initialized.value = true;
    adoptAccount(result.user, result.csrfToken);
    await restoreSession(result.user.id);
  }

  async function signIn(input: { email: string; password: string }) {
    const result = await login(input);
    adoptAccount(result.user, result.csrfToken);
    await restoreSession(result.user.id);
  }

  async function signUp(input: AccountInput & { inviteToken?: string }) {
    const result = await register(input);
    adoptAccount(result.user, result.csrfToken);
    await restoreSession(result.user.id);
  }

  function clear() {
    user.value = null;
    teams.value = [];
    csrfToken.value = "";
    currentTeamId.value = "";
    personalDirectory.value = "";
    setBrowserSession("", "");
    resetAccountData();
  }

  async function signOut() {
    await logout();
    clear();
    // A document reload cancels pending file readers and component callbacks before another account can sign in.
    location.hash = "/auth/login";
    location.reload();
  }

  function selectTeam(id: string) {
    if (!teams.value.some(team => team.id === id)) return;
    currentTeamId.value = id;
    if (user.value) sessionStorage.setItem(`omnistudio_team_${user.value.id}`, id);
  }

  window.addEventListener("omnistudio-next:session-refresh", () => { if (user.value && !sessionInvalidated.value) void restoreSession(user.value.id); });
  return { user, teams, csrfToken, personalDirectory, initialized, requiresSetupToken, loading, currentTeamId, currentTeam, isAuthenticated, isRoot, initialize, loadSetupStatus, restoreSession, completeSetup, signIn, signUp, signOut, clear, selectTeam };
});

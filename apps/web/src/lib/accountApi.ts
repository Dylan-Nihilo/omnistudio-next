import { authClient, type ApiResponse, type AuthTeam } from "@/lib/authApi";
import { getSessionSnapshot } from "@/lib/sessionState";

export type Wallet = { id: string; userId: string; balance: number; frozen: number; available: number; total: number };
export type LedgerEntry = { id: string; kind: string; amount: number; balanceAfter: number; frozenAfter: number; reason?: string | null; createdAt: string };
export type TeamMember = { id: string; email: string; displayName: string; status: "active" | "disabled"; role: "owner" | "member" };
export type TeamAsset = { id: string; teamId: string; uploadedBy: string; name: string; mimeType: string; bytes: number; createdAt: string };
export type AdminUser = { id: string; email: string; displayName: string; status: "active" | "disabled"; isRoot: boolean; balance: number; frozen: number; available: number };
export type PlatformProvider = { id: string; providerId: string; enabled: boolean; config: { apiUrl: string; baseUrl?: string; protocol: "openai-completions" | "openai-responses" | "anthropic-messages" }; apiKeyConfigured: boolean };
export type PlatformModel = { id: string; providerId: string; modelId: string; label: string; mediaType: "text" | "image" | "video" | "audio"; apiModelId: string | null; enabled: number; sortOrder: number; capabilities: Record<string, unknown> | null };
export type ModelPrice = { providerId: string; modelId: string; mediaType: PlatformModel["mediaType"]; creditsPerUnit: number; unit?: string };
export type PlatformConfiguration = { providers: PlatformProvider[]; models: PlatformModel[]; prices: ModelPrice[]; priceVersion: number | null; mediaProviders: { id: string; label: string; models: { id: string; label?: string; type: "image" | "video" | "audio" }[] }[] };
export type AuditEntry = { id: string; actorUserId: string | null; action: string; metadata: unknown; createdAt: string };

async function accountRequest<T>(method: "GET" | "POST" | "PUT" | "DELETE", url: string, data?: unknown, params?: Record<string, unknown>, idempotencyKey?: string) {
  const result = await authClient.request<ApiResponse<T>>({ method, url, data, params, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined });
  if (![200, 201].includes(result.data.code)) throw new Error(result.data.message || "操作失败，请重试");
  return result.data.data;
}

export function getWallet(userId?: string) { return accountRequest<Wallet>("GET", "/api/billing/wallet", undefined, userId ? { userId } : undefined); }
export function getLedger(userId?: string) { return accountRequest<LedgerEntry[]>("GET", "/api/billing/ledger", undefined, userId ? { userId } : undefined); }
export function getTeams() { return accountRequest<AuthTeam[]>("GET", "/api/account/teams/list"); }
export function getMembers(teamId: string) { return accountRequest<TeamMember[]>("GET", "/api/account/teams/members", undefined, { teamId }); }
export function createTeam(name: string) { return accountRequest<AuthTeam>("POST", "/api/account/teams/create", { name }); }
export function inviteMember(teamId: string, email: string) { return accountRequest<{ token: string; expiresAt: string }>("POST", "/api/account/teams/invite", { teamId, email }); }
export function acceptInvite(token: string) { return accountRequest<{ teamId: string }>("POST", "/api/account/teams/acceptInvite", { token }); }
export function removeMember(teamId: string, userId: string) { return accountRequest("DELETE", "/api/account/teams/removeMember", { teamId, userId }); }
export function saveTeam(teamId: string, input: { name?: string; archive?: boolean; restore?: boolean }) { return accountRequest("PUT", "/api/account/teams/save", { teamId, ...input }); }
export function getTeamAssets(teamId: string) { return accountRequest<{ assets: TeamAsset[]; canManage: boolean }>("GET", "/api/account/teamAssets/list", undefined, { teamId }); }
export function copyAssetToTeam(input: { teamId: string; directory?: string; path: string; mimeType: string }) { return accountRequest("POST", "/api/account/teamAssets/copy", input); }
export function importTeamAsset(id: string, directory?: string) { return accountRequest<{ path: string; name: string; mimeType: string }>("POST", "/api/account/teamAssets/import", { id, ...(directory ? { directory } : {}) }); }
export function renameTeamAsset(id: string, name: string) { return accountRequest("PUT", "/api/account/teamAssets/save", { id, name }); }
export function removeTeamAsset(id: string) { return accountRequest("DELETE", "/api/account/teamAssets/remove", { id }); }
export function transferCredits(teamId: string, recipientUserId: string, amount: number, reason: string, key: string) { return accountRequest<{ id: string }>("POST", "/api/billing/transfer", { teamId, recipientUserId, amount, reason }, undefined, key); }
export function saveProfile(displayName: string) { return accountRequest("PUT", "/api/auth/profile", { displayName }); }
export function changePassword(currentPassword: string, password: string) { return accountRequest("PUT", "/api/auth/password", { currentPassword, password }); }
export function getAdminUsers() { return accountRequest<AdminUser[]>("GET", "/api/admin/users/list"); }
export function saveAdminUser(userId: string, input: { displayName?: string; status?: "active" | "disabled" }) { return accountRequest("PUT", "/api/admin/users/save", { userId, ...input }); }
export function resetAdminPassword(userId: string, password: string) { return accountRequest("PUT", "/api/admin/users/password", { userId, password }); }
export function adjustUserCredits(userId: string, amount: number, reason: string, key: string) { return accountRequest("POST", "/api/admin/adjustCredits", { userId, amount, reason }, undefined, key); }
export function getAdminProjects(userId: string) { return accountRequest<{ directory: string; name: string }[]>("GET", "/api/admin/users/projects", undefined, { userId }); }
export function getPlatformConfiguration() { return accountRequest<PlatformConfiguration>("GET", "/api/admin/platform/get"); }
export function initializePlatformCatalog() { return accountRequest("POST", "/api/admin/platform/initializeCatalog"); }
export function savePlatformProvider(input: { providerId: string; apiUrl: string; protocol: PlatformProvider["config"]["protocol"]; enabled: boolean; apiKey?: string; removeApiKey?: boolean }) { return accountRequest("PUT", "/api/admin/platform/saveProvider", input); }
export function savePlatformModel(input: Omit<PlatformModel, "id" | "enabled" | "capabilities" | "apiModelId"> & { id?: string; enabled: boolean; capabilities?: Record<string, unknown>; apiModelId?: string }) { return accountRequest("PUT", "/api/admin/platform/saveModel", input); }
export function publishPlatformPrices(items: ModelPrice[]) { return accountRequest<{ version: number }>("POST", "/api/admin/platform/publishPrices", { items: items.map(({ providerId, modelId, mediaType, creditsPerUnit }) => ({ providerId, modelId, mediaType, creditsPerUnit })) }); }
export function getPlatformAudit() { return accountRequest<AuditEntry[]>("GET", "/api/admin/audit"); }

export async function uploadTeamFile(teamId: string, file: File) {
  if (file.size > 100 * 1024 * 1024) throw new Error("单个文件不能超过 100 MB");
  const session = getSessionSnapshot();
  const body = await file.arrayBuffer();
  session.signal.throwIfAborted();
  const { data } = await authClient.put<ApiResponse<unknown>>("/api/account/teamAssets/upload", body, { params: { teamId, name: file.name, mimeType: file.type || "application/octet-stream" }, signal: session.signal, headers: { "Content-Type": "application/octet-stream", "x-account-id": session.userId, "x-csrf-token": session.csrfToken } });
  if (![200, 201].includes(data.code)) throw new Error(data.message || "上传失败，请重试");
  return data.data;
}

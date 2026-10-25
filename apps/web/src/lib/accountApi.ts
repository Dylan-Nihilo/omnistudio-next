import { authClient, type ApiResponse, type AuthTeam } from "@/lib/authApi";
import { getSessionSnapshot } from "@/lib/sessionState";

export type Wallet = { id: string; userId: string; balance: string; frozen: string; available: string; total: string };
export type LedgerEntry = { id: string; jobId?: string | null; kind: string; amount: string; balanceAfter: string; frozenAfter: string; reason?: string | null; metadata?: unknown; createdAt: string };
export type TeamMember = { id: string; email: string; displayName: string; status: "active" | "disabled"; role: "owner" | "member"; available: string };
export type TeamAsset = { id: string; teamId: string; uploadedBy: string; name: string; mimeType: string; bytes: number; createdAt: string };
export type UserPresence = { status: "online" | "away" | "offline"; currentPath?: string; lastSeenMs: number };
export type OnlineUserData = { userId: string; email: string; displayName: string; status: "online" | "away"; currentPath?: string; lastSeenMs: number; clientIp?: string };
export type OnlineUsersData = { totalOnline: number; totalAway: number; users: OnlineUserData[] };
export type AdminWorkspace = { id: string; name: string; status: "active" | "archived" };
export type AdminUser = { id: string; email: string; displayName: string; status: "active" | "disabled"; isRoot: boolean; balance: string; frozen: string; available: string; workspaces: AdminWorkspace[]; presence?: UserPresence };
export type PlatformProvider = { id: string; providerId: string; enabled: boolean; config: { apiUrl: string; baseUrl?: string; protocol: "openai-completions" | "openai-responses" | "anthropic-messages" }; apiKeyConfigured: boolean; maskedApiKey?: string | null };
export type PlatformModel = { id: string; providerId: string; modelId: string; label: string; mediaType: "text" | "image" | "video" | "audio"; apiModelId: string | null; enabled: number; sortOrder: number; capabilities: Record<string, unknown> | null };
export type TokenRates = { input: string; output: string };
export type TextPricingInput = { ratesPerMillion: TokenRates };
export type TextPricing = TextPricingInput;
export type VideoBillingKind = "textImageToVideo" | "videoToVideo";
export type VideoPricing =
  | { videoPricingMode: "unified"; resolutionTiers: Record<string, string> }
  | { videoPricingMode: "separate"; videoPricingTiers: Record<VideoBillingKind, Record<string, string>> };
export type PriceConstraints = Record<string, unknown> & { textPricing?: TextPricing; videoPricingMode?: VideoPricing["videoPricingMode"]; videoPricingTiers?: Record<VideoBillingKind, Record<string, string>>; resolutionTiers?: Record<string, string>; sizeTiers?: Record<string, string> };
export type ModelPrice = { providerId: string; modelId: string; mediaType: PlatformModel["mediaType"]; creditsPerUnit: string; unit?: string; constraints?: PriceConstraints };
export type PlatformPriceInput = Omit<ModelPrice, "unit"> & { textPricing?: TextPricingInput };
export type PlatformDefaultModels = {
  text?: { providerId: string; modelId: string } | null;
  image?: { providerId: string; modelId: string } | null;
  video?: { providerId: string; modelId: string } | null;
};
export type PlatformConfiguration = { providers: PlatformProvider[]; models: PlatformModel[]; prices: ModelPrice[]; priceVersion: number | null; mediaProviders: { id: string; label: string; models: { id: string; label?: string; type: "image" | "video" | "audio"; mode?: unknown }[] }[]; defaultModels?: PlatformDefaultModels };
export type AuditEntry = { id: string; actorUserId: string | null; action: string; metadata: unknown; createdAt: string };
export type UsageSummary = { id: string; day: string; userId: string; directoryHash: string; workspaceName: string; providerId: string; modelId: string; mediaType: "text" | "image" | "video" | "audio"; videoBillingKind: string; requestCount: number; successCount: number; failedCount: number; outputCount: number; units: string; capturedCredits: string; billableInputTokens: string; outputTokens: string; videoSeconds: string; pendingCount: number; usableCount: number; wasteCount: number; createdAt: string; updatedAt: string };
export type GenerationOutput = { id: string; jobId: string; userId: string; outputIndex: number; mediaType: "image" | "video"; status: "pending" | "usable" | "waste"; wasteReason?: string | null; outputSnapshot: unknown; reviewedBy?: string | null; reviewedAt?: string | null; createdAt: string; updatedAt: string };

async function accountRequest<T>(method: "GET" | "POST" | "PUT" | "DELETE", url: string, data?: unknown, params?: Record<string, unknown>, idempotencyKey?: string) {
  const result = await authClient.request<ApiResponse<T>>({ method, url, data, params, headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined });
  if (![200, 201].includes(result.data.code)) throw new Error(result.data.message || "操作失败，请重试");
  return result.data.data;
}

export function getWallet(userId?: string) { return accountRequest<Wallet>("GET", "/api/billing/wallet", undefined, userId ? { userId } : undefined); }
export function getLedger(userId?: string) { return accountRequest<LedgerEntry[]>("GET", "/api/billing/ledger", undefined, userId ? { userId } : undefined); }
export function getTeams() { return accountRequest<AuthTeam[]>("GET", "/api/account/teams/list"); }
export function getMembers(teamId: string) { return accountRequest<TeamMember[]>("GET", "/api/account/teams/members", undefined, { teamId }); }
export function getTeamMemberLedger(teamId: string, userId: string, limit = 100) { return accountRequest<LedgerEntry[]>("GET", "/api/account/teams/ledger", undefined, { teamId, userId, limit }); }
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
export function getAdminOnlineUsers() { return accountRequest<OnlineUsersData>("GET", "/api/admin/users/online"); }
export function saveAdminUser(userId: string, input: { displayName?: string; status?: "active" | "disabled" }) { return accountRequest("PUT", "/api/admin/users/save", { userId, ...input }); }
export function resetAdminPassword(userId: string, password: string) { return accountRequest("PUT", "/api/admin/users/password", { userId, password }); }
export function adjustUserCredits(userId: string, amount: number, reason: string, key: string) { return accountRequest("POST", "/api/admin/adjustCredits", { userId, amount, reason }, undefined, key); }
export function getAdminProjects(userId: string) { return accountRequest<{ directory: string; name: string }[]>("GET", "/api/admin/users/projects", undefined, { userId }); }
export function getPlatformConfiguration() { return accountRequest<PlatformConfiguration>("GET", "/api/admin/platform/get"); }
export function initializePlatformCatalog() { return accountRequest("POST", "/api/admin/platform/initializeCatalog"); }
export function savePlatformProvider(input: { providerId: string; apiUrl: string; protocol: PlatformProvider["config"]["protocol"]; enabled: boolean; apiKey?: string; removeApiKey?: boolean }) { return accountRequest("PUT", "/api/admin/platform/saveProvider", input); }
export function deletePlatformProvider(providerId: string) { return accountRequest("DELETE", "/api/admin/platform/deleteProvider", { providerId }); }
export function savePlatformModel(input: Omit<PlatformModel, "id" | "enabled" | "capabilities" | "apiModelId"> & { id?: string; enabled: boolean; capabilities?: Record<string, unknown>; apiModelId?: string }) { return accountRequest("PUT", "/api/admin/platform/saveModel", input); }
export function deletePlatformModel(id: string) { return accountRequest("DELETE", "/api/admin/platform/deleteModel", { id }); }
export function publishPlatformPrices(items: PlatformPriceInput[]) { return accountRequest<{ version: number }>("POST", "/api/admin/platform/publishPrices", { items: items.map(({ providerId, modelId, mediaType, creditsPerUnit, constraints, textPricing }) => ({ providerId, modelId, mediaType, creditsPerUnit, ...(constraints ? { constraints } : {}), ...(textPricing ? { textPricing } : {}) })) }); }
export function getPlatformAudit() { return accountRequest<AuditEntry[]>("GET", "/api/admin/audit"); }
export function savePlatformDefaultModels(defaultModels: PlatformDefaultModels) { return accountRequest("PUT", "/api/admin/platform/saveDefaultModels", { defaultModels }); }
export function getAdminUsageSummary(params?: { from?: string; to?: string; userId?: string; workspace?: string; modelId?: string; mediaType?: UsageSummary["mediaType"]; limit?: number }) { return accountRequest<UsageSummary[]>("GET", "/api/admin/usage/summary", undefined, params); }
export function getAdminGenerationOutputs(params?: { status?: GenerationOutput["status"]; userId?: string; limit?: number }) { return accountRequest<GenerationOutput[]>("GET", "/api/admin/usage/outputs", undefined, params); }
export function updateGenerationOutputStatus(id: string, status: "usable" | "waste", wasteReason?: string) { return accountRequest<GenerationOutput>("PUT", "/api/admin/usage/outputStatus", { id, status, ...(wasteReason ? { wasteReason } : {}) }); }
export function getAdminUsageExportUrl(params?: { from?: string; to?: string; userId?: string; workspace?: string; modelId?: string; mediaType?: UsageSummary["mediaType"] }) { const query = new URLSearchParams(Object.entries(params ?? {}).filter(([, value]) => value !== undefined) as [string, string][]).toString(); return `/api/admin/usage/export${query ? `?${query}` : ""}`; }

export async function uploadTeamFile(teamId: string, file: File) {
  if (file.size > 100 * 1024 * 1024) throw new Error("单个文件不能超过 100 MB");
  const session = getSessionSnapshot();
  const body = await file.arrayBuffer();
  session.signal.throwIfAborted();
  const { data } = await authClient.put<ApiResponse<unknown>>("/api/account/teamAssets/upload", body, { params: { teamId, name: file.name, mimeType: file.type || "application/octet-stream" }, signal: session.signal, headers: { "Content-Type": "application/octet-stream", "x-account-id": session.userId, "x-csrf-token": session.csrfToken } });
  if (![200, 201].includes(data.code)) throw new Error(data.message || "上传失败，请重试");
  return data.data;
}

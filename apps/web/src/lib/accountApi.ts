import { authClient } from "@/lib/authApi";

type ApiResponse<T> = { code: number; data: T; message: string };
export type Wallet = { id: string; workspaceId: string; balance: number; frozen: number; available: number; total: number };
export type LedgerEntry = { id: string; kind: string; amount: number; balanceAfter: number; frozenAfter: number; reason?: string | null; createdAt: string };
export type WorkspaceMember = { id: string; email: string; displayName: string; status: string; role: "owner" | "admin" | "member" };
export type AdminWorkspace = { id: string; name: string; slug: string; balance: number; frozen: number; available: number; memberCount: number };

function headers(workspaceId: string, csrfToken?: string) {
  return { "x-workspace-id": workspaceId, ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}) };
}

export async function getWallet(workspaceId: string) {
  const { data } = await authClient.get<ApiResponse<Wallet>>("/api/billing/wallet", { headers: headers(workspaceId) });
  if (data.code !== 200) throw new Error(data.message || "读取积分余额失败");
  return data.data;
}

export async function getLedger(workspaceId: string) {
  const { data } = await authClient.get<ApiResponse<LedgerEntry[]>>("/api/billing/ledger", { headers: headers(workspaceId) });
  if (data.code !== 200) throw new Error(data.message || "读取积分流水失败");
  return data.data;
}

export async function getMembers(workspaceId: string) {
  const { data } = await authClient.get<ApiResponse<WorkspaceMember[]>>("/api/auth/workspaces/members", { headers: headers(workspaceId) });
  if (data.code !== 200) throw new Error(data.message || "读取成员失败");
  return data.data;
}

export async function createWorkspace(name: string, csrfToken: string) {
  const { data } = await authClient.post<ApiResponse<{ id: string; name: string; slug: string; role: "owner" }>>("/api/auth/workspaces/create", { name }, { headers: { "X-CSRF-Token": csrfToken } });
  if (data.code !== 200 && data.code !== 201) throw new Error(data.message || "创建 Workspace 失败");
  return data.data;
}

export async function inviteMember(workspaceId: string, email: string, role: "admin" | "member", csrfToken: string) {
  const { data } = await authClient.post<ApiResponse<{ token: string; expiresAt: string }>>("/api/auth/workspaces/invite", { email, role }, { headers: headers(workspaceId, csrfToken) });
  if (data.code !== 200 && data.code !== 201) throw new Error(data.message || "创建邀请失败");
  return data.data;
}

export async function getAdminWorkspaces() {
  const { data } = await authClient.get<ApiResponse<AdminWorkspace[]>>("/api/admin/workspaces");
  if (data.code !== 200) throw Object.assign(new Error(data.message || "读取管理员工作区失败"), { status: data.code });
  return data.data;
}

export async function grantAdminCredits(workspaceId: string, amount: number, reason: string, csrfToken: string) {
  const { data } = await authClient.post<ApiResponse<unknown>>("/api/admin/grantCredits", { workspaceId, amount, reason }, {
    headers: { "X-CSRF-Token": csrfToken, "Idempotency-Key": `admin-grant:${workspaceId}:${crypto.randomUUID()}` },
  });
  if (data.code !== 200 && data.code !== 201) throw new Error(data.message || "发放积分失败");
  return data.data;
}

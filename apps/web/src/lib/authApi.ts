import axios from "axios";

export type AuthUser = { id: string; email: string; displayName: string; status?: string };
export type AuthWorkspace = { id: string; name: string; slug: string; role: "owner" | "admin" | "member" };
type ApiResponse<T> = { code: number; data: T | null; message: string };

const client = axios.create({ withCredentials: true, headers: { "Cache-Control": "no-cache" } });

export async function getSetupStatus() {
  const { data } = await client.get<ApiResponse<{ initialized: boolean }>>("/api/auth/setupStatus");
  if (data.code !== 200 || !data.data) throw new Error(data.message || "读取初始化状态失败");
  return data.data;
}

export async function setup(input: { email: string; displayName: string; password: string; workspaceName: string }) {
  const { data } = await client.post<ApiResponse<{ user: AuthUser; workspace: AuthWorkspace; csrfToken: string }>>("/api/auth/setup", input);
  if (data.code !== 200 && data.code !== 201 || !data.data) throw new Error(data.message || "初始化失败");
  return data.data;
}

export async function login(input: { email: string; password: string }) {
  const { data } = await client.post<ApiResponse<{ user: AuthUser; workspaces: AuthWorkspace[]; csrfToken: string }>>("/api/auth/login", input);
  if (data.code !== 200 || !data.data) throw new Error(data.message || "登录失败");
  return data.data;
}

export async function me() {
  const { data } = await client.get<ApiResponse<{ user: AuthUser; workspaces: AuthWorkspace[]; csrfToken: string }>>("/api/auth/me");
  if (data.code !== 200 || !data.data) throw new Error(data.message || "登录状态已失效");
  return data.data;
}

export async function logout(csrfToken: string) {
  const { data } = await client.post<ApiResponse<null>>("/api/auth/logout", null, { headers: { "X-CSRF-Token": csrfToken } });
  if (data.code !== 200) throw new Error(data.message || "退出失败");
}

export { client as authClient };

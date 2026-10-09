import axios from "axios";
import { getSessionSnapshot, invalidateBrowserSession, sessionInvalidated } from "@/lib/sessionState";

export type AuthUser = { id: string; email: string; displayName: string; status: "active" | "disabled"; isRoot: boolean };
export type AuthTeam = { id: string; name: string; ownerUserId: string; role: "owner" | "member" | "root"; status?: "active" | "archived" };
export type ApiResponse<T> = { code: number; data: T; message: string };
export type AccountInput = { email: string; displayName: string; password: string };

export const authClient = axios.create({ withCredentials: true, headers: { "Cache-Control": "no-cache" } });
const publicAuthentication = /^\/api\/auth\/(setupStatus|setup|login|register|invitation|me)$/;
for (const client of [axios, authClient]) {
  client.interceptors.request.use(config => {
    if (!config.url?.startsWith("/api/") || (config.baseURL && new URL(config.baseURL, location.origin).origin !== location.origin)) return config;
    if (publicAuthentication.test(config.url.split("?")[0]!)) return config;
    const session = getSessionSnapshot();
    if (sessionInvalidated.value) throw new Error("登录状态已更新，请先恢复当前账户");
    const expected = config.headers.get("x-account-id");
    if (expected && expected !== session.userId) throw new Error("账户已切换，操作已取消");
    if (session.userId) config.headers.set("x-account-id", session.userId);
    if (session.csrfToken) config.headers.set("x-csrf-token", session.csrfToken);
    config.signal = config.signal ? AbortSignal.any([config.signal as AbortSignal, session.signal]) : session.signal;
    return config;
  });
  client.interceptors.response.use(response => response, error => {
    const session = getSessionSnapshot();
    const expected = error.config?.headers?.["x-account-id"];
    if (expected === session.userId && !error.config?.signal?.aborted) {
      if (error.response?.status === 409 && error.response.data?.data?.reason === "accountChanged") invalidateBrowserSession("changed");
      else if (error.response?.status === 401) invalidateBrowserSession("expired");
    }
    return Promise.reject(error);
  });
}

export async function getSetupStatus() {
  const { data } = await authClient.get<ApiResponse<{ initialized: boolean; requiresSetupToken: boolean }>>("/api/auth/setupStatus");
  return data.data;
}

export async function setup(input: AccountInput & { setupToken?: string }) {
  const { data } = await authClient.post<ApiResponse<{ user: AuthUser; csrfToken: string }>>("/api/auth/setup", input);
  return data.data;
}

export async function register(input: AccountInput & { inviteToken?: string }) {
  const { data } = await authClient.post<ApiResponse<{ user: AuthUser; csrfToken: string }>>("/api/auth/register", input);
  return data.data;
}

export async function login(input: { email: string; password: string }) {
  const { data } = await authClient.post<ApiResponse<{ user: AuthUser; csrfToken: string }>>("/api/auth/login", input);
  return data.data;
}

export async function me() {
  const { data } = await authClient.get<ApiResponse<{ user: AuthUser; teams: AuthTeam[]; csrfToken: string; personalDirectory: string; serviceStates: { mcp: boolean; a2a: boolean } }>>("/api/auth/me");
  return data.data;
}

export async function logout() {
  await authClient.post("/api/auth/logout");
}

export async function getInvitation(token: string) {
  const { data } = await authClient.get<ApiResponse<{ teamId: string; teamName: string; email: string; expiresAt: string }>>("/api/auth/invitation", { params: { token } });
  return data.data;
}

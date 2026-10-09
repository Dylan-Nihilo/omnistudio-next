import { AsyncLocalStorage } from "node:async_hooks";

export type AccountContext = { userId: string; isRoot: boolean; signal?: AbortSignal; generationKey?: string; generationCounter?: number };

export const accountContext = new AsyncLocalStorage<AccountContext>();
const accountControllers = new Map<string, Map<string, AbortController>>();

export function getAccountSignal(userId: string, sessionId: string) {
  let sessions = accountControllers.get(userId);
  if (!sessions) { sessions = new Map(); accountControllers.set(userId, sessions); }
  let controller = sessions.get(sessionId);
  if (!controller) { controller = new AbortController(); sessions.set(sessionId, controller); }
  return controller.signal;
}

export function invalidateAccount(userId: string, sessionId?: string) {
  const sessions = accountControllers.get(userId);
  if (!sessions) return;
  for (const [id, controller] of sessions) {
    if (sessionId && sessionId !== id) continue;
    controller.abort(new Error("登录状态已更新，请重新登录"));
    sessions.delete(id);
  }
  if (!sessions.size) accountControllers.delete(userId);
}

export function requireAccount() {
  const account = accountContext.getStore();
  if (!account) throw Object.assign(new Error("请先登录"), { status: 401 });
  return account;
}

export function requireRootAccount() {
  const account = requireActiveAccount();
  if (!account.isRoot) throw Object.assign(new Error("需要 root 权限"), { status: 403 });
  return account;
}

export function requireActiveAccount() {
  const account = requireAccount();
  if (account.signal?.aborted) throw Object.assign(new Error("登录状态已更新，请重新登录"), { status: 401 });
  return account;
}

export function nextGenerationKey(key?: string) {
  const account = requireAccount();
  if (key) return key;
  account.generationCounter = (account.generationCounter ?? 0) + 1;
  return `${account.generationKey ?? crypto.randomUUID()}:${account.generationCounter}`;
}

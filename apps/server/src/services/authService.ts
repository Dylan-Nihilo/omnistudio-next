import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { rm } from "node:fs/promises";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import type { Request, Response } from "express";
import { getDatabase, getPool, hashSecret } from "@/db/database";
import { auditEvents, platformRoles, serviceCredentials, sessions, teamInvitations, teamMembers, teams, users, wallets } from "@/db/schema";
import { initializePersonalSpace, synchronizeServiceCredentials } from "@/services/accountService";
import { invalidateAccount } from "@/utils/accountContext";
import { forgetAccountConfig, getAccountDirectory, platformConfig } from "@/utils/conf";

export const sessionCookieName = "omnistudio_session";
export const csrfCookieName = "omnistudio_csrf";
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const authenticationAttempts = new Map<string, { count: number; expiresAt: number }>();

export function limitAuthentication(request: Request, kind: "login" | "register" | "setup") {
  const now = Date.now();
  for (const [key, value] of authenticationAttempts) if (value.expiresAt <= now) authenticationAttempts.delete(key);
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  const key = `${kind}:${request.socket.remoteAddress}:${kind === "login" ? email : ""}`;
  const value = authenticationAttempts.get(key) ?? { count: 0, expiresAt: now + 15 * 60 * 1000 };
  if (value.count >= (kind === "login" ? 30 : 10) || authenticationAttempts.size > 10000) throw Object.assign(new Error("操作过于频繁，请稍后重试"), { status: 429 });
  value.count++;
  authenticationAttempts.set(key, value);
}

export function rootSetupRequiresToken(request: Request) {
  const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "");
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(request.hostname);
  return !(local && localHost && (process.env.NODE_ENV === "dev" || request.app.locals.desktop));
}

function rootSetupToken() {
  const file = resolve(dirname(platformConfig.path), "rootSetupToken");
  try { writeFileSync(file, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("管理员初始化凭据文件权限无效");
  return readFileSync(file, "utf8").trim();
}

export function assertRootSetupAuthorization(request: Request, supplied?: string) {
  if (!rootSetupRequiresToken(request)) return;
  const expected = Buffer.from(rootSetupToken());
  const actual = Buffer.from(supplied ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Object.assign(new Error("请输入有效的管理员初始化凭据"), { status: 403 });
}

export function prepareRootSetupToken(request: Request) {
  if (rootSetupRequiresToken(request)) rootSetupToken();
}

export type AuthUser = Pick<typeof users.$inferSelect, "id" | "email" | "displayName" | "status"> & { isRoot: boolean };
export type AuthSession = { id: string; user: AuthUser; csrfTokenHash: string; csrfToken: string; serviceKind?: "mcp" | "a2a" };

function token() {
  return randomBytes(32).toString("base64url");
}

function cookieHeader(name: string, value: string, maxAge: number, httpOnly: boolean) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Strict${httpOnly ? "; HttpOnly" : ""}${secure}`;
}

export function writeSessionCookies(response: Response, sessionToken: string, csrfToken: string) {
  response.append("Set-Cookie", cookieHeader(sessionCookieName, sessionToken, sessionTtlMs / 1000, true));
  response.append("Set-Cookie", cookieHeader(csrfCookieName, csrfToken, sessionTtlMs / 1000, false));
}

export function clearSessionCookies(response: Response) {
  response.append("Set-Cookie", cookieHeader(sessionCookieName, "", 0, true));
  response.append("Set-Cookie", cookieHeader(csrfCookieName, "", 0, false));
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.cookie?.split(";").map(item => item.trim()) ?? [];
  const value = cookies.find(item => item.startsWith(`${name}=`))?.slice(name.length + 1);
  try { return value ? decodeURIComponent(value) : ""; }
  catch { return ""; }
}

export async function userView(user: typeof users.$inferSelect): Promise<AuthUser> {
  return { id: user.id, email: user.email, displayName: user.displayName, status: user.status, isRoot: await isPlatformAdmin(user.id) };
}

export async function hashPassword(password: string) {
  return hash(password, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(password: string, passwordHash: string) {
  return verify(passwordHash, password);
}

export async function createSession(userId: string) {
  const sessionToken = token();
  const csrfToken = token();
  const now = new Date();
  const session = { id: randomUUID(), userId, tokenHash: hashSecret(sessionToken), csrfTokenHash: hashSecret(csrfToken), expiresAt: new Date(now.getTime() + sessionTtlMs), createdAt: now, updatedAt: now };
  await getDatabase().insert(sessions).values(session);
  return { ...session, sessionToken, csrfToken };
}

export async function getSession(request: Request): Promise<AuthSession | null> {
  const value = readCookie(request, sessionCookieName);
  if (!value) return null;
  const [result] = await getDatabase().select({ session: sessions, user: users }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSecret(value)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!result || result.user.status !== "active") return null;
  return {
    id: result.session.id,
    user: await userView(result.user),
    csrfTokenHash: result.session.csrfTokenHash,
    // 仅用于把当前浏览器已有的令牌回传给前端；校验始终使用数据库哈希。
    csrfToken: readCookie(request, csrfCookieName),
  };
}

export async function revokeSession(request: Request) {
  const value = readCookie(request, sessionCookieName);
  if (!value) return;
  await getDatabase().update(sessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(sessions.tokenHash, hashSecret(value)));
  if (request.authContext) invalidateAccount(request.authContext.user.id, request.authContext.id);
}

export async function csrfMatches(request: Request, session: AuthSession) {
  const supplied = request.header("x-csrf-token") ?? request.body?.csrfToken ?? "";
  return Boolean(supplied && session.csrfTokenHash && hashSecret(supplied) === session.csrfTokenHash);
}

export async function isPlatformAdmin(userId: string) {
  const [role] = await getDatabase().select({ id: platformRoles.id }).from(platformRoles).where(and(eq(platformRoles.userId, userId), eq(platformRoles.role, "root"))).limit(1);
  return Boolean(role);
}

export async function getServiceSession(request: Request, kind: "mcp" | "a2a"): Promise<AuthSession | null> {
  const header = request.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const [result] = await getDatabase().select({ credential: serviceCredentials, user: users }).from(serviceCredentials)
    .innerJoin(users, eq(users.id, serviceCredentials.userId))
    .where(and(eq(serviceCredentials.tokenHash, hashSecret(header.slice(7))), eq(serviceCredentials.kind, kind), eq(serviceCredentials.enabled, 1), eq(users.status, "active"))).limit(1);
  return result ? { id: result.credential.id, user: await userView(result.user), csrfTokenHash: "", csrfToken: "", serviceKind: kind } : null;
}

export async function createAccount(input: { email: string; displayName: string; password: string; inviteToken?: string }, root = false) {
  const lock = root ? await getPool().getConnection() : undefined;
  let createdUserId: string | undefined;
  let committed = false;
  try {
    if (lock) {
      const [rows] = await lock.query("SELECT GET_LOCK('omnistudio_root_setup', 15) AS acquired");
      if (!Array.isArray(rows) || (rows[0] as { acquired?: number })?.acquired !== 1) throw Object.assign(new Error("系统正在初始化，请稍后重试"), { status: 409 });
    }
    const database = getDatabase();
    const [administrator] = await database.select({ id: platformRoles.id }).from(platformRoles).where(eq(platformRoles.role, "root")).limit(1);
    if (root && administrator) throw Object.assign(new Error("系统已完成初始化，请直接登录"), { status: 409 });
    if (!root && !administrator) throw Object.assign(new Error("请先完成平台初始化"), { status: 409 });
    const now = new Date();
    const userId = randomUUID();
    createdUserId = userId;
    const email = input.email.trim().toLowerCase();
    const passwordHash = await hashPassword(input.password);
    await database.transaction(async tx => {
      await tx.insert(users).values({ id: userId, email, displayName: input.displayName.trim(), passwordHash, status: "active", createdAt: now, updatedAt: now });
      await tx.insert(wallets).values({ id: randomUUID(), userId, balance: 0, frozen: 0, createdAt: now, updatedAt: now });
      if (root) await tx.insert(platformRoles).values({ id: randomUUID(), userId, role: "root", createdAt: now, updatedAt: now });
      if (input.inviteToken) {
        const [invitation] = await tx.select().from(teamInvitations).where(and(eq(teamInvitations.tokenHash, hashSecret(input.inviteToken)), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt))).limit(1).for("update");
        const [team] = invitation ? await tx.select().from(teams).where(and(eq(teams.id, invitation.teamId), eq(teams.status, "active"))).limit(1).for("update") : [];
        if (!invitation || !team || invitation.email !== email || invitation.expiresAt <= now) throw Object.assign(new Error("邀请已失效或邮箱不匹配"), { status: 400 });
        await tx.insert(teamMembers).values({ id: randomUUID(), teamId: team.id, userId, role: "member", createdAt: now, updatedAt: now });
        await tx.update(teamInvitations).set({ acceptedAt: now, updatedAt: now }).where(eq(teamInvitations.id, invitation.id));
      }
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: userId, action: root ? "account.initializeRoot" : "account.register", metadata: { userId }, createdAt: now, updatedAt: now });
      await initializePersonalSpace(userId, root, tx);
    });
    committed = true;
    if (root) {
      try { await synchronizeServiceCredentials(userId); }
      catch (error) { console.error("初始服务凭据未启用，请在设置中重新配置", { userId, name: error instanceof Error ? error.name : "Error" }); }
    }
    const [user] = await database.select().from(users).where(eq(users.id, userId)).limit(1);
    const session = await createSession(userId);
    return { user: await userView(user!), session };
  } catch (error) {
    if (createdUserId && !committed) {
      const existing = await getDatabase().select({ id: users.id }).from(users).where(eq(users.id, createdUserId)).limit(1).catch(() => undefined);
      if (existing && existing.length === 0) {
        await rm(getAccountDirectory(createdUserId), { recursive: true, force: true }).catch(cleanupError => { console.error("清理未创建账户的空间失败", { code: (cleanupError as NodeJS.ErrnoException).code }); });
        forgetAccountConfig(createdUserId);
      }
    }
    if ((error as { code?: string }).code === "ER_DUP_ENTRY" || (error as { cause?: { code?: string } }).cause?.code === "ER_DUP_ENTRY") throw Object.assign(new Error("这个邮箱已注册，请直接登录"), { status: 409 });
    throw error;
  } finally {
    if (lock) { await lock.query("SELECT RELEASE_LOCK('omnistudio_root_setup')"); lock.release(); }
  }
}

export async function revokeUserSessions(userId: string) {
  await getDatabase().update(sessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(sessions.userId, userId));
  invalidateAccount(userId);
}

export { randomUUID };

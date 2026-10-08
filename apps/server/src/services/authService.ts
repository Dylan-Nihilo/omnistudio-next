import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { hash, verify } from "@node-rs/argon2";
import type { Request, Response } from "express";
import { getDatabase, hashSecret } from "@/db/database";
import { platformRoles, sessions, users } from "@/db/schema";

export const sessionCookieName = "omnistudio_session";
export const csrfCookieName = "omnistudio_csrf";
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;

export type AuthUser = Pick<typeof users.$inferSelect, "id" | "email" | "displayName" | "status">;
export type AuthSession = { id: string; user: AuthUser; csrfTokenHash: string; csrfToken: string };

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
  return value ? decodeURIComponent(value) : "";
}

function userView(user: typeof users.$inferSelect): AuthUser {
  return { id: user.id, email: user.email, displayName: user.displayName, status: user.status };
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
    user: userView(result.user),
    csrfTokenHash: result.session.csrfTokenHash,
    // 仅用于把当前浏览器已有的令牌回传给前端；校验始终使用数据库哈希。
    csrfToken: readCookie(request, csrfCookieName),
  };
}

export async function revokeSession(request: Request) {
  const value = readCookie(request, sessionCookieName);
  if (!value) return;
  await getDatabase().update(sessions).set({ revokedAt: new Date(), updatedAt: new Date() }).where(eq(sessions.tokenHash, hashSecret(value)));
}

export async function csrfMatches(request: Request, session: AuthSession) {
  const supplied = request.header("x-csrf-token") ?? request.body?.csrfToken ?? "";
  return Boolean(supplied && session.csrfTokenHash && hashSecret(supplied) === session.csrfTokenHash);
}

export async function isPlatformAdmin(userId: string) {
  const [role] = await getDatabase().select({ id: platformRoles.id }).from(platformRoles).where(eq(platformRoles.userId, userId)).limit(1);
  return Boolean(role);
}

export { randomUUID };

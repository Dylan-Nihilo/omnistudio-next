import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/database";
import { auditEvents, platformRoles, serviceCredentials, sessions, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/services/authService";
import { invalidateAccount, requireAccount, requireRootAccount } from "@/utils/accountContext";

export async function updateOwnProfile(displayName: string) {
  const account = requireAccount();
  await getDatabase().update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, account.userId));
}

export async function changeOwnPassword(currentPassword: string, password: string) {
  const account = requireAccount();
  const [user] = await getDatabase().select().from(users).where(eq(users.id, account.userId)).limit(1);
  if (!user || !await verifyPassword(currentPassword, user.passwordHash)) throw Object.assign(new Error("当前密码不正确"), { status: 400 });
  await savePassword(account.userId, password, account.userId);
}

async function savePassword(userId: string, password: string, actorUserId: string) {
  const passwordHash = await hashPassword(password);
  const now = new Date();
  await getDatabase().transaction(async tx => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!user) throw Object.assign(new Error("账户不存在"), { status: 404 });
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, userId));
    await tx.update(sessions).set({ revokedAt: now, updatedAt: now }).where(eq(sessions.userId, userId));
    await tx.update(serviceCredentials).set({ enabled: 0, updatedAt: now }).where(eq(serviceCredentials.userId, userId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId, action: actorUserId === userId ? "account.password.change" : "account.password.reset", metadata: { userId }, createdAt: now, updatedAt: now });
  });
  invalidateAccount(userId);
}

export async function resetUserPassword(userId: string, password: string) {
  await savePassword(userId, password, requireRootAccount().userId);
}

export async function updateUser(userId: string, input: { displayName?: string; status?: "active" | "disabled" }) {
  const account = requireRootAccount();
  const now = new Date();
  await getDatabase().transaction(async tx => {
    const [user] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!user) throw Object.assign(new Error("账户不存在"), { status: 404 });
    const [root] = await tx.select({ id: platformRoles.id }).from(platformRoles).where(and(eq(platformRoles.userId, userId), eq(platformRoles.role, "root"))).limit(1);
    if (root && input.status === "disabled") throw Object.assign(new Error("不能停用 root 管理员"), { status: 409 });
    await tx.update(users).set({ ...input, updatedAt: now }).where(eq(users.id, userId));
    if (input.status === "disabled") {
      await tx.update(sessions).set({ revokedAt: now, updatedAt: now }).where(eq(sessions.userId, userId));
      await tx.update(serviceCredentials).set({ enabled: 0, updatedAt: now }).where(eq(serviceCredentials.userId, userId));
    }
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: "account.admin.update", metadata: { userId, ...input }, createdAt: now, updatedAt: now });
  });
  if (input.status === "disabled") invalidateAccount(userId);
}

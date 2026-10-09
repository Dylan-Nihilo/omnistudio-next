import { randomBytes, randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDatabase, hashSecret } from "@/db/database";
import { auditEvents, teamInvitations, teamMembers, teams, users } from "@/db/schema";
import { requireAccount } from "@/utils/accountContext";

export async function listUserTeams() {
  const account = requireAccount();
  const rows = await getDatabase().select({ id: teams.id, name: teams.name, ownerUserId: teams.ownerUserId, role: teamMembers.role, status: teams.status }).from(teams)
    .leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, account.userId)))
    .where(account.isRoot ? undefined : and(eq(teams.status, "active"), eq(teamMembers.userId, account.userId)))
    .orderBy(asc(teams.name));
  return rows.map(team => ({ ...team, role: team.ownerUserId === account.userId ? "owner" as const : team.role ?? "root" as const }));
}

export async function requireTeamAccess(teamId: string, ownerOnly = false) {
  const account = requireAccount();
  const [team] = await getDatabase().select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team || (team.status !== "active" && !account.isRoot)) throw Object.assign(new Error("团队不存在或已解散"), { status: 404 });
  const [member] = await getDatabase().select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, account.userId))).limit(1);
  if (!account.isRoot && (!member || (ownerOnly && team.ownerUserId !== account.userId))) throw Object.assign(new Error(ownerOnly ? "只有团队 owner 可以执行这个操作" : "无权访问这个团队"), { status: 403 });
  return { team, member, canManage: account.isRoot || team.ownerUserId === account.userId };
}

export async function createTeam(name: string) {
  const account = requireAccount();
  const id = randomUUID();
  const now = new Date();
  await getDatabase().transaction(async tx => {
    await tx.insert(teams).values({ id, name, ownerUserId: account.userId, status: "active", createdAt: now, updatedAt: now });
    await tx.insert(teamMembers).values({ id: randomUUID(), teamId: id, userId: account.userId, role: "owner", createdAt: now, updatedAt: now });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: id, action: "team.create", metadata: { name }, createdAt: now, updatedAt: now });
  });
  return { id, name, ownerUserId: account.userId, role: "owner" as const };
}

export async function listTeamMembers(teamId: string) {
  await requireTeamAccess(teamId);
  return getDatabase().select({ id: users.id, email: users.email, displayName: users.displayName, status: users.status, role: teamMembers.role })
    .from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).where(eq(teamMembers.teamId, teamId)).orderBy(asc(users.displayName));
}

export async function inviteTeamMember(teamId: string, email: string) {
  const account = requireAccount();
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  await getDatabase().transaction(async tx => {
    const [team] = await tx.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.status, "active"))).limit(1).for("update");
    if (!team || (!account.isRoot && team.ownerUserId !== account.userId)) throw Object.assign(new Error("需要团队 owner 权限"), { status: 403 });
    const [existing] = await tx.select({ id: users.id }).from(users).innerJoin(teamMembers, eq(teamMembers.userId, users.id))
      .where(and(eq(teamMembers.teamId, teamId), eq(users.email, email.toLowerCase()))).limit(1);
    if (existing) throw Object.assign(new Error("这个用户已经是团队成员"), { status: 409 });
    await tx.update(teamInvitations).set({ revokedAt: now, updatedAt: now }).where(and(eq(teamInvitations.teamId, teamId), eq(teamInvitations.email, email.toLowerCase()), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt)));
    await tx.insert(teamInvitations).values({ id: randomUUID(), teamId, email: email.toLowerCase(), tokenHash: hashSecret(token), expiresAt, createdBy: account.userId, createdAt: now, updatedAt: now });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: teamId, action: "team.invite", metadata: { email: email.toLowerCase() }, createdAt: now, updatedAt: now });
  });
  return { token, expiresAt };
}

export async function getTeamInvitation(token: string) {
  const [result] = await getDatabase().select({ invitation: teamInvitations, team: teams }).from(teamInvitations)
    .innerJoin(teams, eq(teams.id, teamInvitations.teamId)).where(and(eq(teamInvitations.tokenHash, hashSecret(token)), isNull(teamInvitations.acceptedAt), isNull(teamInvitations.revokedAt), eq(teams.status, "active"))).limit(1);
  if (!result || result.invitation.expiresAt <= new Date()) throw Object.assign(new Error("邀请不存在或已过期"), { status: 404 });
  return result;
}

export async function acceptTeamInvitation(token: string) {
  const account = requireAccount();
  const current = await getTeamInvitation(token);
  const now = new Date();
  await getDatabase().transaction(async tx => {
    const [team] = await tx.select().from(teams).where(and(eq(teams.id, current.team.id), eq(teams.status, "active"))).limit(1).for("update");
    const [invitation] = await tx.select().from(teamInvitations).where(eq(teamInvitations.id, current.invitation.id)).limit(1).for("update");
    const [user] = await tx.select().from(users).where(eq(users.id, account.userId)).limit(1);
    if (!team || !invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= now || invitation.email !== user?.email) throw Object.assign(new Error("邀请已失效或邮箱不匹配"), { status: 400 });
    await tx.insert(teamMembers).values({ id: randomUUID(), teamId: team.id, userId: account.userId, role: "member", createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
    await tx.update(teamInvitations).set({ acceptedAt: now, updatedAt: now }).where(eq(teamInvitations.id, invitation.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: team.id, action: "team.acceptInvitation", createdAt: now, updatedAt: now });
  });
  return { teamId: current.team.id };
}

export async function removeTeamMember(teamId: string, userId: string) {
  const account = requireAccount();
  await getDatabase().transaction(async tx => {
    const [team] = await tx.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.status, "active"))).limit(1).for("update");
    if (!team) throw Object.assign(new Error("团队不存在"), { status: 404 });
    const [member] = await tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, account.userId))).limit(1);
    if (!account.isRoot && (!member || (userId !== account.userId && team.ownerUserId !== account.userId))) throw Object.assign(new Error("无权移除这个成员"), { status: 403 });
    if (userId === team.ownerUserId) throw Object.assign(new Error("owner 不能退出或被移除，可以解散团队"), { status: 409 });
    await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    const [removedUser] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (removedUser) await tx.update(teamInvitations).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(teamInvitations.teamId, teamId), eq(teamInvitations.email, removedUser.email), isNull(teamInvitations.acceptedAt)));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: teamId, action: userId === account.userId ? "team.leave" : "team.removeMember", metadata: { userId }, createdAt: new Date(), updatedAt: new Date() });
  });
}

export async function updateTeam(teamId: string, input: { name?: string; archive?: boolean; restore?: boolean }) {
  const account = requireAccount();
  await getDatabase().transaction(async tx => {
    const [team] = await tx.select().from(teams).where(eq(teams.id, teamId)).limit(1).for("update");
    if (!team || (!account.isRoot && (team.ownerUserId !== account.userId || team.status !== "active" || input.restore))) throw Object.assign(new Error("需要团队 owner 或 root 权限"), { status: 403 });
    const now = new Date();
    await tx.update(teams).set({ ...(input.name ? { name: input.name } : {}), ...(input.archive ? { status: "archived" as const } : input.restore ? { status: "active" as const } : {}), updatedAt: now }).where(eq(teams.id, teamId));
    if (input.archive) await tx.update(teamInvitations).set({ revokedAt: now, updatedAt: now }).where(and(eq(teamInvitations.teamId, teamId), isNull(teamInvitations.acceptedAt)));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: teamId, action: input.archive ? "team.archive" : input.restore ? "team.restore" : "team.rename", metadata: input, createdAt: now, updatedAt: now });
  });
}

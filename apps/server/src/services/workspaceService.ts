import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/database";
import { wallets, workspaceMemberships, workspaces } from "@/db/schema";

export async function listUserWorkspaces(userId: string) {
  return getDatabase().select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug, role: workspaceMemberships.role })
    .from(workspaceMemberships).innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(eq(workspaceMemberships.userId, userId));
}

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  const [membership] = await getDatabase().select({ workspace: workspaces, role: workspaceMemberships.role })
    .from(workspaceMemberships).innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(and(eq(workspaceMemberships.userId, userId), eq(workspaceMemberships.workspaceId, workspaceId))).limit(1);
  return membership ?? null;
}

export async function ensureWallet(workspaceId: string) {
  const [wallet] = await getDatabase().select().from(wallets).where(eq(wallets.workspaceId, workspaceId)).limit(1);
  return wallet ?? null;
}

export async function requireWorkspaceMembership(userId: string, workspaceId: string) {
  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) throw Object.assign(new Error("无权访问该 Workspace"), { status: 403 });
  return membership;
}

export function workspaceIdFromRequest(request: { header(name: string): string | undefined }) {
  const workspaceId = request.header("x-workspace-id")?.trim();
  if (!workspaceId) throw Object.assign(new Error("缺少 Workspace"), { status: 422 });
  return workspaceId;
}

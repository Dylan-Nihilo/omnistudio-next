import { Router } from "express";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { getDatabase, hashSecret } from "@/db/database";
import { invitations, workspaceMemberships } from "@/db/schema";
import { error, success } from "@/lib/responseFormat";

const inputSchema = z.object({ token: z.string().min(20).max(200) });

export default Router().post("/", requireAuth, requireCsrf, async (request, response) => {
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("邀请令牌无效", null, 422));
  const now = new Date();
  const database = getDatabase();
  const result = await database.transaction(async tx => {
    const [invitation] = await tx.select().from(invitations).where(and(eq(invitations.tokenHash, hashSecret(input.data.token)), isNull(invitations.acceptedAt))).limit(1);
    if (!invitation || invitation.expiresAt <= now || invitation.email !== request.authContext!.user.email.toLowerCase()) return null;
    await tx.insert(workspaceMemberships).values({ id: randomUUID(), workspaceId: invitation.workspaceId, userId: request.authContext!.user.id, role: invitation.role, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
    await tx.update(invitations).set({ acceptedAt: now, updatedAt: now }).where(eq(invitations.id, invitation.id));
    return invitation.workspaceId;
  });
  if (!result) return response.status(400).json(error("邀请不存在、已过期或邮箱不匹配", null, 400));
  response.json(success({ workspaceId: result }, "已加入 Workspace"));
});

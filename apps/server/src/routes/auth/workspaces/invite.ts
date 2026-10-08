import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { getDatabase, hashSecret } from "@/db/database";
import { invitations } from "@/db/schema";
import { error, success } from "@/lib/responseFormat";
import { getWorkspaceMembership, workspaceIdFromRequest } from "@/services/workspaceService";

const inputSchema = z.object({ email: z.email().max(320), role: z.enum(["admin", "member"]).default("member") });

export default Router().post("/", requireAuth, requireCsrf, async (request, response) => {
  const workspaceId = workspaceIdFromRequest(request);
  const membership = await getWorkspaceMembership(request.authContext!.user.id, workspaceId);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) return response.status(403).json(error("需要 Workspace 管理员权限", null, 403));
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  const rawToken = randomBytes(32).toString("base64url");
  const now = new Date();
  await getDatabase().insert(invitations).values({ id: randomUUID(), workspaceId, email: input.data.email.toLowerCase(), role: input.data.role, tokenHash: hashSecret(rawToken), expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), createdBy: request.authContext!.user.id, createdAt: now, updatedAt: now });
  response.status(201).json(success({ token: rawToken, expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) }, "邀请已创建"));
});

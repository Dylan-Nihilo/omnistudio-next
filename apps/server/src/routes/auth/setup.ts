import { Router } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword, writeSessionCookies } from "@/services/authService";
import { getDatabase, hashSecret } from "@/db/database";
import { platformRoles, users, wallets, workspaceMemberships, workspaces, sessions } from "@/db/schema";
import { error, success } from "@/lib/responseFormat";
import { z } from "zod";

const inputSchema = z.object({
  email: z.email().max(320), displayName: z.string().trim().min(1).max(120), password: z.string().min(12).max(200), workspaceName: z.string().trim().min(1).max(160).default("我的工作区"),
});

export default Router().post("/", async (request, response) => {
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  const database = getDatabase();
  const [existing] = await database.select({ id: users.id }).from(users).limit(1);
  if (existing) return response.status(409).json(error("系统已完成初始化，请直接登录", null, 409));
  const now = new Date();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const walletId = randomUUID();
  const sessionId = randomUUID();
  const sessionToken = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(32).toString("base64url");
  const passwordHash = await hashPassword(input.data.password);
  await database.transaction(async tx => {
    await tx.insert(users).values({ id: userId, email: input.data.email.toLowerCase(), displayName: input.data.displayName, passwordHash, status: "active", createdAt: now, updatedAt: now });
    await tx.insert(workspaces).values({ id: workspaceId, name: input.data.workspaceName, slug: `${input.data.workspaceName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace"}-${userId.slice(0, 8)}`, createdBy: userId, createdAt: now, updatedAt: now });
    await tx.insert(workspaceMemberships).values({ id: randomUUID(), workspaceId, userId, role: "owner", createdAt: now, updatedAt: now });
    await tx.insert(wallets).values({ id: walletId, workspaceId, balance: 0, frozen: 0, createdAt: now, updatedAt: now });
    await tx.insert(platformRoles).values({ id: randomUUID(), userId, role: "root", createdAt: now, updatedAt: now });
    await tx.insert(sessions).values({ id: sessionId, userId, tokenHash: hashSecret(sessionToken), csrfTokenHash: hashSecret(csrfToken), expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), createdAt: now, updatedAt: now });
  });
  writeSessionCookies(response, sessionToken, csrfToken);
  response.status(201).json(success({ user: { id: userId, email: input.data.email.toLowerCase(), displayName: input.data.displayName }, workspace: { id: workspaceId, name: input.data.workspaceName }, csrfToken }, "初始化完成"));
});

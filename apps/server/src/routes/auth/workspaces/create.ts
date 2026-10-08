import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { getDatabase } from "@/db/database";
import { wallets, workspaceMemberships, workspaces } from "@/db/schema";
import { error, success } from "@/lib/responseFormat";

const inputSchema = z.object({ name: z.string().trim().min(1).max(160) });

export default Router().post("/", requireAuth, requireCsrf, async (request, response) => {
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  const userId = request.authContext!.user.id;
  const workspaceId = randomUUID();
  const now = new Date();
  const slugBase = input.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "workspace";
  const slug = `${slugBase}-${workspaceId.slice(0, 8)}`;
  await getDatabase().transaction(async tx => {
    await tx.insert(workspaces).values({ id: workspaceId, name: input.data.name, slug, createdBy: userId, createdAt: now, updatedAt: now });
    await tx.insert(workspaceMemberships).values({ id: randomUUID(), workspaceId, userId, role: "owner", createdAt: now, updatedAt: now });
    await tx.insert(wallets).values({ id: randomUUID(), workspaceId, balance: 0, frozen: 0, createdAt: now, updatedAt: now });
  });
  response.status(201).json(success({ id: workspaceId, name: input.data.name, slug, role: "owner" }, "Workspace 创建成功"));
});

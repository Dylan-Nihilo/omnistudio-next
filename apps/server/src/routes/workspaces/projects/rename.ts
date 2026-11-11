import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, hashSecret } from "@/db/database";
import { personalProjects } from "@/db/schema";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { authorizeProjectDirectory } from "@/services/accountService";
import { requireActiveAccount } from "@/utils/accountContext";

const inputSchema = z.strictObject({
  directory: z.string().min(1).max(4096),
  name: z.string().trim().min(1).max(255),
});

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  const account = requireActiveAccount();
  const directory = await authorizeProjectDirectory(input.directory);
  const directoryHash = hashSecret(directory);
  const [project] = await getDatabase().select({ id: personalProjects.id }).from(personalProjects)
    .where(and(eq(personalProjects.userId, account.userId), eq(personalProjects.directoryHash, directoryHash))).limit(1);
  if (!project) return response.status(404).json(error("画布不存在或无权重命名", null, 404));

  await getDatabase().update(personalProjects).set({ name: input.name, updatedAt: new Date() })
    .where(eq(personalProjects.id, project.id));
  response.set("Cache-Control", "no-store").json(success({ directory, name: input.name }, "画布名称已更新"));
});

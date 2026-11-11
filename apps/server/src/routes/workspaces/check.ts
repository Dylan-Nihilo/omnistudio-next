import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, hashSecret } from "@/db/database";
import { personalProjects } from "@/db/schema";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { registerPersonalProject } from "@/services/accountService";

const router = Router();

export default router.get("/", validateFields({ directory: z.string().min(1).max(4096) }, "query"), async (req, res) => {
  const directory = await registerPersonalProject(await u.workspace.resolveWorkspace(req, req.query.directory as string));
  const [project] = await getDatabase().select({ name: personalProjects.name }).from(personalProjects)
    .where(eq(personalProjects.directoryHash, hashSecret(directory))).limit(1);
  res.set("Cache-Control", "no-store").json(success({ directory, name: project?.name ?? "未命名画布" }));
});

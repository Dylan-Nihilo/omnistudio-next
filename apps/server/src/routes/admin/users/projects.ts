import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/database";
import { personalProjects, users } from "@/db/schema";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireRootAccount } from "@/utils/accountContext";
import { getPersonalProjectRoot } from "@/services/accountService";

export default Router().get("/", validateFields({ userId: z.uuid() }, "query"), async (request, response) => {
  requireRootAccount();
  const userId = request.query.userId as string;
  const [user] = await getDatabase().select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw Object.assign(new Error("账户不存在"), { status: 404 });
  const registered = await getDatabase().select({ directory: personalProjects.directory, name: personalProjects.name }).from(personalProjects).where(eq(personalProjects.userId, userId));
  const root = await getPersonalProjectRoot(userId);
  const entries = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => ({ directory: resolve(root, entry.name), name: entry.name }));
  const projects = [...new Map([...registered, ...entries].map(project => [project.directory, project])).values()];
  response.set("Cache-Control", "no-store").json(success(projects));
});

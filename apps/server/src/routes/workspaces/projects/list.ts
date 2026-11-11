import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/database";
import { personalProjects } from "@/db/schema";
import { success } from "@/lib/responseFormat";
import { requireAuth } from "@/middleware/authContext";
import { requireActiveAccount } from "@/utils/accountContext";

export default Router().get("/", requireAuth, async (_request, response) => {
  const account = requireActiveAccount();
  const projects = await getDatabase().select({ directory: personalProjects.directory, name: personalProjects.name, updatedAt: personalProjects.updatedAt })
    .from(personalProjects).where(eq(personalProjects.userId, account.userId)).orderBy(desc(personalProjects.updatedAt));
  response.set("Cache-Control", "no-store").json(success(projects.map(project => ({
    directory: project.directory,
    name: project.name,
    lastOpenedAt: project.updatedAt.getTime(),
  }))));
});

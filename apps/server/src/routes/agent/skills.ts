import { Router } from "express";
import { z } from "zod";
import { join, relative } from "node:path";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().get("/", validateFields({ directory: z.string().min(1).max(4096) }, "query"), async (req, res) => {
  const cwd = await u.workspace.resolveWorkspace(req, req.query.directory as string);
  const { skills, diagnostics } = u.agent.loadAgentSkills(cwd);
  res.set("Cache-Control", "no-store");
  const workspaceRoot = join(cwd, "skill");
  const globalRoot = u.skillFile.directory();
  res.json(success({
    skills: skills.map(({ name, description, filePath, warnings }) => ({ name, description, warnings, scope: u.workspaceFile.isWithin(workspaceRoot, filePath) ? "workspace" : "global" })),
    diagnostics: diagnostics.map(item => {
      const workspace = Boolean(item.path && u.workspaceFile.isWithin(workspaceRoot, item.path));
      return { type: item.type, scope: workspace ? "workspace" : "global", path: item.path ? relative(workspace ? workspaceRoot : globalRoot, item.path) : "", message: item.message };
    }),
  }));
});

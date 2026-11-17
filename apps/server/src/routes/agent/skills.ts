import { Router } from "express";
import { z } from "zod";
import { join, relative } from "node:path";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().get("/", validateFields({ directory: z.string().min(1).max(4096) }, "query"), async (req, res) => {
  const cwd = await u.workspace.resolveWorkspace(req, req.query.directory as string);
  const { diagnostics } = u.agent.loadAgentSkills(cwd);
  res.set("Cache-Control", "no-store");
  const workspaceRoot = join(cwd, "skill");
  const accountRoot = u.accountSkills.existingDirectory(req.authContext!.user.id);
  const globalRoot = u.skillFile.directory();
  res.json(success({
    skills: u.agent.listAgentSkills(cwd),
    diagnostics: diagnostics.map(item => {
      const workspace = Boolean(item.path && u.workspaceFile.isWithin(workspaceRoot, item.path));
      const account = Boolean(item.path && accountRoot && u.workspaceFile.isWithin(accountRoot, item.path));
      const scope = workspace ? "workspace" : account ? "account" : "global";
      const root = workspace ? workspaceRoot : account ? accountRoot! : globalRoot;
      return { type: item.type, scope, path: item.path ? relative(root, item.path) : "", message: item.message };
    }),
  }));
});

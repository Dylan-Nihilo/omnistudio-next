import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { requireAuth, requireCsrf } from "@/middleware/authContext";

export default Router().post("/", requireAuth, requireCsrf, validateFields({
  directory: z.string().min(1).max(4096),
  prompt: z.string().max(24000),
}), async (req, res) => {
  const { directory, prompt } = req.body as { directory: string; prompt: string };
  const cwd = await u.workspace.resolveWorkspace(req, directory);
  res.set("Cache-Control", "no-store").json(success({ recommendation: u.agent.recommendAgentSkill(cwd, prompt) ?? null }));
});

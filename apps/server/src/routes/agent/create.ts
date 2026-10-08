import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";

export default Router().post("/", requireAuth, requireCsrf, validateFields({ directory: z.string().min(1).max(4096) }), async (req, res) => {
  const cwd = await u.workspace.resolveWorkspace(req, req.body.directory);
  res.json(success(await u.agent.createAgentConversation(cwd)));
});

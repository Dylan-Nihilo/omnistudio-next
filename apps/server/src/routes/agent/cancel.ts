import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import u from "@/utils";

export default Router().post("/", requireAuth, requireCsrf, validateFields({
  directory: z.string().min(1).max(4096),
  sessionFile: z.string().regex(/^[\w-]+\.jsonl$/),
}), async (req, res) => {
  const { directory, sessionFile } = req.body as { directory: string; sessionFile: string };
  const { path } = await u.workspaceFile.resolveWorkspaceFile(req, directory, `.agent/sessions/${sessionFile}`);
  const cancelled = await u.agent.cancelAgentSession(path, req.authContext!.user.id);
  res.set("Cache-Control", "no-store").json(success({ cancelled }));
});

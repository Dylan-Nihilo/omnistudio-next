import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { analyzeProductionStoryboardShot, storyboardShotAnalysisInputSchema } from "@/services/productionStoryboardService";

const inputSchema = storyboardShotAnalysisInputSchema.extend({
  directory: z.string().min(1).max(4096),
  expectedScriptRevision: z.number().int().positive(),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  const cwd = await u.workspace.resolveWorkspace(request, input.directory);
  response.json(success(await analyzeProductionStoryboardShot({ ...input, cwd }), "单镜头分析完成"));
});

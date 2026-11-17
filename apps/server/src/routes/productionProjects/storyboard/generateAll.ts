import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { generateAllProductionStoryboardDrafts } from "@/services/productionStoryboardService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  directory: z.string().min(1).max(4096),
  providerId: z.string().min(1).max(100),
  modelId: z.string().min(1).max(200),
  episodeIds: z.array(z.uuid()).min(1).max(50),
  sourceScriptRevision: z.number().int().positive(),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  const cwd = await u.workspace.resolveWorkspace(request, input.directory);
  response.json(success(await generateAllProductionStoryboardDrafts({ ...input, cwd }), "批量分镜生成已完成"));
});

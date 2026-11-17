import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { generateProductionStoryboardDraft } from "@/services/productionStoryboardService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  episodeId: z.uuid(),
  directory: z.string().min(1).max(4096),
  providerId: z.string().min(1).max(100),
  modelId: z.string().min(1).max(200),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  const cwd = await u.workspace.resolveWorkspace(request, input.directory);
  response.json(success(await generateProductionStoryboardDraft({ ...input, cwd }), "分镜草稿已生成并保存"));
});

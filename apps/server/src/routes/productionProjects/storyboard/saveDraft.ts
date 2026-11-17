import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { saveProductionStoryboardDraft, storyboardDraftSchema } from "@/services/productionStoryboardService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  episodeId: z.uuid(),
  expectedDraftRevision: z.number().int().positive(),
  draft: storyboardDraftSchema,
});

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await saveProductionStoryboardDraft(inputSchema.parse(request.body)), "分镜草稿已保存"));
});

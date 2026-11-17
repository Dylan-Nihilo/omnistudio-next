import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { confirmProductionStoryboardDraft, storyboardDraftSchema } from "@/services/productionStoryboardService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  episodeId: z.uuid(),
  expectedScriptRevision: z.number().int().positive(),
  expectedDraftRevision: z.number().int().positive(),
  draft: storyboardDraftSchema,
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await confirmProductionStoryboardDraft(inputSchema.parse(request.body)), "分镜草稿已写入场景和镜头"));
});

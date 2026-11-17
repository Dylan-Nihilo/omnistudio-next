import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { quoteProductionStoryboardDraft } from "@/services/productionStoryboardService";

const inputSchema = z.strictObject({ projectId: z.uuid(), episodeId: z.uuid(), providerId: z.string().min(1).max(100), modelId: z.string().min(1).max(200) });

export default Router().post("/", requireAuth, validateFields(inputSchema), async (request, response) => {
  response.json(success(await quoteProductionStoryboardDraft(inputSchema.parse(request.body))));
});

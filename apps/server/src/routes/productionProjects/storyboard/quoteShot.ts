import { Router } from "express";
import { validateFields } from "@/lib/middleware";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { quoteProductionStoryboardShot, storyboardShotAnalysisInputSchema } from "@/services/productionStoryboardService";

export default Router().post("/", requireAuth, validateFields(storyboardShotAnalysisInputSchema), async (request, response) => {
  response.json(success(await quoteProductionStoryboardShot(storyboardShotAnalysisInputSchema.parse(request.body))));
});

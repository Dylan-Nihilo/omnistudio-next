import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { getProductionStoryboardDraft } from "@/services/productionStoryboardService";

export default Router().get("/", requireAuth, validateFields(z.strictObject({ projectId: z.uuid(), episodeId: z.uuid() }), "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await getProductionStoryboardDraft(request.query.projectId as string, request.query.episodeId as string)));
});

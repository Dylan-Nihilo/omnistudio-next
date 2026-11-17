import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { getProductionStoryboardStatuses } from "@/services/productionStoryboardService";

const inputSchema = z.strictObject({ projectId: z.uuid() });

export default Router().get("/", requireAuth, validateFields(inputSchema, "query"), async (request, response) => {
  response.json(success({ episodes: await getProductionStoryboardStatuses(inputSchema.parse(request.query).projectId) }));
});

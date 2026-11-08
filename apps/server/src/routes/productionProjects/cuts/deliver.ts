import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { deliverProductionCut } from "@/services/productionCutService";

const inputSchema = z.strictObject({ projectId: z.uuid(), cutId: z.uuid() });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await deliverProductionCut(inputSchema.parse(request.body)), "成片已登记交付"));
});

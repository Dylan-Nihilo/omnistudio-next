import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { decideProductionVariant } from "@/services/productionProjectService";

const inputSchema = z.strictObject({ projectId: z.uuid(), variantId: z.uuid(), decision: z.enum(["approved", "changesRequested"]), comment: z.string().max(10000).optional() });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await decideProductionVariant(inputSchema.parse(request.body)), "审片决定已记录"));
});

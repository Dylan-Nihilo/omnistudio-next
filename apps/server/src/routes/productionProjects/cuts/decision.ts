import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { decideProductionCut } from "@/services/productionCutService";

const inputSchema = z.strictObject({ projectId: z.uuid(), cutId: z.uuid(), decision: z.enum(["approved", "changesRequested"]), comment: z.string().max(10000).optional() });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await decideProductionCut(inputSchema.parse(request.body)), "成片审片结果已记录"));
});

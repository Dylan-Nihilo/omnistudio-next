import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { updateProductionProject, type ProductionProjectStatus } from "@/services/productionProjectService";

const inputSchema = z.strictObject({ projectId: z.uuid(), title: z.string().trim().min(1).max(200).optional(), customerId: z.uuid().nullable().optional(), budgetCents: z.string().regex(/^\d{1,20}(\.\d{1,6})?$/).optional(), status: z.enum(["draft", "scripted", "storyboarded", "generating", "editing", "review", "approved", "delivered"]).optional() });

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body) as { projectId: string; title?: string; customerId?: string | null; budgetCents?: string; status?: ProductionProjectStatus };
  response.json(success(await updateProductionProject(input), "生产项目已更新"));
});

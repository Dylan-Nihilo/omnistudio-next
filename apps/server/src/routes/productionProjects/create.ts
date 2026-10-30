import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createProductionProject } from "@/services/productionProjectService";

const inputSchema = z.strictObject({ workspaceId: z.uuid(), title: z.string().trim().min(1).max(200), customerId: z.uuid().optional(), budgetCents: z.string().regex(/^\d{1,20}(\.\d{1,6})?$/).default("0") });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await createProductionProject(inputSchema.parse(request.body)), "生产项目已创建"));
});

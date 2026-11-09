import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { removeProductionProjectMember } from "@/services/productionProjectService";

const inputSchema = z.strictObject({ projectId: z.uuid(), userId: z.uuid() });

export default Router().delete("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await removeProductionProjectMember(inputSchema.parse(request.body)), "项目成员已移除"));
});

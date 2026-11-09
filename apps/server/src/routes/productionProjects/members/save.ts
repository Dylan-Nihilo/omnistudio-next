import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { saveProductionProjectMember } from "@/services/productionProjectService";

const inputSchema = z.strictObject({ projectId: z.uuid(), userId: z.uuid(), role: z.enum(["owner", "producer", "writer", "director", "artist", "editor", "reviewer", "viewer"]) });

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await saveProductionProjectMember(inputSchema.parse(request.body)), "项目成员已保存"));
});

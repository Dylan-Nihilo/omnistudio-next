import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { saveProductionScriptDocument } from "@/services/productionProjectService";

const inputSchema = z.strictObject({ projectId: z.uuid(), expectedRevision: z.number().int().nonnegative(), revision: z.number().int().positive() });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await saveProductionScriptDocument(inputSchema.parse(request.body))));
});

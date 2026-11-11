import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { saveProductionScriptDocument } from "@/services/productionProjectService";
import u from "@/utils";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  document: u.productionScriptDocument.productionScriptDocumentSchema,
});

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await saveProductionScriptDocument(inputSchema.parse(request.body))));
});

import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { saveProductionScriptDraft } from "@/services/productionProjectService";
import u from "@/utils";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  expectedRevision: z.number().int().nonnegative(),
  draft: u.productionScriptDraft.productionScriptDraftSchema,
  generationData: u.productionScriptDraft.productionScriptGenerationSchema.nullable().optional(),
});

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await saveProductionScriptDraft(inputSchema.parse(request.body))));
});

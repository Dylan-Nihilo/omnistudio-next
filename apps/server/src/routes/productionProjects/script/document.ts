import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth } from "@/middleware/authContext";
import { getProductionScriptDocument } from "@/services/productionProjectService";

export default Router().get("/", requireAuth, validateFields(z.strictObject({ projectId: z.uuid(), revision: z.coerce.number().int().positive().optional() }), "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await getProductionScriptDocument(request.query.projectId as string, request.query.revision === undefined ? undefined : Number(request.query.revision))));
});

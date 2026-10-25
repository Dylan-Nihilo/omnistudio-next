import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireCsrf, requireRoot } from "@/middleware/authContext";
import { updateGenerationOutputStatus } from "@/services/usageService";

export default Router().put("/", requireRoot, requireCsrf, validateFields({ id: z.uuid(), status: z.enum(["usable", "waste"]), wasteReason: z.string().max(500).optional() }), async (request, response) => {
  response.json(success(await updateGenerationOutputStatus(request.body.id, request.body.status, request.body.wasteReason)));
});

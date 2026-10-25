import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireRoot } from "@/middleware/authContext";
import { listGenerationOutputs } from "@/services/usageService";

export default Router().get("/", requireRoot, validateFields({ status: z.enum(["pending", "usable", "waste"]).optional(), userId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(5000).optional() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listGenerationOutputs({ status: request.query.status as "pending" | "usable" | "waste" | undefined, userId: request.query.userId as string | undefined, limit: Number(request.query.limit) || 500 })));
});

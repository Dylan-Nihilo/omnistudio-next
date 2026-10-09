import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { error, success } from "@/lib/responseFormat";
import { listLedger } from "@/services/billingService";
import { validateFields } from "@/lib/middleware";
import { z } from "zod";

export default Router().get("/", requireAuth, validateFields({ userId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(200).optional() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listLedger(request.query.userId as string | undefined, Number(request.query.limit) || 100)));
});

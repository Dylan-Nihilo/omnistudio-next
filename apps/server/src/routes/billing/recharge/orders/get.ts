import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "@/middleware/authContext";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { getRechargeOrder } from "@/services/rechargeService";

export default Router().get("/", requireAuth, validateFields({ id: z.uuid() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await getRechargeOrder(String(request.query.id))));
});

import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { listRechargeOrders } from "@/services/rechargeService";

export default Router().get("/", requireAuth, async (_request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listRechargeOrders()));
});

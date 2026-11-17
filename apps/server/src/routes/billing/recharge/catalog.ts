import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { getRechargeCatalog } from "@/services/rechargeService";

export default Router().get("/", requireAuth, (_request, response) => {
  response.set("Cache-Control", "no-store").json(success(getRechargeCatalog()));
});

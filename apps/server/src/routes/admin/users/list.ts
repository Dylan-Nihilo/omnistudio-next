import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { requireRoot } from "@/middleware/authContext";
import { listAdminUsers } from "@/services/billingService";

export default Router().get("/", requireRoot, async (_request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listAdminUsers()));
});

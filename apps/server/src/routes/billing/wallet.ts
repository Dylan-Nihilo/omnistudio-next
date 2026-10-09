import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/lib/middleware";
import { z } from "zod";
import { getWallet } from "@/services/billingService";

export default Router().get("/", requireAuth, validateFields({ userId: z.uuid().optional() }, "query"), async (request, response) => {
  const wallet = await getWallet(request.query.userId as string | undefined);
  response.set("Cache-Control", "no-store").json(success({ ...wallet, available: wallet.balance - wallet.frozen, total: wallet.balance }));
});

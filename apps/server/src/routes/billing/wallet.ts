import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { error, success } from "@/lib/responseFormat";
import { requireWorkspaceMembership, workspaceIdFromRequest } from "@/services/workspaceService";
import { getWallet } from "@/services/billingService";

export default Router().get("/", requireAuth, async (request, response) => {
  const workspaceId = workspaceIdFromRequest(request);
  await requireWorkspaceMembership(request.authContext!.user.id, workspaceId);
  const wallet = await getWallet(workspaceId);
  response.set("Cache-Control", "no-store").json(success({ ...wallet, available: wallet.balance - wallet.frozen, total: wallet.balance }));
});

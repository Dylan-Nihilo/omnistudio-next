import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { error, success } from "@/lib/responseFormat";
import { listLedger } from "@/services/billingService";
import { requireWorkspaceMembership, workspaceIdFromRequest } from "@/services/workspaceService";

export default Router().get("/", requireAuth, async (request, response) => {
  const workspaceId = workspaceIdFromRequest(request);
  await requireWorkspaceMembership(request.authContext!.user.id, workspaceId);
  response.set("Cache-Control", "no-store").json(success(await listLedger(workspaceId, Number(request.query.limit) || 100)));
});

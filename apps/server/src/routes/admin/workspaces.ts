import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { error, success } from "@/lib/responseFormat";
import { isPlatformAdmin } from "@/services/authService";
import { listAdminWorkspaces } from "@/services/billingService";

export default Router().get("/", requireAuth, async (request, response) => {
  if (!await isPlatformAdmin(request.authContext!.user.id)) return response.status(403).json(error("需要管理员权限", null, 403));
  const workspaces = await listAdminWorkspaces();
  response.set("Cache-Control", "no-store").json(success(workspaces.map(workspace => ({
    ...workspace,
    available: workspace.balance - workspace.frozen,
  }))));
});

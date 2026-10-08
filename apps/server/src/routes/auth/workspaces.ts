import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { listUserWorkspaces } from "@/services/workspaceService";

export default Router().get("/", requireAuth, async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listUserWorkspaces(request.authContext!.user.id)));
});

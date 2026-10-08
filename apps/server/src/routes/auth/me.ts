import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { listUserWorkspaces } from "@/services/workspaceService";

export default Router().get("/", requireAuth, async (request, response) => {
  const session = request.authContext!;
  response.set("Cache-Control", "no-store").json(success({ user: session.user, csrfToken: session.csrfToken, workspaces: await listUserWorkspaces(session.user.id) }));
});

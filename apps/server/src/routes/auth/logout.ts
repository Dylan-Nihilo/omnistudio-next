import { Router } from "express";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { clearSessionCookies, revokeSession } from "@/services/authService";
import { success } from "@/lib/responseFormat";
import { removeUserPresence } from "@/services/presenceService";

export default Router().post("/", requireAuth, requireCsrf, async (request, response) => {
  if (request.authContext?.user?.id) {
    removeUserPresence(request.authContext.user.id);
  }
  await revokeSession(request);
  clearSessionCookies(response);
  response.json(success(null, "已退出登录"));
});

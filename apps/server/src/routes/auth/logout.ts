import { Router } from "express";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { clearSessionCookies, revokeSession } from "@/services/authService";
import { success } from "@/lib/responseFormat";

export default Router().post("/", requireAuth, requireCsrf, async (request, response) => {
  await revokeSession(request);
  clearSessionCookies(response);
  response.json(success(null, "已退出登录"));
});

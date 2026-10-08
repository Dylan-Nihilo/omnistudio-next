import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { error, success } from "@/lib/responseFormat";
import { isPlatformAdmin } from "@/services/authService";
import { grantCredits } from "@/services/billingService";

const inputSchema = z.object({ workspaceId: z.uuid(), amount: z.number().int().positive().max(1_000_000_000), reason: z.string().trim().min(1).max(500) });

export default Router().post("/", requireAuth, requireCsrf, async (request, response) => {
  if (!await isPlatformAdmin(request.authContext!.user.id)) return response.status(403).json(error("需要管理员权限", null, 403));
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  const key = request.header("idempotency-key")?.trim();
  if (!key) return response.status(422).json(error("缺少 Idempotency-Key", null, 422));
  response.json(success(await grantCredits(input.data.workspaceId, input.data.amount, key, request.authContext!.user.id, input.data.reason)));
});

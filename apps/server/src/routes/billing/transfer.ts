import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { transferCredits } from "@/services/billingService";

const inputSchema = z.strictObject({ teamId: z.uuid(), recipientUserId: z.uuid(), amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), reason: z.string().trim().min(1).max(500) });

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  const key = request.get("idempotency-key");
  if (!key) throw Object.assign(new Error("缺少 Idempotency-Key"), { status: 422 });
  response.json(success(await transferCredits({ ...inputSchema.parse(request.body), idempotencyKey: key }), "积分划转成功"));
});

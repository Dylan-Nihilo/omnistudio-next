import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { adjustCredits } from "@/services/billingService";

const inputSchema = z.strictObject({ userId: z.uuid(), amount: z.number().int().min(-1_000_000_000).max(1_000_000_000).refine(value => value !== 0, "积分变更不能为零"), reason: z.string().trim().min(1).max(500) });

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  const key = request.get("idempotency-key");
  if (!key) throw Object.assign(new Error("缺少 Idempotency-Key"), { status: 422 });
  response.json(success(await adjustCredits(input.userId, input.amount, key, input.reason), "个人积分已调整"));
});

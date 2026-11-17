import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "@/middleware/authContext";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { createRechargeOrder, rechargeTermsVersion } from "@/services/rechargeService";

const inputSchema = z.strictObject({
  packageId: z.string().min(1).max(48),
  paymentMethod: z.enum(["alipay", "wechat"]),
  agreementVersion: z.literal(rechargeTermsVersion),
});

export default Router().post("/", requireAuth, validateFields(inputSchema), async (request, response) => {
  const idempotencyKey = request.get("idempotency-key");
  if (!idempotencyKey) throw Object.assign(new Error("缺少 Idempotency-Key"), { status: 422 });
  response.json(success(await createRechargeOrder({ ...inputSchema.parse(request.body), idempotencyKey }), "充值订单已创建"));
});

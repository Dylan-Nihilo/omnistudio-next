import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "@/middleware/authContext";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { cancelRechargeOrder } from "@/services/rechargeService";

const inputSchema = z.strictObject({ id: z.uuid() });

export default Router().post("/", requireAuth, validateFields(inputSchema), async (request, response) => {
  response.json(success(await cancelRechargeOrder(inputSchema.parse(request.body).id), "充值订单已关闭"));
});

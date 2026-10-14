import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "@/middleware/authContext";
import { error, success } from "@/lib/responseFormat";
import { quoteCredits } from "@/services/billingService";

const inputSchema = z.object({ providerId: z.string().min(1).max(100), modelId: z.string().min(1).max(200), mediaType: z.enum(["text", "image", "video", "audio"]), units: z.number().positive().max(1_000_000).optional(), size: z.string().trim().min(1).max(64).optional(), textBudget: z.object({ input: z.number().int().min(0).max(100_000_000), output: z.number().int().min(0).max(100_000_000), estimation: z.string().min(1).max(200) }).optional() }).refine(input => input.units !== undefined || (input.mediaType === "text" && input.textBudget !== undefined), "请提供媒体单位或文本 token 预算");

export default Router().post("/", requireAuth, async (request, response) => {
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  const units = input.data.units ?? Math.max(1, Math.ceil((input.data.textBudget?.input ?? 0) / 10000));
  response.json(success(await quoteCredits(input.data.providerId, input.data.modelId, input.data.mediaType, units, undefined, input.data.size, input.data.textBudget)));
});

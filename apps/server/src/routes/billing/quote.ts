import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "@/middleware/authContext";
import { error, success } from "@/lib/responseFormat";
import { quoteCredits } from "@/services/billingService";

const inputSchema = z.object({ providerId: z.string().min(1).max(100), modelId: z.string().min(1).max(200), mediaType: z.enum(["text", "image", "video", "audio"]), units: z.number().positive().max(1_000_000) });

export default Router().post("/", requireAuth, async (request, response) => {
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  response.json(success(await quoteCredits(input.data.providerId, input.data.modelId, input.data.mediaType, input.data.units)));
});

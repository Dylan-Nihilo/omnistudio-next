import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createProductionReview } from "@/services/productionProjectService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  variantId: z.uuid(),
  body: z.string().trim().min(1).max(10000),
  timecodeMs: z.number().int().nonnegative().optional(),
  mentions: z.array(z.uuid()).max(50).optional(),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await createProductionReview(inputSchema.parse(request.body)), "评论已添加"));
});

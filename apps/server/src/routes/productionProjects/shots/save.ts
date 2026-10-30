import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { updateProductionShot } from "@/services/productionProjectService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  shotId: z.uuid(),
  durationMs: z.number().int().nonnegative().optional(),
  shotType: z.string().max(80).nullable().optional(),
  camera: z.string().max(500).nullable().optional(),
  lighting: z.string().max(500).nullable().optional(),
  dialogue: z.string().max(10000).nullable().optional(),
  narration: z.string().max(10000).nullable().optional(),
  prompt: z.string().max(20000).nullable().optional(),
  status: z.enum(["draft", "ready"]).optional(),
});

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await updateProductionShot(inputSchema.parse(request.body)), "镜头已保存"));
});

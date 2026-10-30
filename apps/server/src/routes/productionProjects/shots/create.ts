import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createProductionShot } from "@/services/productionProjectService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  episodeId: z.uuid(),
  sceneNumber: z.number().int().positive(),
  sceneTitle: z.string().trim().min(1).max(200),
  continuityNotes: z.string().max(5000).optional(),
  shotNumber: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().optional(),
  shotType: z.string().max(80).optional(),
  camera: z.string().max(500).optional(),
  lighting: z.string().max(500).optional(),
  dialogue: z.string().max(10000).optional(),
  narration: z.string().max(10000).optional(),
  prompt: z.string().max(20000).optional(),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await createProductionShot(inputSchema.parse(request.body)), "镜头已创建"));
});

import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createProductionEpisode } from "@/services/productionProjectService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  seasonNumber: z.number().int().positive(),
  seasonTitle: z.string().trim().min(1).max(200),
  episodeNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  targetDurationMs: z.number().int().nonnegative().optional(),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await createProductionEpisode(inputSchema.parse(request.body)), "剧集已创建"));
});

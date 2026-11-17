import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { saveProductionEpisodeShots } from "@/services/productionProjectService";

const shotSchema = z.strictObject({
  id: z.uuid().optional(),
  sceneId: z.uuid().optional(),
  sceneNumber: z.number().int().positive().optional(),
  sceneTitle: z.string().trim().min(1).max(200).optional(),
  durationMs: z.number().int().nonnegative(),
  shotType: z.string().max(80).nullable(),
  camera: z.string().max(500).nullable(),
  lighting: z.string().max(500).nullable(),
  characterAssetIds: z.array(z.uuid()).max(24),
  propAssetIds: z.array(z.uuid()).max(24),
  soundEffects: z.string().max(10000).nullable(),
  dialogue: z.string().max(10000).nullable(),
  narration: z.string().max(10000).nullable(),
  prompt: z.string().max(20000).nullable(),
});
const inputSchema = z.strictObject({ projectId: z.uuid(), episodeId: z.uuid(), shots: z.array(shotSchema).max(100) });

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await saveProductionEpisodeShots(inputSchema.parse(request.body)), "本集分镜已提交"));
});

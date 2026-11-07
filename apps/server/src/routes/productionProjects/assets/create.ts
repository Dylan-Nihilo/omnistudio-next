import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createProductionProjectAsset } from "@/services/productionProjectService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  assetType: z.enum(["character", "scene", "prop"]),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10000),
  visualDescription: z.string().trim().min(1).max(20000),
  episodeIds: z.array(z.uuid()).max(200).refine(ids => new Set(ids).size === ids.length, "剧集不能重复").optional().default([]),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await createProductionProjectAsset(inputSchema.parse(request.body)), "主体资产已创建"));
});

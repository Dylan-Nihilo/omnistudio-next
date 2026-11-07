import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { updateProductionProjectAsset } from "@/services/productionProjectService";

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  assetId: z.uuid(),
  assetType: z.enum(["character", "scene", "prop"]),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10000),
  visualDescription: z.string().trim().min(1).max(20000),
  episodeIds: z.array(z.uuid()).max(200).refine(ids => new Set(ids).size === ids.length, "剧集不能重复").optional().default([]),
});

export default Router().put("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await updateProductionProjectAsset(inputSchema.parse(request.body)), "主体资产已保存"));
});

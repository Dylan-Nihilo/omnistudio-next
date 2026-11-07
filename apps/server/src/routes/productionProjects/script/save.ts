import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createProductionScriptStructure } from "@/services/productionProjectService";
import u from "@/utils";

const shotSchema = z.strictObject({
  shotNumber: z.number().int().positive(),
  durationMs: z.number().int().min(1000).max(120000),
  shotType: z.string().trim().min(1).max(80),
  camera: z.string().max(500),
  lighting: z.string().max(500),
  prompt: z.string().trim().min(1).max(5000),
  dialogue: z.string().max(3000),
  narration: z.string().max(3000),
});

const sceneSchema = z.strictObject({
  sceneNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  continuityNotes: z.string().max(3000),
  shots: z.array(shotSchema).min(1).max(12),
});

const episodeSchema = z.strictObject({
  episodeNumber: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  targetDurationMs: z.number().int().min(1000).max(600000),
  scenes: z.array(sceneSchema).min(1).max(8),
});

const inputSchema = z.strictObject({
  projectId: z.uuid(),
  logline: z.string().trim().min(1).max(1000),
  sourceGeneration: u.productionScriptDraft.productionScriptGenerationSchema.refine(value => value.status === "parsed", "只能确认已解析的剧本生成记录"),
  generation: z.strictObject({
    providerId: z.string().min(1).max(100),
    modelId: z.string().min(1).max(200),
    genre: z.string().trim().min(1).max(100),
    fusionGenres: z.array(z.string().trim().min(1).max(100)).max(3),
    style: z.string().trim().min(1).max(100),
    aspectRatio: z.enum(["9:16", "16:9", "21:9", "3:4", "4:3", "1:1"]),
    stylePrompt: z.string().trim().max(10000).optional(),
    styleNegativePrompt: z.string().trim().max(5000).optional(),
  }),
  assets: z.array(z.strictObject({
    assetType: z.enum(["character", "scene", "prop"]),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(3000),
    visualDescription: z.string().trim().min(1).max(5000),
  })).min(2).max(24),
  episodes: z.array(episodeSchema).min(1).max(12),
}).superRefine((input, context) => {
  if (!input.assets.some(asset => asset.assetType === "character")) context.addIssue({ code: "custom", path: ["assets"], message: "至少需要一项角色资产" });
  if (!input.assets.some(asset => asset.assetType === "scene")) context.addIssue({ code: "custom", path: ["assets"], message: "至少需要一项场景资产" });
  input.episodes.forEach((episode, episodeIndex) => {
    if (episode.episodeNumber !== episodeIndex + 1) context.addIssue({ code: "custom", path: ["episodes", episodeIndex, "episodeNumber"], message: "集数必须从 1 开始连续编号" });
    episode.scenes.forEach((scene, sceneIndex) => {
      if (scene.sceneNumber !== sceneIndex + 1) context.addIssue({ code: "custom", path: ["episodes", episodeIndex, "scenes", sceneIndex, "sceneNumber"], message: "场景必须从 1 开始连续编号" });
      scene.shots.forEach((shot, shotIndex) => {
        if (shot.shotNumber !== shotIndex + 1) context.addIssue({ code: "custom", path: ["episodes", episodeIndex, "scenes", sceneIndex, "shots", shotIndex, "shotNumber"], message: "镜头必须从 1 开始连续编号" });
      });
    });
  });
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await createProductionScriptStructure(inputSchema.parse(request.body)), "剧本结构已写入生产项目"));
});

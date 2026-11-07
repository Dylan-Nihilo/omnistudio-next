import { z } from "zod";

export const productionScriptDraftSchema = z.strictObject({
  mode: z.enum(["create", "adapt", "produce", "redraw"]),
  instruction: z.string().max(30000),
  pastedScript: z.string().max(120000),
  files: z.array(z.strictObject({
    id: z.string().min(1).max(400),
    name: z.string().min(1).max(255),
    size: z.number().int().positive().max(500 * 1024 * 1024),
    type: z.string().max(200),
    lastModified: z.number().int().nonnegative(),
    storageKey: z.string().min(1).max(500),
  })).max(10),
  style: z.string().min(1).max(200),
  genre: z.string().min(1).max(100),
  fusionGenres: z.array(z.string().min(1).max(100)).max(3),
  aspectRatio: z.enum(["9:16", "16:9", "21:9", "3:4", "4:3", "1:1"]),
  episodeCount: z.number().int().min(1).max(12),
  textModel: z.string().max(400),
  adaptType: z.string().max(500),
  outputLanguage: z.string().max(100),
});

export const productionScriptGenerationSchema = z.strictObject({
  rawText: z.string().max(500000),
  generatedAt: z.iso.datetime(),
  providerId: z.string().min(1).max(100),
  modelId: z.string().min(1).max(200),
  stopReason: z.string().max(50),
  status: z.enum(["raw", "parsed", "invalid"]),
  error: z.string().max(1000).optional(),
  usage: z.strictObject({ input: z.number().nonnegative(), output: z.number().nonnegative(), total: z.number().nonnegative(), cost: z.number().nonnegative() }).nullable(),
  result: z.record(z.string(), z.json()).optional(),
});

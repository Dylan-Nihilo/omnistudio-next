import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireRoot } from "@/middleware/authContext";
import { listUsageSummary } from "@/services/usageService";

export default Router().get("/", requireRoot, validateFields({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), userId: z.uuid().optional(), workspace: z.string().trim().min(1).max(255).optional(), modelId: z.string().trim().min(1).max(200).optional(), mediaType: z.enum(["text", "image", "video", "audio"]).optional(), limit: z.coerce.number().int().min(1).max(20000).optional() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listUsageSummary({ from: request.query.from as string | undefined, to: request.query.to as string | undefined, userId: request.query.userId as string | undefined, workspace: request.query.workspace as string | undefined, modelId: request.query.modelId as string | undefined, mediaType: request.query.mediaType as "text" | "image" | "video" | "audio" | undefined, limit: Number(request.query.limit) || 5000 })));
});

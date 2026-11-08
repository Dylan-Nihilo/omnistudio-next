import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { importEditorMedia } from "@/services/editorMediaService";

const workspaceSourceSchema = z.strictObject({ type: z.literal("workspace"), path: z.string().min(1).max(4096), canvasPath: z.string().min(1).max(4096).optional(), nodeId: z.string().min(1).max(200).optional(), outputId: z.string().min(1).max(200).optional() });
const productionSourceSchema = z.strictObject({ type: z.literal("production"), projectId: z.uuid(), variantId: z.uuid() });
const librarySourceSchema = z.strictObject({ type: z.literal("library"), path: z.string().min(1).max(4096) });
const inputSchema = z.strictObject({ directory: z.string().min(1).max(4096), source: z.discriminatedUnion("type", [workspaceSourceSchema, productionSourceSchema, librarySourceSchema]) });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await importEditorMedia(inputSchema.parse(request.body)), "素材已固定到剪辑项目"));
});

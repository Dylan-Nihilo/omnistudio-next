import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { importProductionSource } from "@/services/editorMediaService";
import u from "@/utils";

const inputSchema = z.strictObject({ projectId: z.uuid(), variantId: z.uuid(), directory: z.string().min(1).max(4096) });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  const directory = await u.workspace.resolveWorkspace(request, input.directory);
  response.status(201).json(success(await importProductionSource({ ...input, directory }), "候选素材已固定到剪辑项目"));
});

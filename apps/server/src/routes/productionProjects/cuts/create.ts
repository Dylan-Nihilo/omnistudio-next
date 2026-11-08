import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createProductionCut } from "@/services/productionCutService";
import u from "@/utils";

const referenceSchema = z.strictObject({ type: z.string().trim().min(1).max(40), id: z.string().trim().min(1).max(200), label: z.string().max(500).optional() });
const inputSchema = z.strictObject({ projectId: z.uuid(), episodeId: z.uuid().optional(), directory: z.string().min(1).max(4096), videoPath: z.string().min(1).max(4096), editorProjectPath: z.string().min(1).max(4096), editorRevision: z.string().regex(/^[\da-f]{64}$/i), title: z.string().trim().min(1).max(200), sourceReferences: z.array(referenceSchema).max(500).optional() });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  const directory = await u.workspace.resolveWorkspace(request, input.directory);
  response.status(201).json(success(await createProductionCut({ ...input, directory }), "成片已提交审片"));
});

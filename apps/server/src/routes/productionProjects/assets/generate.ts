import { Router } from "express";
import { z } from "zod";
import { imageGenerationSchema } from "@omnistudio-next/tool-media-generation/runtime";
import { validateFields } from "@/lib/middleware";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { generateProductionProjectAsset } from "@/services/productionProjectService";
import u from "@/utils";

const envelopeSchema = z.object({ projectId: z.uuid(), assetId: z.uuid(), directory: z.string().min(1).max(4096) });

export default Router().post("/", requireAuth, requireCsrf, validateFields(envelopeSchema), async (request, response) => {
  const envelope = envelopeSchema.parse(request.body);
  const requestBody = { ...request.body };
  delete requestBody.projectId;
  delete requestBody.assetId;
  delete requestBody.directory;
  const parsedRequest = imageGenerationSchema.parse(requestBody);
  const idempotencyKey = request.header("idempotency-key")?.trim();
  if (!idempotencyKey) throw Object.assign(new Error("缺少 Idempotency-Key"), { status: 422 });
  const cwd = await u.workspace.resolveWorkspace(request, envelope.directory);
  response.json(success(await generateProductionProjectAsset({ projectId: envelope.projectId, assetId: envelope.assetId, cwd, request: parsedRequest, idempotencyKey }), "主体参考图已生成"));
});

import { Router } from "express";
import { z } from "zod";
import { audioGenerationSchema, imageGenerationSchema, videoGenerationSchema } from "@omnistudio-next/tool-media-generation/runtime";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { generateProductionShot } from "@/services/productionProjectService";
import u from "@/utils";

const envelopeSchema = z.object({ projectId: z.uuid(), shotId: z.uuid(), directory: z.string().min(1).max(4096), mediaType: z.enum(["image", "video", "audio"]) });

export default Router().post("/", requireAuth, requireCsrf, validateFields(envelopeSchema), async (request, response) => {
  const parsedEnvelope = envelopeSchema.parse(request.body);
  const requestBody = { ...request.body };
  delete requestBody.projectId;
  delete requestBody.shotId;
  delete requestBody.directory;
  delete requestBody.mediaType;
  const requestSchema = parsedEnvelope.mediaType === "image" ? imageGenerationSchema : parsedEnvelope.mediaType === "video" ? videoGenerationSchema : audioGenerationSchema;
  const parsedRequest = requestSchema.safeParse(requestBody);
  if (!parsedRequest.success) {
    response.status(400).json(error("参数错误", parsedRequest.error.issues));
    return;
  }
  const idempotencyKey = request.header("idempotency-key")?.trim();
  if (!idempotencyKey) throw Object.assign(new Error("缺少 Idempotency-Key"), { status: 422 });
  const cwd = await u.workspace.resolveWorkspace(request, parsedEnvelope.directory);
  const data = await generateProductionShot({ projectId: parsedEnvelope.projectId, shotId: parsedEnvelope.shotId, cwd, mediaType: parsedEnvelope.mediaType, request: parsedRequest.data, idempotencyKey });
  response.json(success(data, "镜头生成完成，已进入审片"));
});

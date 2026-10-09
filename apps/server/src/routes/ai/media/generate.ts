import { Router } from "express";
import { z } from "zod";
import { audioGenerationSchema, imageGenerationSchema, videoGenerationSchema } from "@toonflow/tool-media-generation/runtime";
import { validateFields } from "@/lib/middleware";
import { success, error } from "@/lib/responseFormat";
import u from "@/utils";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { reserveGeneration, settleGeneration } from "@/services/billingService";
import { requireEnabledPlatformModel } from "@/services/modelService";
import { requireWorkspaceMembership, workspaceIdFromRequest } from "@/services/workspaceService";

export default Router().post("/", requireAuth, requireCsrf, validateFields({
  directory: z.string().min(1).max(4096), mediaType: z.enum(["image", "video", "audio"]),
}), async (req, res) => {
  const { directory, mediaType, ...request } = req.body;
  const parsed = (mediaType === "image" ? imageGenerationSchema : mediaType === "video" ? videoGenerationSchema : audioGenerationSchema).safeParse(request);
  if (!parsed.success) {
    res.status(400).json(error("参数错误", parsed.error.issues, 400));
    return;
  }
  const workspaceId = workspaceIdFromRequest(req);
  await requireWorkspaceMembership(req.authContext!.user.id, workspaceId);
  await requireEnabledPlatformModel(parsed.data.providerId, parsed.data.modelId, mediaType);
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (!idempotencyKey) throw Object.assign(new Error("缺少 Idempotency-Key"), { status: 422 });
  const duration = mediaType === "video" && "duration" in parsed.data ? parsed.data.duration : undefined;
  const units = mediaType === "video" ? Math.max(1, duration ?? 1) : mediaType === "audio" ? Math.max(1, parsed.data.prompt.length / 1000) : 1;
  const size = mediaType === "image" && "size" in parsed.data ? parsed.data.size : undefined;
  const cwd = await u.workspace.resolveWorkspace(req, directory);
  const reserved = await reserveGeneration({ workspaceId, userId: req.authContext!.user.id, modelId: parsed.data.modelId, mediaType, units, size, idempotencyKey, requestSnapshot: { mediaType, providerId: parsed.data.providerId, modelId: parsed.data.modelId, request } });
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once("close", close);
  req.once("aborted", close);
  req.socket.once("close", close);
  try {
    const files = await u.mediaGeneration.generateMedia(cwd, mediaType, parsed.data, controller.signal);
    await settleGeneration(reserved.job.id, true, { files });
    if (!res.destroyed) res.json(success(files));
  } catch (error) {
    await settleGeneration(reserved.job.id, false, { error: error instanceof Error ? error.message : "媒体生成失败" });
    throw error;
  } finally {
    res.off("close", close);
    req.off("aborted", close);
    req.socket.off("close", close);
  }
});

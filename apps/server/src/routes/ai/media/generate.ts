import { Router } from "express";
import { z } from "zod";
import { audioGenerationSchema, imageGenerationSchema, videoGenerationSchema } from "@omnistudio-next/tool-media-generation/runtime";
import { validateFields } from "@/lib/middleware";
import { error } from "@/lib/responseFormat";
import u from "@/utils";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { requireEnabledPlatformModel } from "@/services/modelService";

export default Router().post("/", requireAuth, requireCsrf, validateFields({
  directory: z.string().min(1).max(4096), mediaType: z.enum(["image", "video", "audio"]),
}), async (req, res) => {
  const { directory, mediaType, ...request } = req.body;
  const parsed = (mediaType === "image" ? imageGenerationSchema : mediaType === "video" ? videoGenerationSchema : audioGenerationSchema).safeParse(request);
  if (!parsed.success) {
    res.status(400).json(error("参数错误", parsed.error.issues, 400));
    return;
  }
  await requireEnabledPlatformModel(parsed.data.providerId, parsed.data.modelId, mediaType);
  const idempotencyKey = req.header("idempotency-key")?.trim();
  if (!idempotencyKey) throw Object.assign(new Error("缺少 Idempotency-Key"), { status: 422 });
  const cwd = await u.workspace.resolveWorkspace(req, directory);
  res.status(200).type("application/json").set({ "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
  res.write('{"code":');
  const heartbeat = setInterval(() => {
    if (!res.destroyed) res.write(" ".repeat(1024));
  }, 10000);
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once("close", close);
  req.once("aborted", close);
  req.socket.once("close", close);
  try {
    const files = await u.mediaGeneration.generateMedia(cwd, mediaType, parsed.data, controller.signal, { userId: req.authContext!.user.id, idempotencyKey });
    if (!res.destroyed) res.end(`200,"data":${JSON.stringify(files)},"message":"成功"}`);
  } catch (caught) {
    if (!res.destroyed) {
      const err = caught as Error & { status?: number };
      const status = err.status ?? 500;
      res.end(`${status},"data":null,"message":${JSON.stringify(err.message || "操作失败")}}`);
      return;
    }
    throw caught;
  } finally {
    clearInterval(heartbeat);
    res.off("close", close);
    req.off("aborted", close);
    req.socket.off("close", close);
  }
});

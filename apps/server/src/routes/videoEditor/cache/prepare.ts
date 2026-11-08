import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import u from "@/utils";

const inputSchema = z.strictObject({ directory: z.string().min(1).max(4096), path: z.string().min(1).max(4096) });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const controller = new AbortController();
  const abort = () => { if (!response.writableFinished) controller.abort(); };
  request.once("aborted", abort);
  response.once("close", abort);
  try {
    if (request.aborted || response.destroyed) controller.abort();
    const result = await u.editorMediaCache.prepareEditorMediaCache(inputSchema.parse(request.body), controller.signal);
    if (!response.destroyed) response.json(success(result, "剪辑缓存已准备"));
  } catch (caught) {
    const cancelled = controller.signal.aborted || caught instanceof Error && (caught.name === "AbortError" || "code" in caught && caught.code === "ABORT_ERR");
    if (cancelled && !response.destroyed) {
      response.status(409).json(error("剪辑缓存生成已取消", null, 409));
      return;
    }
    throw caught;
  } finally {
    request.off("aborted", abort);
    response.off("close", abort);
  }
});

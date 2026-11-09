import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import u from "@/utils";

const inputSchema = z.strictObject({
  directory: z.string().min(1).max(4096), path: z.string().min(1).max(4096),
  inPoint: z.number().min(0).max(86400), outPoint: z.number().min(0).max(86400),
  speed: z.number().min(.25).max(4), targetLufs: z.number().min(-24).max(-9),
}).refine(input => input.outPoint > input.inPoint, { message: "片段出点必须晚于入点", path: ["outPoint"] });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const controller = new AbortController();
  const abort = () => { if (!response.writableFinished) controller.abort(); };
  request.once("aborted", abort);
  response.once("close", abort);
  try {
    if (request.aborted || response.destroyed) controller.abort();
    const result = await u.editorLoudness.analyzeEditorAudio(inputSchema.parse(request.body), controller.signal);
    if (!response.destroyed) response.set("Cache-Control", "no-store").json(success(result, "片段响度已测量"));
  } catch (caught) {
    if (caught instanceof Error && caught.name === "AbortError") {
      if (!response.destroyed) response.status(409).json(error("响度分析已取消", null, 409));
      return;
    }
    throw caught;
  } finally {
    request.off("aborted", abort);
    response.off("close", abort);
  }
});

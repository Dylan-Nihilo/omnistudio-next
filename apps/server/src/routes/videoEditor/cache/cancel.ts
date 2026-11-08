import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import u from "@/utils";

const inputSchema = z.strictObject({ directory: z.string().min(1).max(4096), path: z.string().min(1).max(4096) });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await u.editorMediaCache.cancelEditorMediaCache(inputSchema.parse(request.body)), "剪辑缓存生成已停止"));
});

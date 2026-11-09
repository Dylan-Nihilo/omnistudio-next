import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { cancelEditorRender } from "@/services/editorRenderService";

const inputSchema = z.strictObject({ directory: z.string().min(1).max(4096), id: z.uuid() });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.json(success(await cancelEditorRender(inputSchema.parse(request.body)), "渲染任务已取消"));
});

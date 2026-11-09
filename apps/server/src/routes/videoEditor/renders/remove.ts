import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { removeEditorRender } from "@/services/editorRenderService";

const inputSchema = z.strictObject({ directory: z.string().min(1).max(4096), id: z.uuid() });

export default Router().delete("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  await removeEditorRender(inputSchema.parse(request.body));
  response.json(success(null, "渲染任务已删除"));
});

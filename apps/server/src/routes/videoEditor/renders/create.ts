import { Router } from "express";
import { z } from "zod";
import type { BrowserFfmpegRequest } from "@omnistudio-next/ffmpeg";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createEditorRender } from "@/services/editorRenderService";

const inputSchema = z.strictObject({
  directory: z.string().min(1).max(4096),
  projectPath: z.string().min(1).max(255),
  revision: z.string().regex(/^[\da-f]{64}$/i),
  projectName: z.string().trim().min(1).max(120),
  request: z.json(),
});

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  response.status(201).json(success(await createEditorRender({ ...input, request: input.request as BrowserFfmpegRequest }), "渲染任务已创建"));
});

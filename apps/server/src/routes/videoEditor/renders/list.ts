import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth } from "@/middleware/authContext";
import { listEditorRenders } from "@/services/editorRenderService";

const inputSchema = z.strictObject({ directory: z.string().min(1).max(4096), projectPath: z.string().min(1).max(255) });

export default Router().get("/", requireAuth, validateFields(inputSchema, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listEditorRenders(inputSchema.parse(request.query))));
});

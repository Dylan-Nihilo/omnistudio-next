import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { recordEditorExport } from "@/services/editorExportService";

const inputSchema = z.strictObject({ directory: z.string().min(1).max(4096), projectPath: z.string().min(1).max(4096), revision: z.string().regex(/^[\da-f]{64}$/), exportPath: z.string().min(1).max(4096) });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  response.status(201).set("Cache-Control", "no-store").json(success(await recordEditorExport(inputSchema.parse(request.body)), "导出记录已保存"));
});

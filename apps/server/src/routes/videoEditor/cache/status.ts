import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth } from "@/middleware/authContext";
import u from "@/utils";

const inputSchema = z.strictObject({ directory: z.string().min(1).max(4096), path: z.string().min(1).max(4096) });

export default Router().get("/", requireAuth, validateFields(inputSchema, "query"), async (request, response) => {
  const result = await u.editorMediaCache.statusEditorMediaCache({ directory: request.query.directory as string, path: request.query.path as string });
  response.set("Cache-Control", "no-store").json(success(result));
});

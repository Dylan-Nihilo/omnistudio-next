import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { requireAuth } from "@/middleware/authContext";
import { readProductionCut } from "@/services/productionCutService";

export default Router().get("/", requireAuth, validateFields({ projectId: z.uuid(), cutId: z.uuid(), file: z.enum(["video", "project", "manifest"]) }, "query"), async (request, response, next) => {
  const file = await readProductionCut({ projectId: request.query.projectId as string, cutId: request.query.cutId as string, file: request.query.file as "video" | "project" | "manifest" });
  response.set({ "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" });
  response.type(file.mimeType).set("Content-Disposition", `inline; filename="${file.name}"`).sendFile(file.path, { dotfiles: "deny" }, error => { if (error) next(error); });
});

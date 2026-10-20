import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "@/middleware/authContext";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { recordUserPresence } from "@/services/presenceService";

const inputSchema = z.strictObject({
  currentPath: z.string().trim().max(120).optional(),
});

export default Router().post("/", requireAuth, validateFields(inputSchema), (request, response) => {
  const currentPath = typeof request.body?.currentPath === "string" ? request.body.currentPath.trim() : undefined;
  const clientIp = request.ip || request.socket.remoteAddress || undefined;
  recordUserPresence(request.authContext!.user.id, { currentPath, clientIp });
  response.set("Cache-Control", "no-store").json(success({ recorded: true }));
});

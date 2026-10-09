import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "@/middleware/authContext";
import { error, success } from "@/lib/responseFormat";
import { quoteCredits } from "@/services/billingService";
import { requireWorkspaceMembership, workspaceIdFromRequest } from "@/services/workspaceService";

const inputSchema = z.object({ modelId: z.string().min(1).max(200), mediaType: z.enum(["text", "image", "video", "audio"]), units: z.number().positive().max(1_000_000), size: z.string().trim().min(1).max(64).optional() });

export default Router().post("/", requireAuth, async (request, response) => {
  const workspaceId = workspaceIdFromRequest(request);
  await requireWorkspaceMembership(request.authContext!.user.id, workspaceId);
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  response.json(success(await quoteCredits(input.data.modelId, input.data.mediaType, input.data.units, input.data.size)));
});

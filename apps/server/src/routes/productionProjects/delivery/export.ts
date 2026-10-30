import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { createProductionDelivery } from "@/services/deliveryService";
import u from "@/utils";

const inputSchema = z.strictObject({ projectId: z.uuid(), directory: z.string().min(1).max(4096) });

export default Router().post("/", requireAuth, requireCsrf, validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  const cwd = await u.workspace.resolveWorkspace(request, input.directory);
  response.status(201).json(success(await createProductionDelivery({ projectId: input.projectId, cwd }), "交付包已生成"));
});

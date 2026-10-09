import { basename } from "node:path";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { uploadTeamAsset } from "@/services/teamAssetService";

const inputSchema = z.strictObject({ teamId: z.uuid(), directory: z.string().min(1).max(4096).optional(), path: z.string().min(1).max(4096), mimeType: z.string().max(150).regex(/^[\w.+-]+\/[\w.+-]+$/) });

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  response.status(201).json(success(await uploadTeamAsset(input.teamId, basename(input.path), input.mimeType, input), "已复制到团队空间，个人原件保留"));
});

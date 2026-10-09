import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { importTeamAsset } from "@/services/teamAssetService";

const inputSchema = z.strictObject({ id: z.uuid(), directory: z.string().min(1).max(4096).optional(), targetDirectory: z.string().min(1).max(4096).optional() });

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  response.status(201).json(success(await importTeamAsset(input.id, input.directory, input.targetDirectory), "资产已复制到个人项目"));
});

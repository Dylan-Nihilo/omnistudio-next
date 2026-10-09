import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { renameTeamAsset, teamAssetNameSchema } from "@/services/teamAssetService";

const inputSchema = z.strictObject({ id: z.uuid(), name: teamAssetNameSchema });

export default Router().put("/", validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  await renameTeamAsset(input.id, input.name);
  response.json(success(null, "资产名称已更新"));
});

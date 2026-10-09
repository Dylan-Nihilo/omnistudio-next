import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { removeTeamAsset } from "@/services/teamAssetService";

const inputSchema = z.strictObject({ id: z.uuid() });

export default Router().delete("/", validateFields(inputSchema), async (request, response) => {
  await removeTeamAsset(inputSchema.parse(request.body).id);
  response.json(success(null, "团队副本已删除，个人原件不受影响"));
});

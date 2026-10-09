import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { updateTeam } from "@/services/teamService";

const inputSchema = z.strictObject({ teamId: z.uuid(), name: z.string().trim().min(1).max(160).optional(), archive: z.boolean().optional(), restore: z.boolean().optional() }).refine(value => Boolean(value.name) || value.archive === true || value.restore === true, "请选择团队操作").refine(value => !value.archive || !value.restore, "不能同时解散和恢复团队");

export default Router().put("/", validateFields(inputSchema), async (request, response) => {
  const { teamId, ...input } = inputSchema.parse(request.body);
  await updateTeam(teamId, input);
  response.json(success(null, input.archive ? "团队已解散，共享资产保留归档" : "团队名称已更新"));
});

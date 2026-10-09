import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { removeTeamMember } from "@/services/teamService";

const inputSchema = z.strictObject({ teamId: z.uuid(), userId: z.uuid() });

export default Router().delete("/", validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  await removeTeamMember(input.teamId, input.userId);
  response.json(success(null, "成员已移除"));
});

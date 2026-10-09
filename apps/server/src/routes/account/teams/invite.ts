import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { inviteTeamMember } from "@/services/teamService";

const inputSchema = z.strictObject({ teamId: z.uuid(), email: z.email().max(320) });

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  response.status(201).json(success(await inviteTeamMember(input.teamId, input.email), "邀请已创建"));
});

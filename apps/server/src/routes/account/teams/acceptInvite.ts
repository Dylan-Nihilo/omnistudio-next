import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { acceptTeamInvitation } from "@/services/teamService";

const inputSchema = z.strictObject({ token: z.string().min(32).max(200) });

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  response.json(success(await acceptTeamInvitation(inputSchema.parse(request.body).token), "已加入团队"));
});

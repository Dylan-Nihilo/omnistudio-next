import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { createTeam } from "@/services/teamService";

const inputSchema = z.strictObject({ name: z.string().trim().min(1).max(160) });

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  response.status(201).json(success(await createTeam(inputSchema.parse(request.body).name), "团队已创建"));
});

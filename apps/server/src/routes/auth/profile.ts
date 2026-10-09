import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { updateOwnProfile } from "@/services/userService";

const inputSchema = z.strictObject({ displayName: z.string().trim().min(1).max(120) });

export default Router().put("/", validateFields(inputSchema), async (request, response) => {
  await updateOwnProfile(inputSchema.parse(request.body).displayName);
  response.json(success(null, "个人资料已更新"));
});

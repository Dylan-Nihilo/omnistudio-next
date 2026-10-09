import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { updateUser } from "@/services/userService";

const inputSchema = z.strictObject({ userId: z.uuid(), displayName: z.string().trim().min(1).max(120).optional(), status: z.enum(["active", "disabled"]).optional() }).refine(value => value.displayName !== undefined || value.status !== undefined, "请填写要更新的账户信息");

export default Router().put("/", validateFields(inputSchema), async (request, response) => {
  const { userId, ...input } = inputSchema.parse(request.body);
  await updateUser(userId, input);
  response.json(success(null, "账户已更新"));
});

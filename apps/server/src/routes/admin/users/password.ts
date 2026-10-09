import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { resetUserPassword } from "@/services/userService";

const inputSchema = z.strictObject({ userId: z.uuid(), password: z.string().min(12).max(200) });

export default Router().put("/", validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  await resetUserPassword(input.userId, input.password);
  response.json(success(null, "密码已重置，该账户的会话与服务凭证已撤销"));
});

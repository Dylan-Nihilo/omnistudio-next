import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { clearSessionCookies } from "@/services/authService";
import { changeOwnPassword } from "@/services/userService";

const inputSchema = z.strictObject({ currentPassword: z.string().min(1).max(200), password: z.string().min(12).max(200) });

export default Router().put("/", validateFields(inputSchema), async (request, response) => {
  const input = inputSchema.parse(request.body);
  await changeOwnPassword(input.currentPassword, input.password);
  clearSessionCookies(response);
  response.json(success(null, "密码已更新，请重新登录"));
});

import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { createAccount, limitAuthentication, writeSessionCookies } from "@/services/authService";

const inputSchema = z.strictObject({
  email: z.email().max(320), displayName: z.string().trim().min(1).max(120), password: z.string().min(12).max(200),
  inviteToken: z.string().min(32).max(200).optional(),
});

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  limitAuthentication(request, "register");
  const result = await createAccount(inputSchema.parse(request.body));
  writeSessionCookies(response, result.session.sessionToken, result.session.csrfToken);
  response.status(201).json(success({ user: result.user, csrfToken: result.session.csrfToken }, "注册成功"));
});

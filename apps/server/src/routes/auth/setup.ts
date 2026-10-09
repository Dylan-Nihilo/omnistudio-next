import { Router } from "express";
import { assertRootSetupAuthorization, createAccount, limitAuthentication, writeSessionCookies } from "@/services/authService";
import { success } from "@/lib/responseFormat";
import { validateFields } from "@/lib/middleware";
import { z } from "zod";

const inputSchema = z.strictObject({
  email: z.email().max(320), displayName: z.string().trim().min(1).max(120), password: z.string().min(12).max(200),
  setupToken: z.string().trim().max(200).optional(),
});

export default Router().post("/", validateFields(inputSchema), async (request, response) => {
  limitAuthentication(request, "setup");
  const input = inputSchema.parse(request.body);
  assertRootSetupAuthorization(request, input.setupToken);
  const result = await createAccount(input, true);
  writeSessionCookies(response, result.session.sessionToken, result.session.csrfToken);
  response.status(201).json(success({ user: result.user, csrfToken: result.session.csrfToken }, "初始化完成"));
});

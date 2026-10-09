import { Router } from "express";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { createSession, limitAuthentication, userView, verifyPassword, writeSessionCookies } from "@/services/authService";
import { getDatabase } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { initializePersonalSpace } from "@/services/accountService";

const inputSchema = z.object({ email: z.email().max(320), password: z.string().min(1).max(200) });

export default Router().post("/", async (request, response) => {
  limitAuthentication(request, "login");
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  const [user] = await getDatabase().select().from(users).where(eq(users.email, input.data.email.toLowerCase())).limit(1);
  if (!user || user.status !== "active" || !(await verifyPassword(input.data.password, user.passwordHash))) return response.status(401).json(error("邮箱或密码错误", null, 401));
  const account = await userView(user);
  await initializePersonalSpace(user.id, account.isRoot);
  const session = await createSession(user.id);
  writeSessionCookies(response, session.sessionToken, session.csrfToken);
  response.json(success({ user: account, csrfToken: session.csrfToken }));
});

import { Router } from "express";
import { z } from "zod";
import { error, success } from "@/lib/responseFormat";
import { createSession, verifyPassword, writeSessionCookies } from "@/services/authService";
import { getDatabase } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listUserWorkspaces } from "@/services/workspaceService";

const inputSchema = z.object({ email: z.email().max(320), password: z.string().min(1).max(200) });

export default Router().post("/", async (request, response) => {
  const input = inputSchema.safeParse(request.body);
  if (!input.success) return response.status(422).json(error("参数错误", input.error.issues, 422));
  const [user] = await getDatabase().select().from(users).where(eq(users.email, input.data.email.toLowerCase())).limit(1);
  if (!user || user.status !== "active" || !(await verifyPassword(input.data.password, user.passwordHash))) return response.status(401).json(error("邮箱或密码错误", null, 401));
  const session = await createSession(user.id);
  writeSessionCookies(response, session.sessionToken, session.csrfToken);
  response.json(success({ user: { id: user.id, email: user.email, displayName: user.displayName }, workspaces: await listUserWorkspaces(user.id), csrfToken: session.csrfToken }));
});

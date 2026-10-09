import { Router } from "express";
import { requireAuth } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { getPersonalProjectRoot } from "@/services/accountService";
import { listUserTeams } from "@/services/teamService";
import { getDatabase } from "@/db/database";
import { serviceCredentials } from "@/db/schema";
import { eq } from "drizzle-orm";

export default Router().get("/", requireAuth, async (request, response) => {
  const session = request.authContext!;
  const credentials = await getDatabase().select({ kind: serviceCredentials.kind, enabled: serviceCredentials.enabled }).from(serviceCredentials).where(eq(serviceCredentials.userId, session.user.id));
  const serviceStates = { mcp: credentials.some(value => value.kind === "mcp" && value.enabled === 1), a2a: credentials.some(value => value.kind === "a2a" && value.enabled === 1) };
  response.set("Cache-Control", "no-store").json(success({ user: session.user, csrfToken: session.csrfToken, teams: await listUserTeams(), personalDirectory: await getPersonalProjectRoot(), serviceStates }));
});

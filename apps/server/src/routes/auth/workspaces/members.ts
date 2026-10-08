import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/middleware/authContext";
import { getDatabase } from "@/db/database";
import { users, workspaceMemberships } from "@/db/schema";
import { success } from "@/lib/responseFormat";
import { requireWorkspaceMembership, workspaceIdFromRequest } from "@/services/workspaceService";

export default Router().get("/", requireAuth, async (request, response) => {
  const workspaceId = workspaceIdFromRequest(request);
  await requireWorkspaceMembership(request.authContext!.user.id, workspaceId);
  const members = await getDatabase().select({ id: users.id, email: users.email, displayName: users.displayName, status: users.status, role: workspaceMemberships.role })
    .from(workspaceMemberships).innerJoin(users, eq(users.id, workspaceMemberships.userId))
    .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(users.status, "active")));
  response.json(success(members));
});

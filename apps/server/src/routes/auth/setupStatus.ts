import { Router } from "express";
import { getDatabase } from "@/db/database";
import { platformRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { success } from "@/lib/responseFormat";
import { prepareRootSetupToken, rootSetupRequiresToken } from "@/services/authService";

export default Router().get("/", async (request, response) => {
  const [user] = await getDatabase().select({ id: platformRoles.id }).from(platformRoles).where(eq(platformRoles.role, "root")).limit(1);
  if (!user) prepareRootSetupToken(request);
  response.set("Cache-Control", "no-store").json(success({ initialized: Boolean(user), requiresSetupToken: !user && rootSetupRequiresToken(request) }));
});

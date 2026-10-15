import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireRoot } from "@/middleware/authContext";
import { listAdminUsers } from "@/services/billingService";

export default Router().get("/", requireRoot, validateFields({ workspaceId: z.uuid().optional() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listAdminUsers(request.query.workspaceId as string | undefined)));
});

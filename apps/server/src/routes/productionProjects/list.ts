import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth } from "@/middleware/authContext";
import { listProductionProjects } from "@/services/productionProjectService";

export default Router().get("/", requireAuth, validateFields({ workspaceId: z.uuid().optional() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listProductionProjects(request.query.workspaceId as string | undefined)));
});

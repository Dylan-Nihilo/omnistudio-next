import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { requireAuth } from "@/middleware/authContext";
import { listProductionProjectMembers } from "@/services/productionProjectService";

export default Router().get("/", requireAuth, validateFields({ projectId: z.uuid() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listProductionProjectMembers(request.query.projectId as string)));
});

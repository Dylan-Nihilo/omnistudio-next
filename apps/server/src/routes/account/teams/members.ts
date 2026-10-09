import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { listTeamMembers } from "@/services/teamService";

export default Router().get("/", validateFields({ teamId: z.uuid() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listTeamMembers(request.query.teamId as string)));
});

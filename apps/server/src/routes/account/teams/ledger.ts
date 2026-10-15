import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { listTeamMemberLedger } from "@/services/teamService";

export default Router().get("/", validateFields({ teamId: z.uuid(), userId: z.uuid(), limit: z.coerce.number().int().min(1).max(200).optional() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listTeamMemberLedger(request.query.teamId as string, request.query.userId as string, Number(request.query.limit) || 100)));
});

import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { listTeamAssets } from "@/services/teamAssetService";

export default Router().get("/", validateFields({ teamId: z.uuid() }, "query"), async (request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listTeamAssets(request.query.teamId as string)));
});

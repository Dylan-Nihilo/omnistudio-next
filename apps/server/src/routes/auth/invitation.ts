import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { getTeamInvitation } from "@/services/teamService";

export default Router().get("/", validateFields({ token: z.string().min(32).max(200) }, "query"), async (request, response) => {
  const { team, invitation } = await getTeamInvitation(request.query.token as string);
  response.set("Cache-Control", "no-store").json(success({ teamId: team.id, teamName: team.name, email: invitation.email, expiresAt: invitation.expiresAt }));
});

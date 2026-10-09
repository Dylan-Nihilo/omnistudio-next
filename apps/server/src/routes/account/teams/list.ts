import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { listUserTeams } from "@/services/teamService";

export default Router().get("/", async (_request, response) => {
  response.set("Cache-Control", "no-store").json(success(await listUserTeams()));
});

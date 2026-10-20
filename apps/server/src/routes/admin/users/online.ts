import { Router } from "express";
import { requireRoot } from "@/middleware/authContext";
import { success } from "@/lib/responseFormat";
import { getOnlineUsers } from "@/services/presenceService";

export default Router().get("/", requireRoot, async (_request, response) => {
  const result = await getOnlineUsers();
  response.set("Cache-Control", "no-store").json(success(result));
});

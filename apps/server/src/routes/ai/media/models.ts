import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { requireAuth } from "@/middleware/authContext";
import { listMediaModels } from "@/utils/media/generation";

export default Router().get("/", requireAuth, async (_req, res) => {
  res.json(success(await listMediaModels()));
});

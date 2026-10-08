import { Router } from "express";
import { success } from "@/lib/responseFormat";
import u from "@/utils";
import { requireAuth } from "@/middleware/authContext";

export default Router().get("/", requireAuth, async (_req, res) => {
  res.json(success(await u.ai.listAiModels()));
});

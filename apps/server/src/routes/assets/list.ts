import { Router } from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.get("/", async (_req, res) => {
  res.set("Cache-Control", "no-store").json(success({ entries: await u.assets.listAssets() }));
});

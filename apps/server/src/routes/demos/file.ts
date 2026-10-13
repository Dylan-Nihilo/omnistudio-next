import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";

const router = Router();

export default router.get("/", validateFields({ id: z.literal("admissionCounterattack"), kind: z.enum(["cover", "video"]) }, "query"), async (req, res, next) => {
  const path = await u.demos.getMedia(req.query.id as string, req.query.kind as "cover" | "video");
  res.set("Cache-Control", "private, max-age=3600").sendFile(path, err => { if (err) next(err); });
});

import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.post("/", validateFields({ id: z.literal("admissionCounterattack") }), async (req, res) => {
  res.json(success(await u.demos.open(req.body.id)));
});

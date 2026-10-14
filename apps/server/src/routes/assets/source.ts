import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";

const router = Router();

export default router.get("/", validateFields({ userId: z.uuid(), path: z.string().min(1).max(4096), hash: z.string().regex(/^[a-f0-9]{64}$/), expires: z.string().regex(/^\d{13}$/), signature: z.string().regex(/^[a-f0-9]{64}$/) }, "query"), async (req, res, next) => {
  const path = await u.assets.readSource(req.query.userId as string, req.query.path as string, req.query.hash as string, req.query.expires as string, req.query.signature as string);
  res.set({ "Cache-Control": "no-store", "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" })
    .sendFile(path, { dotfiles: "allow" }, err => { if (err) next(err); });
});

import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";

const router = Router();

export default router.get("/", validateFields({
  userId: z.uuid(),
  directory: z.string().min(1).max(4096),
  path: z.string().min(1).max(4096),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mimeType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i).max(128),
  expires: z.string().regex(/^\d{13}$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
}, "query"), async (req, res, next) => {
  const source = await u.assets.readWorkspaceSource(
    req.query.userId as string,
    req.query.directory as string,
    req.query.path as string,
    req.query.hash as string,
    req.query.mimeType as string,
    req.query.expires as string,
    req.query.signature as string,
  );
  res.set({ "Content-Type": source.mimeType, "Cache-Control": "no-store", "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" })
    .sendFile(source.path, { dotfiles: "allow" }, err => { if (err) next(err); });
});

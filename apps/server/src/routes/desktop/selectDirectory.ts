import { realpath } from "node:fs/promises";
import { Router } from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";
import { requireRoot } from "@/middleware/authContext";
import { registerSelectedDirectory } from "@/services/accountService";

const router = Router();

export default router.post("/", requireRoot, async (req, res) => {
  const selected = await u.desktop.getDesktopRuntime(req).selectDirectory();
  const directory = selected ? await registerSelectedDirectory(await realpath(selected)) : null;
  res.json(success({ directory }));
});

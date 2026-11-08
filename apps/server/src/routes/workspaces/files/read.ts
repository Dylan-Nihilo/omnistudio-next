import { lstat, readFile } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.get("/", validateFields({ directory: z.string().min(1).max(4096), path: z.string().max(4096), versioned: z.enum(["true"]).optional() }, "query"), async (req, res, next) => {
  const { path } = await u.workspaceFile.resolveWorkspaceFile(req, req.query.directory as string, req.query.path as string);
  res.set({ "Cache-Control": "no-store", "Content-Security-Policy": "sandbox" });
  if (req.query.versioned === "true") {
    const release = u.workspaceFile.lockWorkspaceFiles([path]);
    try {
      const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
      if (!info) return res.json(success({ content: "", revision: "missing" }));
      if (!info.isFile()) throw Object.assign(new Error("只能读取文件"), { status: 400 });
      if (info.size > 32 * 1024 ** 2) throw Object.assign(new Error("版本化文本文件不能超过 32 MiB"), { status: 413 });
      const content = await readFile(path);
      return res.json(success({ content: content.toString("utf8"), revision: u.workspaceFile.contentRevision(content) }));
    } finally { release(); }
  }
  if (!(await lstat(path)).isFile()) throw Object.assign(new Error("只能读取文件"), { status: 400 });
  res.sendFile(path, { dotfiles: "allow" }, err => { if (err) next(err); });
});

import { lstat, mkdir } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.post("/", validateFields({ directory: z.string().min(1).max(4096), path: z.string().max(4096) }), async (req, res) => {
  const { directory, path } = await u.workspaceFile.resolveWorkspaceFile(req, req.body.directory, req.body.path, true);
  u.workspaceFile.protectWorkspaceRoot(directory, path);
  // ACT: 若目录已存在，保持幂等直接返回，不锁文件也不报 409，从根源消除并发冲突与 EEXIST
  const info = await lstat(path).catch((err: NodeJS.ErrnoException) => (err.code === "ENOENT" ? null : Promise.reject(err)));
  if (info) {
    if (info.isDirectory()) return res.json(success());
    throw Object.assign(new Error("已存在同名文件"), { code: "EEXIST" });
  }
  const release = u.workspaceFile.lockWorkspaceFiles([path]);
  try {
    await mkdir(path, { recursive: true });
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error?.code === "EEXIST") {
      const existing = await lstat(path).catch(() => null);
      if (existing?.isDirectory()) return res.json(success());
    }
    throw err;
  } finally {
    release();
  }
  res.json(success());
});

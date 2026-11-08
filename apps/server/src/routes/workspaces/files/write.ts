import { lstat } from "node:fs/promises";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.put("/", validateFields({
  directory: z.string().min(1).max(4096), path: z.string().max(4096), exclusive: z.enum(["true", "false"]).optional(),
  expectedRevision: z.string().regex(/^(missing|[a-f0-9]{64})$/).optional(),
}, "query"), async (req, res) => {
  if (!req.is("application/octet-stream") || (req.body !== undefined && !Buffer.isBuffer(req.body))) {
    throw Object.assign(new Error("请发送文件原始内容"), { status: 400 });
  }
  const { directory, path } = await u.workspaceFile.resolveWorkspaceFile(req, req.query.directory as string, req.query.path as string);
  u.workspaceFile.protectWorkspaceRoot(directory, path);
  const release = u.workspaceFile.lockWorkspaceFiles([path]);
  const content = req.body ?? Buffer.alloc(0);
  try {
    if (req.query.expectedRevision !== undefined) {
      if (content.length > 32 * 1024 ** 2) throw Object.assign(new Error("版本化文本文件不能超过 32 MiB"), { status: 413 });
      const current = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
      if (current && (!current.isFile() || current.size > 32 * 1024 ** 2)) throw Object.assign(new Error("版本化文本文件不能超过 32 MiB"), { status: 413 });
      if (await u.workspaceFile.workspaceFileRevision(path) !== req.query.expectedRevision) {
        throw Object.assign(new Error("项目已被其他窗口修改，当前编辑已保留，请重新打开项目后再保存"), { status: 409, code: "REVISION_CONFLICT" });
      }
    }
    await u.workspaceFile.writeWorkspaceFile(path, content, req.query.exclusive === "true" || req.query.expectedRevision === "missing");
  }
  finally { release(); }
  res.json(success(req.query.expectedRevision === undefined ? undefined : { revision: u.workspaceFile.contentRevision(content) }));
});

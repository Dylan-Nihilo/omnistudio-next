import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  directory: z.string().min(1).max(4096),
  path: z.string().min(1).max(4096),
  size: z.string().regex(/^(0|[1-9]\d*)$/).refine(value => Number(value) <= u.workspaceFile.maxUploadBytes, "单个文件不能超过 8 GiB"),
}, "query"), async (req, res) => {
  if (!req.is("application/octet-stream")) throw Object.assign(new Error("请发送文件原始内容"), { status: 400 });
  const size = Number(req.query.size);
  if (req.get("content-length") !== undefined && Number(req.get("content-length")) !== size) {
    throw Object.assign(new Error("上传内容与声明的文件大小不一致"), { status: 400 });
  }
  const { directory, path } = await u.workspaceFile.resolveWorkspaceFile(req, req.query.directory as string, req.query.path as string);
  u.workspaceFile.protectWorkspaceRoot(directory, path);
  const release = u.workspaceFile.lockWorkspaceFiles([path]);
  const controller = new AbortController();
  const abort = () => { if (!res.writableFinished) controller.abort(); };
  req.once("aborted", abort);
  res.once("close", abort);
  try {
    if (req.aborted || res.destroyed) controller.abort();
    await u.workspaceFile.uploadWorkspaceFile(path, req, size, controller.signal);
    res.json(success());
  } finally {
    req.off("aborted", abort);
    res.off("close", abort);
    release();
  }
});

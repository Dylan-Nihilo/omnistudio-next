import { resolve } from "node:path";
import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { error, success } from "@/lib/responseFormat";

const router = Router();

export default router.put("/", validateFields({ name: u.plugins.toolNameSchema, config: z.record(z.string(), z.json()) }), async (req, res) => {
  if (req.authContext?.user.isRoot !== true) return res.status(403).json(error("请在桌面端或服务器本机管理工具", null, 403));
  const { name, config } = req.body;
  const release = u.workspaceFile.lockWorkspaceFiles([resolve(u.plugins.toolsDirectory, `${name}.tool.js`)]);
  try {
    const parsed = await u.plugins.saveToolConfig(name, config);
    res.json(success(parsed, "工具配置已保存"));
  } finally { release(); }
});

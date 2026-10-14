import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.put("/", validateFields({ path: z.string().min(1).max(4096) }, "query"), async (req, res) => {
  if (!req.is("application/octet-stream") || (req.body !== undefined && !Buffer.isBuffer(req.body))) {
    throw Object.assign(new Error("请发送文件原始内容"), { status: 400 });
  }
  const asset = await u.assets.saveAsset(req.query.path as string, req.body ?? Buffer.alloc(0), `${req.protocol}://${req.get("host")}`);
  res.status(201).json(success(asset, "已提交字节素材入库，审核完成后可使用"));
});

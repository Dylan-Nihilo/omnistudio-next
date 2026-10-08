import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { error } from "@/lib/responseFormat";

export default Router().post("/", validateFields({ source: z.string().min(1).max(2 * 1024 * 1024) }), async (_req, res) => {
  res.status(403).json(error("媒体供应商由平台统一管理，用户不能添加供应商", null, 403));
});

import { Router } from "express";
import { validateFields } from "@/lib/middleware";
import { error } from "@/lib/responseFormat";
import { z } from "zod";

export default Router().post("/", validateFields({ source: z.string().min(1) }), async (_req, res) => {
  res.status(403).json(error("平台供应商不支持客户端调试或上传", null, 403));
});

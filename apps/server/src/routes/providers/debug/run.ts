import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { error } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  source: z.string().min(1),
  request: z.record(z.string(), z.json()),
}), async (_req, res) => {
  res.status(403).json(error("平台供应商不支持客户端调试或上传", null, 403));
});

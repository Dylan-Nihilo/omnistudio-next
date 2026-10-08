import { Router } from "express";
import { error } from "@/lib/responseFormat";

export default Router().get("/", async (_req, res) => {
  res.status(403).json(error("媒体供应商由平台统一管理，请使用平台模型目录接口", null, 403));
});

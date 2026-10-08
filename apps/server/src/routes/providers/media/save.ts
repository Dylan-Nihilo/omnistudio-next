import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { error } from "@/lib/responseFormat";

export default Router().put("/", validateFields({
  fileName: u.mediaProvider.mediaProviderFileSchema,
  models: u.mediaProvider.mediaModelsSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
}), async (_req, res) => {
  res.status(403).json(error("媒体模型由平台统一管理，用户不能修改供应商", null, 403));
});

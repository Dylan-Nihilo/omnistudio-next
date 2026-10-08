import { Router } from "express";
import { z } from "zod";
import { error } from "@/lib/responseFormat";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  fileName: u.mediaProvider.mediaProviderFileSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
}), async (_req, res) => {
  res.status(403).json(error("媒体模型由平台统一管理，用户不能刷新供应商模型列表", null, 403));
});

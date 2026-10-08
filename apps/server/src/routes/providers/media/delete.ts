import { Router as createRouter } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { error } from "@/lib/responseFormat";

export default createRouter().delete("/", validateFields({
  fileName: u.mediaProvider.mediaProviderFileSchema,
  revision: z.string().regex(/^[a-f0-9]{64}$/),
}), async (_req, res) => {
  res.status(403).json(error("媒体供应商由平台统一管理，用户不能删除供应商", null, 403));
});

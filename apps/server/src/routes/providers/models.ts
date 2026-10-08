import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { error } from "@/lib/responseFormat";

export default Router().post("/", validateFields({
  apiUrl: z.url().refine(value => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash;
  }, "请填写不含查询参数的 HTTP API 基础地址"),
  protocol: z.enum(["openai-completions", "openai-responses", "anthropic-messages"]),
  apiKey: z.string().max(8192),
}), async (_req, res) => {
  res.status(403).json(error("模型由平台统一管理，用户不能提交供应商地址或 API Key", null, 403));
});

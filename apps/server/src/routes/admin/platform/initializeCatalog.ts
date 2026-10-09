import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { initializePlatformCatalog } from "@/services/platformService";

export default Router().post("/", async (_request, response) => {
  await initializePlatformCatalog();
  response.json(success(null, "内置模型目录已添加，已有配置保留"));
});

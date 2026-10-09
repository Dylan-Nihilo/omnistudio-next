import { Router } from "express";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { modelInputSchema, savePlatformModel } from "@/services/platformService";

export default Router().put("/", validateFields(modelInputSchema), async (request, response) => {
  await savePlatformModel(modelInputSchema.parse(request.body));
  response.json(success(null, "模型配置已保存"));
});

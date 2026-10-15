import { Router } from "express";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { defaultModelsInputSchema, savePlatformDefaultModels } from "@/services/platformService";

export default Router().put("/", validateFields(defaultModelsInputSchema), async (request, response) => {
  await savePlatformDefaultModels(defaultModelsInputSchema.parse(request.body));
  response.json(success(null, "默认模型配置已保存"));
});

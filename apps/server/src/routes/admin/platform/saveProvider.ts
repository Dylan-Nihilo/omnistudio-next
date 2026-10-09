import { Router } from "express";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { providerInputSchema, savePlatformProvider } from "@/services/platformService";

export default Router().put("/", validateFields(providerInputSchema), async (request, response) => {
  await savePlatformProvider(providerInputSchema.parse(request.body));
  response.json(success(null, "API 配置已保存"));
});

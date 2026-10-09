import { Router } from "express";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { pricesInputSchema, publishPlatformPrices } from "@/services/platformService";

export default Router().post("/", validateFields(pricesInputSchema), async (request, response) => {
  response.json(success(await publishPlatformPrices(pricesInputSchema.parse(request.body)), "新价格已发布"));
});

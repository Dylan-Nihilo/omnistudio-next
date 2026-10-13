import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { deletePlatformProvider } from "@/services/platformService";

const inputSchema = z.strictObject({ providerId: z.string().regex(/^[a-z][a-zA-Z0-9]{0,99}$/) });

export default Router().delete("/", validateFields(inputSchema), async (request, response) => {
  await deletePlatformProvider(inputSchema.parse(request.body).providerId);
  response.json(success(null, "API 提供方已删除"));
});

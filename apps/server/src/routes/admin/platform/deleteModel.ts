import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { deletePlatformModel } from "@/services/platformService";

const inputSchema = z.strictObject({ id: z.uuid() });

export default Router().delete("/", validateFields(inputSchema), async (request, response) => {
  await deletePlatformModel(inputSchema.parse(request.body).id);
  response.json(success(null, "模型已删除"));
});

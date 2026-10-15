import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { listPlatformModels } from "@/services/modelService";
import { getPlatformDefaultModels } from "@/services/platformService";

export default Router().get("/", async (_request, response) => {
  const models = await listPlatformModels();
  response.json(success({
    mediaTypes: [...new Set(models.map(model => model.mediaType))],
    models,
    defaultModels: getPlatformDefaultModels(),
  }));
});

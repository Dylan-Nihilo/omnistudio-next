import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { readTeamAsset } from "@/services/teamAssetService";

export default Router().get("/", validateFields({ id: z.uuid() }, "query"), async (request, response, next) => {
  const { asset, path } = await readTeamAsset(request.query.id as string);
  response.attachment(asset.name).type(asset.mimeType).set({ "Cache-Control": "no-store", "Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff" }).sendFile(path, error => { if (error) next(error); });
});

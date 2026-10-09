import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { getPlatformConfiguration } from "@/services/platformService";

export default Router().get("/", async (_request, response) => {
  response.set("Cache-Control", "no-store").json(success(await getPlatformConfiguration()));
});

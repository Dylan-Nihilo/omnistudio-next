import { Router } from "express";
import { deploymentStatus } from "@/lib/deployment";
import { success } from "@/lib/responseFormat";

export default Router().get("/", (request, response) => {
  response.set("Cache-Control", "no-store").json(success(deploymentStatus(request)));
});

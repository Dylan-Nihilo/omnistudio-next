import { Router } from "express";
import { verifyAndSettleRechargeNotification } from "@/services/rechargeService";

export default Router().post("/", async (request, response) => {
  await verifyAndSettleRechargeNotification({ paymentMethod: "alipay", headers: request.headers, body: request.body, rawBody: request.rawBody?.toString("utf8") ?? "" });
  response.type("text/plain").send("success");
});

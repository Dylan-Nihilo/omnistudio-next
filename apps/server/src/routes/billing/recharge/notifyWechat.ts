import { Router } from "express";
import { verifyAndSettleRechargeNotification } from "@/services/rechargeService";

export default Router().post("/", async (request, response) => {
  await verifyAndSettleRechargeNotification({ paymentMethod: "wechat", headers: request.headers, body: request.body, rawBody: request.rawBody?.toString("utf8") ?? "" });
  response.json({ code: "SUCCESS", message: "成功" });
});

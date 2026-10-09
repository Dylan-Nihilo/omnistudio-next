import { Router } from "express";
import { z } from "zod";
import u from "@/utils";
import { validateFields } from "@/lib/middleware";
import { getAccountSignal, requireAccount } from "@/utils/accountContext";

export default Router().get("/", validateFields({ connectionId: z.uuid() }, "query"), async (req, res) => {
  const service = await u.mcpControl.assertControlRequest(req);
  const signals = [getAccountSignal(service.user.id, service.id)];
  const accountSignal = requireAccount().signal;
  if (accountSignal) signals.push(accountSignal);
  u.mcpControl.connectControl(req.query.connectionId as string, res, AbortSignal.any(signals));
});

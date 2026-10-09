import u from "@/utils";
import { Router } from "express";
import { success } from "@/lib/responseFormat";
import { platformConfig } from "@/utils/conf";

const router = Router();

export default router.get("/", (req, res) => {
  u.mcpControl.assertAppRequest(req);
  res.set("Cache-Control", "no-store");
  const settings = u.conf.get("settings", {});
  const port = (platformConfig.get("settings", {}).mcp as { port?: number } | undefined)?.port ?? 10588;
  res.json(success({ ...settings, mcp: { ...(settings.mcp && typeof settings.mcp === "object" ? settings.mcp : {}), port } }));
});

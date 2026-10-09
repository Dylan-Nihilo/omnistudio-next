import { Router } from "express";
import u from "@/utils";
import { success } from "@/lib/responseFormat";

const router = Router();

export default router.get("/", async (req, res) => {
  const canManage = req.authContext?.user.isRoot === true;
  const tools = await u.plugins.listTools();
  res.json(success({ tools: tools.map(tool => ({ ...tool, config: canManage ? u.plugins.publicToolConfig(tool, tool.config) : {}, configRules: canManage ? tool.configRules : [] })), canManage }));
});

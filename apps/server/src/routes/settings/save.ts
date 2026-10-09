import u from "@/utils";
import { Router } from "express";
import { z } from "zod";
import { validateFields } from "@/lib/middleware";
import { success } from "@/lib/responseFormat";
import { maxSystemPromptLength } from "@/agent/runtime/prompt";
import { requireAuth, requireCsrf } from "@/middleware/authContext";
import { synchronizeServiceCredentials } from "@/services/accountService";
import { getAccountConfig, platformConfig } from "@/utils/conf";

const router = Router();

export default router.put("/", requireAuth, requireCsrf, validateFields({ settings: z.record(z.string(), z.json()).and(z.object({
  agentSystemPrompt: z.string().max(maxSystemPromptLength, `系统提示词不能超过 ${maxSystemPromptLength} 个字符`).optional(),
  desktopUpdateSource: z.enum(["official", "github", "custom"]).optional(),
  desktopUpdateCustomUrl: z.string().max(2048).refine(value => !value || u.desktop.isValidUpdateUrl(value),
    "自定义更新源必须是不含账号、查询参数或锚点的 HTTP(S) 地址").optional(),
  mcp: z.object({ enabled: z.boolean().optional(), token: z.string().optional(), port: z.number().int().min(1).max(65535).optional() }).optional(),
})).refine(value => value.desktopUpdateSource !== "custom" || !!value.desktopUpdateCustomUrl, {
  path: ["desktopUpdateCustomUrl"], message: "选择自定义更新源前，请先填写有效地址",
}) }), async (req, res) => {
  u.mcpControl.assertAppRequest(req);
  const { settings } = req.body;
  const release = u.workspaceFile.lockWorkspaceFiles([getAccountConfig().path]);
  try {
    u.removeLegacySettings(settings);
    const previous = u.conf.get("settings", {});
    const platformPort = (platformConfig.get("settings", {}).mcp as { port?: number } | undefined)?.port ?? 10588;
    if (!req.authContext?.user.isRoot && settings.mcp?.port !== undefined && settings.mcp.port !== platformPort) throw Object.assign(new Error("只有 root 可以修改服务监听端口"), { status: 403 });
    u.conf.set("settings", settings);
    try { await synchronizeServiceCredentials(); }
    catch (error) { u.conf.set("settings", previous); throw error; }
    if (req.authContext?.user.isRoot && settings.mcp?.port !== undefined) platformConfig.set("settings.mcp.port", settings.mcp.port);
    await u.mcpRuntime.reloadMcpRuntime();
    res.json(success(null, "设置已保存"));
  } finally { release(); }
});

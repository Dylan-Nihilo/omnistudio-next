import logger from "morgan";
import express from "express";
import cors from "cors";
import { resolve } from "node:path";
import { mkdir, realpath } from "node:fs/promises";
import type { Request, Response, NextFunction } from "express";
import buildRoute from "@/core";
import { error } from "@/lib/responseFormat";
import { isRootOperation } from "@/lib/accessPolicy";
import desktopRequest from "@/lib/desktop";
import initializePlugins from "@/utils/plugins/initialize";
import { acquireServerLease, checkDatabase, hasServerLease, runSqlMigrations } from "@/db/database";

export async function createApp({
  webRoot,
  dataDirectory,
  toolsRoot,
  nodesRoot,
  providersRoot,
  skillsRoot,
  agentsRoot,
  pluginRevision,
}: {
  webRoot: string;
  dataDirectory?: string;
  toolsRoot?: string;
  nodesRoot?: string;
  providersRoot?: string;
  skillsRoot?: string;
  agentsRoot?: string;
  pluginRevision?: string;
}) {
  // conf 由下方的路由动态加载，必须先确定整个进程共用的数据目录。
  if (dataDirectory) {
    await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
    dataDirectory = await realpath(dataDirectory);
    process.env.OMNISTUDIO_NEXT_DATA_DIR = dataDirectory;
  }
  await acquireServerLease();
  if (dataDirectory && toolsRoot)
    await initializePlugins(resolve(dataDirectory, "tools"), toolsRoot, /^[a-z][a-zA-Z0-9]*\.tool\.js$/, pluginRevision);
  if (dataDirectory && nodesRoot) await initializePlugins(resolve(dataDirectory, "nodes"), nodesRoot, /^[a-z][a-zA-Z0-9]*\.umd\.js$/, pluginRevision);
  // 平台供应商属于服务端可信代码，运行时不读取数据目录中的用户可编辑副本。
  if (providersRoot) process.env.OMNISTUDIO_NEXT_PROVIDERS_DIR = resolve(providersRoot, "media");
  if (dataDirectory && skillsRoot) await initializePlugins(resolve(dataDirectory, "skills"), skillsRoot);
  if (dataDirectory && agentsRoot) await initializePlugins(resolve(dataDirectory, "agents"), agentsRoot);
  const app = express();

  await runSqlMigrations();
  await checkDatabase();
  const { recoverGenerationReservations } = await import("@/services/billingService");
  await recoverGenerationReservations();
  const { initializeAccountSpaces } = await import("@/services/accountService");
  await initializeAccountSpaces();

  if (process.env.NODE_ENV === "dev") {
    await buildRoute();
    logger.token("safeUrl", request => (request.url ?? "").replace(/([?&](?:token|apiKey|secret)=)[^&]*/gi, "$1[REDACTED]"));
    app.use(logger(":method :safeUrl :status :response-time ms - :res[content-length]"));
  }
  const { attachAuthContext, requireRoot } = await import("@/middleware/authContext");
  app.use(cors({ origin: false }));
  app.use((request, response, next) => {
    if (/^\/(api|mcp|a2a)(\/|$)/.test(request.path) && !hasServerLease()) return response.status(503).json(error("服务连接已中断，请稍后重试", null, 503));
    next();
  });
  app.use(attachAuthContext);
  app.use("/api", async (request, response, next) => {
    const writing = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    const origin = request.get("origin");
    if (writing && origin && origin !== `${request.protocol}://${request.get("host")}`) return response.status(403).json(error("不允许跨来源操作", null, 403));
    const publicPath = /^\/auth\/(setupStatus|setup|login|register|invitation)$/.test(request.path) || request.path === "/desktop/ready";
    if (publicPath) return next();
    if (!request.authContext || request.authContext.serviceKind) return response.status(401).json(error("请先登录", null, 401));
    const expectedAccount = request.get("x-account-id") ?? request.query.accountId;
    if (request.path !== "/auth/me" && expectedAccount && expectedAccount !== request.authContext.user.id) return response.status(409).json(error("账户已切换，请重新登录原账户后恢复编辑", { reason: "accountChanged" }, 409));
    if (writing) {
      const { csrfMatches } = await import("@/services/authService");
      if (!await csrfMatches(request, request.authContext)) return response.status(403).json(error("CSRF 校验失败，请刷新页面后重试", null, 403));
    }
    const rootOnly = isRootOperation(request.method, request.path);
    if (rootOnly) return requireRoot(request, response, next);
    next();
  });
  app.use(["/mcp", "/a2a"], (request, response, next) => {
    if (!request.authContext?.serviceKind) return response.status(401).json(error("服务凭证无效", null, 401));
    const origin = request.get("origin");
    if (origin && origin !== `${request.protocol}://${request.get("host")}`) return response.status(403).json(error("不允许跨来源访问服务", null, 403));
    next();
  });
  app.use("/a2a", express.json({ limit: "2mb" }));
  app.use(["/api/workspaces/files/write", "/api/assets/save", "/api/account/teamAssets/upload"], express.raw({ type: "application/octet-stream", limit: "100mb" }));
  app.use(express.json({ limit: "100mb" }));
  app.use(express.urlencoded({ extended: true, limit: "100mb" }));
  app.use("/api/desktop", desktopRequest);

  const { default: initializeProviderModels } = await import("@/utils/ai/initialize");
  await initializeProviderModels();
  const router = await import("@/router");
  router.default(app);
  const [{ createMcpRouter }, { getMcpTools }, { authorizeMcp }, { skillResources }] = await Promise.all([
    import("@omnistudio-next/mcp"),
    import("@/utils/mcp/tools"),
    import("@/utils/mcp/control"),
    import("@/utils/mcp/resources"),
  ]);
  app.use("/mcp", createMcpRouter({ getTools: getMcpTools, authorize: authorizeMcp, subject: request => request.authContext?.user.id ?? "", resources: skillResources }));
  const { createA2aRouter } = await import("@/agent/a2a");
  app.use("/a2a", createA2aRouter());
  app.use(express.static(webRoot));

  // 错误处理
  app.use((err: Error & { status?: number }, request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) return next(err);
    const code = (err as NodeJS.ErrnoException).code ?? (err.cause as NodeJS.ErrnoException | undefined)?.code;
    const status = err.status || ({ ENOENT: 404, ENOTDIR: 404, EEXIST: 409, ENOTEMPTY: 409, EACCES: 403, EPERM: 403, ER_DUP_ENTRY: 409 }[code ?? ""] ?? 500);
    console.error("请求处理失败", err);
    const message =
      {
        ENOENT: "找不到这个文件或文件夹，可能已被移动、删除，或者位置选错了。",
        ENOTDIR: "你选中的是文件，但这里需要选择文件夹。请重新选择。",
        EEXIST: "这个名称已经被占用了，请换一个名称。原来的内容不会被覆盖。",
        ENOTEMPTY: "这个文件夹里还有内容，不能直接删除。请先清空或移走里面的文件。",
        EACCES: "没有权限访问这个文件或文件夹。请检查权限，或换一个位置重试。",
        EPERM: "系统不允许这次操作。文件可能正在被其他程序使用，请关闭后重试。",
        EISDIR: "你选中的是文件夹，但这里需要的是文件。请重新选择具体文件。",
        ER_DUP_ENTRY: "这个记录已存在，请刷新后重试。",
      }[code ?? ""] ?? (status === 413 ? "文件或请求内容过大，请缩小后重试。" : err.message || "操作失败，请稍后重试。");
    response.status(status).json(error(message, code ? { code } : null, status));
  });

  return app;
}

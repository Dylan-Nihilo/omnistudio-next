import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextFunction, Request, Response } from "express";
import { error } from "@/lib/responseFormat";

type DeploymentActivity = { token: string; references: number };
const activities = new Map<string, DeploymentActivity>();
const activityContext = new AsyncLocalStorage<DeploymentActivity>();
const continuationPaths = new Set(["/api/agent/cancel", "/api/agent/answer", "/api/agent/canvasresult", "/api/mcp/control/result", "/api/mcp/control/state", "/api/ffmpeg/cancel", "/api/auth/logout"]);
const readableMcpMethods = new Set(["initialize", "ping", "tools/list", "resources/list", "resources/templates/list", "resources/read", "prompts/list", "prompts/get", "notifications/initialized", "notifications/cancelled", "notifications/progress"]);
const readableA2aMethods = new Set(["GetTask", "ListTasks", "SubscribeToTask", "CancelTask", "GetExtendedAgentCard", "GetTaskPushNotificationConfig", "ListTaskPushNotificationConfigs"]);

function maintenanceToken() {
  const directory = process.env.OMNISTUDIO_NEXT_DATA_DIR;
  if (!directory) return null;
  try { return readFileSync(resolve(directory, "deploymentMaintenance"), "utf8").trim(); }
  catch (caught) { if ((caught as NodeJS.ErrnoException).code === "ENOENT") return null; throw caught; }
}

function isLoopback(request: Request) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "");
}

function rpcIsReadable(body: unknown, methods: Set<string>): boolean {
  if (Array.isArray(body)) return body.length > 0 && body.every(item => rpcIsReadable(item, methods));
  if (!body || typeof body !== "object") return false;
  const message = body as Record<string, unknown>;
  return typeof message.method === "string" ? methods.has(message.method) : "id" in message && ("result" in message || "error" in message);
}

function releaseActivity(activity: DeploymentActivity) {
  if (--activity.references === 0) activities.delete(activity.token);
}

export function retainDeploymentActivity() {
  const activity = activityContext.getStore();
  if (!activity) return () => {};
  activity.references++;
  activities.set(activity.token, activity);
  let released = false;
  return () => { if (!released) { released = true; releaseActivity(activity); } };
}

export function deploymentContinuationHeaders(): Record<string, string> {
  const activity = activityContext.getStore();
  return activity && activities.has(activity.token) ? { "X-Deployment-Continuation": activity.token } : {};
}

export function deploymentStatus(request: Request) {
  const expected = maintenanceToken();
  if (expected === null) throw Object.assign(new Error("部署状态不存在"), { status: 404 });
  const actual = request.get("x-deployment-token") ?? "";
  if (!isLoopback(request) || !/^[a-f0-9]{32}$/.test(expected) || !/^[a-f0-9]{32}$/.test(actual) || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) throw Object.assign(new Error("部署状态访问被拒绝"), { status: 403 });
  return { activeRequests: activities.size, maintenance: true };
}

export function deploymentMiddleware(request: Request, response: Response, next: NextFunction) {
  const path = request.path.replace(/\/+$/, "").toLowerCase();
  if (!/^\/(api|mcp|a2a)(\/|$)/.test(path) || path === "/api/deployment/status") return next();
  const writing = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  const protocol = /^\/(mcp|a2a)(\/|$)/.test(path);
  const readableRpc = protocol && request.method === "POST" && rpcIsReadable(request.body, path.startsWith("/mcp") ? readableMcpMethods : readableA2aMethods);
  const mutating = writing && !readableRpc || ["/api/agent", "/api/workspaces/check"].includes(path);
  if (!mutating) return next();
  const continuation = continuationPaths.has(path)
    || path === "/api/ffmpeg/execute" && request.body?.operation?.method === "cancel"
    || protocol && (readableRpc || request.method === "DELETE")
    || isLoopback(request) && activities.has(request.get("x-deployment-continuation") ?? "");
  // ACT: 同步读取门闩后立即计数，不跨 await，避免排空检查与新请求接收之间的竞态。
  if (maintenanceToken() !== null && !continuation) return response.status(503).set("Retry-After", "30").json(error("系统正在部署，请稍后重试", null, 503));
  const activity = { token: randomBytes(16).toString("hex"), references: 1 };
  activities.set(activity.token, activity);
  let finished = false;
  const timeoutId = setTimeout(() => {
    if (!finished) finish();
  }, 300_000);
  timeoutId.unref();
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeoutId);
    response.off("finish", finish);
    response.off("close", finish);
    releaseActivity(activity);
  };
  response.once("finish", finish);
  response.once("close", finish);
  activityContext.run(activity, next);
}

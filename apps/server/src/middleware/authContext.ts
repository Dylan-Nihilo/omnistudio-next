import type { NextFunction, Request, Response } from "express";
import { error } from "@/lib/responseFormat";
import { csrfMatches, getServiceSession, getSession, type AuthSession } from "@/services/authService";
import { accountContext, getAccountSignal } from "@/utils/accountContext";
import { hashSecret, serverSignal } from "@/db/database";

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthSession | null;
    }
  }
}

export async function attachAuthContext(request: Request, _response: Response, next: NextFunction) {
  request.authContext = /^\/(mcp|a2a)(\/|$)/.test(request.path)
    ? await getServiceSession(request, request.path.startsWith("/mcp") ? "mcp" : "a2a") : await getSession(request);
  const account = request.authContext?.user;
  if (account) accountContext.run({ userId: account.id, isRoot: account.isRoot, signal: AbortSignal.any([getAccountSignal(account.id, request.authContext!.id), serverSignal]), generationKey: request.get("idempotency-key") ? hashSecret(request.get("idempotency-key")!) : undefined }, next);
  else next();
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  if (request.authContext === undefined) request.authContext = await getSession(request);
  if (!request.authContext) {
    response.status(401).json(error("请先登录", null, 401));
    return;
  }
  next();
}

export function requireRoot(request: Request, response: Response, next: NextFunction) {
  if (!request.authContext?.user.isRoot) {
    response.status(403).json(error("需要 root 权限", null, 403));
    return;
  }
  next();
}

export async function requireCsrf(request: Request, response: Response, next: NextFunction) {
  if (!request.authContext || !(await csrfMatches(request, request.authContext))) {
    response.status(403).json(error("CSRF 校验失败，请刷新页面后重试", null, 403));
    return;
  }
  next();
}

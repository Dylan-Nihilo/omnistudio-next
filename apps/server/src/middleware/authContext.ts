import type { NextFunction, Request, Response } from "express";
import { error } from "@/lib/responseFormat";
import { csrfMatches, getSession, type AuthSession } from "@/services/authService";

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthSession | null;
    }
  }
}

export async function attachAuthContext(request: Request, _response: Response, next: NextFunction) {
  request.authContext = await getSession(request);
  next();
}

export async function requireAuth(request: Request, response: Response, next: NextFunction) {
  request.authContext = await getSession(request);
  if (!request.authContext) {
    response.status(401).json(error("请先登录", null, 401));
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

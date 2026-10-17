import type { NextFunction, Request, Response } from "express";
import { error } from "@/lib/responseFormat";

type ConcurrencyName = "agent" | "media" | "ffmpeg" | "upload";

type ConcurrencyState = {
  active: number;
  limit: number;
};

const states = new Map<ConcurrencyName, ConcurrencyState>();

function configuredLimit(name: ConcurrencyName, fallback: number) {
  const value = Number(process.env[`OMNISTUDIO_NEXT_${name.toUpperCase()}_CONCURRENCY`]);
  return Number.isSafeInteger(value) && value > 0 && value <= 1000 ? value : fallback;
}

function stateFor(name: ConcurrencyName) {
  const current = states.get(name);
  if (current) return current;
  const fallback = name === "agent" ? 8 : name === "media" ? 4 : name === "ffmpeg" ? 2 : 8;
  const state = { active: 0, limit: configuredLimit(name, fallback) };
  states.set(name, state);
  return state;
}

export function acquireConcurrency(name: ConcurrencyName) {
  const state = stateFor(name);
  if (state.active >= state.limit) {
    const labels = { agent: "Agent", media: "媒体生成", ffmpeg: "FFmpeg", upload: "文件上传" };
    throw Object.assign(new Error(`${labels[name]}任务当前繁忙，请稍后重试`), { status: 429, retryAfter: 5 });
  }
  state.active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.active = Math.max(0, state.active - 1);
  };
}

export function concurrencyMiddleware(name: ConcurrencyName) {
  return (_request: Request, response: Response, next: NextFunction) => {
    let release: (() => void) | undefined;
    try { release = acquireConcurrency(name); }
    catch (caught) {
      const err = caught as Error & { status?: number; retryAfter?: number };
      const status = err.status ?? 429;
      if (typeof err.retryAfter === "number" && err.retryAfter > 0) response.set("Retry-After", String(err.retryAfter));
      response.status(status).json(error(err.message, null, status));
      return;
    }
    response.once("finish", release);
    response.once("close", release);
    next();
  };
}

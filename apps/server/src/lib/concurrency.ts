import type { NextFunction, Request, Response } from "express";
import { error } from "@/lib/responseFormat";

type ConcurrencyName = "agent" | "media" | "ffmpeg" | "upload";

type ConcurrencyState = {
  active: number;
  limit: number;
  waiters: ConcurrencyWaiter[];
};

type ConcurrencyWaiter = {
  resolve: (release: () => void) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

const states = new Map<ConcurrencyName, ConcurrencyState>();

function configuredLimit(name: ConcurrencyName, fallback: number) {
  const value = Number(process.env[`OMNISTUDIO_NEXT_${name.toUpperCase()}_CONCURRENCY`]);
  return Number.isSafeInteger(value) && value > 0 && value <= 1000 ? value : fallback;
}

function stateFor(name: ConcurrencyName) {
  const current = states.get(name);
  if (current) return current;
  const fallback = name === "agent" ? 8 : name === "media" ? 20 : name === "ffmpeg" ? 2 : 8;
  const state = { active: 0, limit: configuredLimit(name, fallback), waiters: [] };
  states.set(name, state);
  return state;
}

function abortReason(signal?: AbortSignal) {
  return signal?.reason ?? Object.assign(new Error("操作已取消"), { name: "AbortError" });
}

function createRelease(state: ConcurrencyState) {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.active = Math.max(0, state.active - 1);
    while (state.active < state.limit && state.waiters.length) {
      const waiter = state.waiters.shift()!;
      waiter.signal?.removeEventListener("abort", waiter.onAbort!);
      if (waiter.signal?.aborted) {
        waiter.reject(abortReason(waiter.signal));
        continue;
      }
      state.active++;
      waiter.resolve(createRelease(state));
    }
  };
}

export function acquireConcurrency(name: ConcurrencyName) {
  const state = stateFor(name);
  if (state.active >= state.limit) {
    const labels = { agent: "Agent", media: "媒体生成", ffmpeg: "FFmpeg", upload: "文件上传" };
    throw Object.assign(new Error(`${labels[name]}任务当前繁忙，请稍后重试`), { status: 429, retryAfter: 5 });
  }
  state.active++;
  return createRelease(state);
}

export function waitForConcurrency(name: ConcurrencyName, signal?: AbortSignal) {
  const state = stateFor(name);
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  if (state.active < state.limit) {
    state.active++;
    return Promise.resolve(createRelease(state));
  }
  return new Promise<() => void>((resolve, reject) => {
    const waiter: ConcurrencyWaiter = { resolve, reject, signal };
    const onAbort = () => {
      const index = state.waiters.indexOf(waiter);
      if (index >= 0) state.waiters.splice(index, 1);
      reject(abortReason(signal));
    };
    waiter.onAbort = onAbort;
    signal?.addEventListener("abort", onAbort, { once: true });
    state.waiters.push(waiter);
  });
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

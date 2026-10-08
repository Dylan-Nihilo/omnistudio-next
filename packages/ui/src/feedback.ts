import { inject, isVNode, shallowReactive, shallowRef } from "vue";
import type { InjectionKey } from "vue";
import type { UiContent, UiTone } from "./types";

export type UiToastOptions = { grouping?: boolean; message?: UiContent; title?: string; tone?: UiTone; duration?: number; showClose?: boolean; onClose?: () => void };
export type UiToast = UiToastOptions & { id: number; message: UiContent; kind: "message" | "notification"; origin?: HTMLElement; repeatCount: number };
export type UiToastHandle = { close: () => void; update: (options: Partial<UiToastOptions>) => void };
export type UiBoxOptions = { confirmButtonText?: string; cancelButtonText?: string; closeOnClickModal?: boolean; closeOnPressEscape?: boolean; inputValue?: string; inputPlaceholder?: string; inputType?: "text" | "password"; inputPattern?: RegExp; inputValidator?: (value: string) => boolean | string | Promise<boolean | string>; inputErrorMessage?: string; danger?: boolean };
export type UiBox = UiBoxOptions & { id: number; message: UiContent; title: string; kind: "confirm" | "prompt" | "alert"; origin?: HTMLElement };
export type UiCancelledError = Error & { reason: "cancel" | "close" };
export function isUiCancelledError(error: unknown): error is UiCancelledError { return error instanceof Error && error.name === "UiCancelledError"; }
function cancelled(reason: "cancel" | "close"): UiCancelledError { return Object.assign(new Error(reason), { name: "UiCancelledError", reason }); }

export function createUiFeedback() {
  const toasts = shallowReactive<UiToast[]>([]);
  const box = shallowRef<UiBox>();
  const queue: { box: UiBox; resolve: (value: unknown) => void; reject: (error: Error) => void }[] = [];
  const timers = new Map<number, { timer?: ReturnType<typeof setTimeout>; remaining: number; expires: number }>();
  let active: typeof queue[number] | undefined;
  let sequence = 0;
  function origin() { return typeof document !== "undefined" && document.activeElement instanceof HTMLElement ? document.activeElement : undefined; }
  function close(id: number) {
    const index = toasts.findIndex(item => item.id === id);
    if (index < 0) return;
    const item = toasts[index]!;
    clearTimeout(timers.get(id)?.timer); timers.delete(id); toasts.splice(index, 1); item.onClose?.();
  }
  function schedule(id: number, duration: number) {
    clearTimeout(timers.get(id)?.timer);
    timers.delete(id);
    if (duration > 0 && Number.isFinite(duration)) timers.set(id, { remaining: duration, expires: Date.now() + duration, timer: setTimeout(() => close(id), duration) });
  }
  function show(kind: UiToast["kind"], content: UiContent | UiToastOptions): UiToastHandle {
    const options = content && typeof content === "object" && !Array.isArray(content) && !isVNode(content) ? content as UiToastOptions : { message: content as UiContent };
    const existing = options.grouping ? toasts.find(item => item.kind === kind && item.tone === options.tone && item.message === options.message) : undefined;
    const item: UiToast = existing ? { ...existing, repeatCount: existing.repeatCount + 1 } : { ...options, id: ++sequence, kind, message: options.message ?? "", origin: origin(), duration: options.duration ?? (kind === "message" ? 3500 : 4500), repeatCount: 1 };
    if (existing) toasts[toasts.findIndex(toast => toast.id === existing.id)] = item;
    else toasts.push(item);
    schedule(item.id, options.duration ?? item.duration!);
    return { close: () => close(item.id), update(options) {
      const index = toasts.findIndex(toast => toast.id === item.id);
      if (index < 0) return;
      toasts[index] = { ...toasts[index]!, ...options };
      if (options.duration != null) schedule(item.id, options.duration);
    } };
  }
  function next() { if (active || !queue.length) return; active = queue.shift(); box.value = active!.box; }
  function enqueue(kind: UiBox["kind"], message: UiContent, title: string, options: UiBoxOptions): Promise<unknown> {
    return new Promise((resolve, reject) => { queue.push({ box: { ...options, id: ++sequence, kind, message, title, origin: origin() }, resolve, reject }); next(); });
  }
  function finish(id: number, action: "confirm" | "cancel" | "close", value = "") {
    if (!active || active.box.id !== id) return;
    const request = active; active = undefined; box.value = undefined;
    if (action === "confirm") request.resolve(request.box.kind === "prompt" ? { value, action: "confirm" } : "confirm");
    else request.reject(cancelled(action));
    // Let the closing native dialog restore focus before opening the next request.
    queueMicrotask(next);
  }
  function clear() {
    for (const item of [...toasts]) close(item.id);
    if (active) { active.reject(cancelled("close")); active = undefined; }
    for (const request of queue.splice(0)) request.reject(cancelled("close"));
    box.value = undefined;
  }
  return {
    toasts, box,
    message: (content: UiContent | UiToastOptions) => show("message", content),
    notify: (options: UiToastOptions) => show("notification", options),
    confirm: (message: UiContent, title = "请确认", options: UiBoxOptions = {}) => enqueue("confirm", message, title, options) as Promise<"confirm">,
    alert: (message: UiContent, title = "提示", options: UiBoxOptions = {}) => enqueue("alert", message, title, options) as Promise<"confirm">,
    prompt: (message: UiContent, title = "请输入", options: UiBoxOptions = {}) => enqueue("prompt", message, title, options) as Promise<{ value: string; action: "confirm" }>,
    finish, clear, closeToast: close,
    pause(id: number) { const entry = timers.get(id); if (!entry) return; clearTimeout(entry.timer); entry.timer = undefined; entry.remaining = Math.max(0, entry.expires - Date.now()); },
    resume(id: number) { const entry = timers.get(id); if (entry && !entry.timer) schedule(id, entry.remaining || 1); },
  };
}
export type UiFeedback = ReturnType<typeof createUiFeedback>;
export const uiFeedbackKey: InjectionKey<UiFeedback> = Symbol("uiFeedback");
export function useUiFeedback() { const feedback = inject(uiFeedbackKey); if (!feedback) throw new Error("需要 uiFeedbackProvider"); return feedback; }

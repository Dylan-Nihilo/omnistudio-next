import { createHash } from "node:crypto";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { AssistantMessage, AssistantMessageEventStream, Context, Model, Api, SimpleStreamOptions } from "@earendil-works/pi-ai";
import { requireEnabledPlatformModel } from "@/services/modelService";
import { markGenerationStarted, reserveGeneration, settleGeneration } from "@/services/billingService";
import { accountContext, nextGenerationKey, requireAccount } from "@/utils/accountContext";
import { formatAgentError } from "@/agent/runtime/errors";

function estimateLegacyTextUnits(messages: unknown): number {
  const serialized = JSON.stringify(messages, (_key, value) => {
    if (typeof value === "string" && value.length > 500 && (value.startsWith("data:image/") || value.startsWith("data:video/") || /^[A-Za-z0-9+/=]{500,}$/.test(value.slice(0, 100)))) return "[media_binary]";
    return value;
  });
  return Math.max(1, Math.ceil(serialized.length / 10000));
}

function snapshotRequest(request: unknown) {
  let hasMedia = false;
  const mediaSnapshot = (data: string) => {
    hasMedia = true;
    return { mediaBinary: true, encodedLength: data.length, sha256: createHash("sha256").update(data).digest("hex") };
  };
  const serialized = JSON.stringify(request, (key, value) => {
    if (["headers", "authorization", "apiKey", "api_key"].includes(key)) return "[redacted]";
    if (typeof value === "string" && /^data:[^,]+;base64,/.test(value)) return mediaSnapshot(value);
    if (value && typeof value === "object") {
      if (["image", "image_url", "input_image", "video_url", "input_file", "document"].includes(value.type)) hasMedia = true;
      if (value.type === "image" && typeof value.data === "string") return { ...value, data: mediaSnapshot(value.data) };
      if (value.type === "base64" && typeof value.data === "string") return { ...value, data: mediaSnapshot(value.data) };
    }
    return value;
  });
  return { value: JSON.parse(serialized), serialized, hasMedia };
}

function hasRecordedUsage(message?: AssistantMessage) {
  return message && [message.usage.input, message.usage.output, message.usage.cacheRead, message.usage.cacheWrite, message.usage.totalTokens].some(value => value !== 0);
}

export function getTextOutputBudget(model: Model<Api>, payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Object.assign(new Error("模型请求内容无效"), { status: 422 });
  const body = payload as Record<string, unknown>;
  const fields = model.api === "openai-responses" ? ["max_output_tokens"] : model.api === "openai-completions" ? ["max_completion_tokens", "max_tokens"] : ["max_tokens"];
  const limits = fields.map(field => body[field]).filter(value => value !== undefined);
  // ACT: 扩展可移除输出上限；只有最终请求确实无上限时才按上下文窗口预留。
  if (!limits.length || limits.includes(null)) return model.contextWindow;
  if (limits.some(value => typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)) throw Object.assign(new Error("模型输出 token 上限无效"), { status: 422 });
  return Math.max(...limits as number[]);
}

export function createChargedStream(input: { providerId: string; modelId: string; model: Model<Api>; context: Context; budgetContext?: { context: Context; references: unknown }; fetch?: SimpleStreamOptions["fetch"]; signal?: AbortSignal; idempotencyKey?: string }, start: (signal: AbortSignal | undefined, recordPayload: (payload: unknown) => Promise<void>, guardedFetch: typeof fetch) => AssistantMessageEventStream) {
  const account = requireAccount();
  const signal = account.signal ? AbortSignal.any([account.signal, ...(input.signal ? [input.signal] : [])]) : input.signal;
  const key = nextGenerationKey(input.idempotencyKey);
  const output = createAssistantMessageEventStream();
  void accountContext.run(account, async () => {
    let jobId: string | undefined;
    let latestMessage: AssistantMessage | undefined;
    try {
      signal?.throwIfAborted();
      if (!["openai-completions", "openai-responses", "anthropic-messages"].includes(input.model.api)) throw Object.assign(new Error("模型协议不支持请求预留"), { status: 422 });
      await requireEnabledPlatformModel(input.providerId, input.modelId, "text");
      const request = snapshotRequest(input.budgetContext ?? { context: input.context });
      let payloadReservation: Promise<void> | undefined;
      let finalPayloadSerialized: string | undefined;
      let requestPrepared = false;
      const guardedFetch = ((...args: Parameters<typeof fetch>) => {
        signal?.throwIfAborted();
        if (!requestPrepared) throw Object.assign(new Error("模型请求尚未完成积分预留"), { status: 422 });
        return (input.fetch ?? globalThis.fetch)(...args);
      }) as typeof fetch;
      const stream = start(signal, async payload => {
        signal?.throwIfAborted();
        const finalRequest = snapshotRequest(payload);
        if (payloadReservation) {
          const changed = finalRequest.serialized !== finalPayloadSerialized;
          await payloadReservation;
          signal?.throwIfAborted();
          if (changed) throw Object.assign(new Error("积分预留后不能改变模型请求"), { status: 409 });
          return;
        }
        const body = finalRequest.value as Record<string, unknown>;
        const messages = body[input.model.api === "openai-responses" ? "input" : "messages"];
        // ACT: 最终 payload 已包含 SDK、扩展和附件变更；文本按 UTF-8 字节保守预留，媒体仍按上下文上限预留。
        const textBudget = {
          input: finalRequest.hasMedia ? input.model.contextWindow : Math.min(input.model.contextWindow, Math.max(1, Buffer.byteLength(finalRequest.serialized) + 64 * ((Array.isArray(messages) ? messages.length : input.context.messages.length) + (Array.isArray(body.tools) ? body.tools.length : 0) + 1))),
          output: getTextOutputBudget(input.model, payload),
          estimation: finalRequest.hasMedia ? "mediaContextWindow" : "finalPayloadUtf8BytesWithMessageOverhead",
        };
        finalPayloadSerialized = finalRequest.serialized;
        payloadReservation = (async () => {
          const reservation = await reserveGeneration({ userId: account.userId, providerId: input.providerId, modelId: input.modelId, mediaType: "text", units: estimateLegacyTextUnits(input.context.messages), textBudget, idempotencyKey: key, requestSnapshot: { providerId: input.providerId, modelId: input.modelId, ...request.value, textBudget } });
          jobId = reservation.job.id;
          signal?.throwIfAborted();
          await markGenerationStarted(jobId, finalRequest.value);
          signal?.throwIfAborted();
          requestPrepared = true;
        })();
        await payloadReservation;
      }, guardedFetch);
      for await (const event of stream) {
        if ("partial" in event) latestMessage = event.partial;
        if (event.type === "done") latestMessage = event.message;
        if (event.type === "error") latestMessage = event.error;
        if (latestMessage) { latestMessage.model = input.model.id; latestMessage.provider = input.model.provider; }
        // ACT: 取消后仍排空适配器，保留它在 error/done 中返回的计量，不向客户端继续输出正文。
        if (!signal?.aborted && event.type !== "done" && event.type !== "error") output.push(event);
      }
      const message = await stream.result();
      latestMessage = message;
      message.model = input.model.id;
      message.provider = input.model.provider;
      signal?.throwIfAborted();
      if (message.stopReason === "error" || message.stopReason === "aborted" || message.stopReason === "pending") throw new Error(message.errorMessage || "模型请求未完成");
      if (!jobId || !requestPrepared) throw new Error("模型请求未完成积分预留");
      await settleGeneration(jobId, true, { ...(hasRecordedUsage(message) ? { usage: message.usage } : { usageMissing: true }), message });
      output.push({ type: "done", reason: message.stopReason, message });
      output.end(message);
    } catch (error) {
      console.error("[createChargedStream Error]", formatAgentError(error instanceof Error ? error.message : "模型服务请求失败，请稍后重试", input.providerId));
      let message = signal?.aborted ? "模型请求已取消" : formatAgentError(error instanceof Error ? error.message : "模型服务请求失败，请稍后重试", input.providerId);
      if (jobId) {
        try { await settleGeneration(jobId, false, { ...(hasRecordedUsage(latestMessage) ? { usage: latestMessage!.usage } : { usageMissing: true }), ...(latestMessage ? { message: latestMessage } : {}), error: message }); }
        catch { message += "；积分结算失败，请联系管理员"; }
      }
      const failure: AssistantMessage = { role: "assistant", content: latestMessage?.content ?? [], api: input.model.api, provider: input.model.provider, model: input.model.id, timestamp: Date.now(), stopReason: signal?.aborted ? "aborted" : "error", errorMessage: message, usage: latestMessage?.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      output.push({ type: "error", reason: failure.stopReason as "error" | "aborted", error: failure });
      output.end(failure);
    }
  });
  return output;
}

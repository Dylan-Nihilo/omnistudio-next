import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { AssistantMessage, AssistantMessageEventStream, Context, Model, Api } from "@earendil-works/pi-ai";
import { requireEnabledPlatformModel } from "@/services/modelService";
import { reserveGeneration, settleGeneration } from "@/services/billingService";
import { accountContext, nextGenerationKey, requireAccount } from "@/utils/accountContext";

function estimateTextUnits(messages: unknown): number {
  const serialized = JSON.stringify(messages, (_key, value) => {
    if (typeof value === "string" && value.length > 500 && (value.startsWith("data:image/") || value.startsWith("data:video/") || /^[A-Za-z0-9+/=]{500,}$/.test(value.slice(0, 100)))) {
      return "[media_binary]";
    }
    return value;
  });
  return Math.max(1, Math.ceil(serialized.length / 10000));
}

export function createChargedStream(input: { providerId: string; modelId: string; model: Model<Api>; context: Context; signal?: AbortSignal; idempotencyKey?: string }, start: (signal?: AbortSignal) => AssistantMessageEventStream) {
  const account = requireAccount();
  const signal = account.signal ? AbortSignal.any([account.signal, ...(input.signal ? [input.signal] : [])]) : input.signal;
  const key = nextGenerationKey(input.idempotencyKey);
  const output = createAssistantMessageEventStream();
  void accountContext.run(account, async () => {
    let jobId: string | undefined;
    try {
      signal?.throwIfAborted();
      await requireEnabledPlatformModel(input.providerId, input.modelId, "text");
      const reservation = await reserveGeneration({ userId: account.userId, providerId: input.providerId, modelId: input.modelId, mediaType: "text", units: estimateTextUnits(input.context.messages), idempotencyKey: key, requestSnapshot: { providerId: input.providerId, modelId: input.modelId, context: input.context } });
      jobId = reservation.job.id;
      const stream = start(signal);
      for await (const event of stream) {
        signal?.throwIfAborted();
        if ("partial" in event) { event.partial.model = input.model.id; event.partial.provider = input.model.provider; }
        if (event.type !== "done" && event.type !== "error") output.push(event);
      }
      const message = await stream.result();
      message.model = input.model.id;
      message.provider = input.model.provider;
      signal?.throwIfAborted();
      if (message.stopReason === "error" || message.stopReason === "aborted" || message.stopReason === "pending") throw new Error(message.errorMessage || "模型请求未完成");
      await settleGeneration(jobId, true, { usage: message.usage, message });
      output.push({ type: "done", reason: message.stopReason, message });
      output.end(message);
    } catch (error) {
      let message = signal?.aborted ? "模型请求已取消" : error instanceof Error && (error as { status?: number }).status ? error.message : "模型服务请求失败，请稍后重试";
      if (jobId) {
        try { await settleGeneration(jobId, false, { error: message }); }
        catch (settlementError) { message += `；积分结算失败：${settlementError instanceof Error ? settlementError.message : "请联系管理员"}`; }
      }
      const failure: AssistantMessage = { role: "assistant", content: [], api: input.model.api, provider: input.model.provider, model: input.model.id, timestamp: Date.now(), stopReason: signal?.aborted ? "aborted" : "error", errorMessage: message, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      output.push({ type: "error", reason: failure.stopReason as "error" | "aborted", error: failure });
      output.end(failure);
    }
  });
  return output;
}

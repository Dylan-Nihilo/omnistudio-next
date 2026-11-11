import type { AssistantMessage, Context } from "@earendil-works/pi-ai";
import { getSessionSnapshot } from "@/lib/sessionState";

type TextGenerationInput = {
  providerId: string;
  modelId: string;
  projectId: string;
  maxTokens: number;
  context: Context;
  purpose?: "scriptRevision";
  expectedRevision?: number;
};

type TextGenerationOptions = {
  signal?: AbortSignal;
  onText?: (text: string) => void;
};

type GenerationEvent = {
  type?: string;
  delta?: string;
  message?: string | AssistantMessage;
};

export async function generateText(input: TextGenerationInput, options: TextGenerationOptions = {}): Promise<AssistantMessage> {
  if ((input.purpose === undefined) !== (input.expectedRevision === undefined)) throw new Error("正文修订用途与版本号必须同时提供");
  const session = getSessionSnapshot();
  const signal = options.signal ? AbortSignal.any([options.signal, session.signal]) : session.signal;
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-account-id": session.userId,
      "x-csrf-token": session.csrfToken,
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok || !response.body) {
    const failure = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(failure?.message || `模型请求失败（HTTP ${response.status}）`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let dataLines: string[] = [];
  let responseText = "";
  let result: AssistantMessage | undefined;
  let completed = false;

  const consumeEvent = () => {
    if (!dataLines.length) return;
    const payload = dataLines.join("\n");
    dataLines = [];
    if (!payload.trim()) return;
    const event = JSON.parse(payload) as GenerationEvent;
    if (event.type === "text" && typeof event.delta === "string") {
      responseText += event.delta;
      options.onText?.(responseText);
    } else if (event.type === "error") {
      throw new Error(typeof event.message === "string" ? event.message : "文本模型生成失败");
    } else if (event.type === "done" && event.message && typeof event.message === "object") {
      result = event.message;
      completed = true;
    }
  };

  const consumeLine = (line: string) => {
    if (!line) consumeEvent();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let delimiterIndex = -1;
      while ((delimiterIndex = pending.search(/[\r\n]/)) >= 0) {
        const delimiter = pending[delimiterIndex];
        if (delimiter === "\r" && delimiterIndex === pending.length - 1 && !done) break;
        const line = pending.slice(0, delimiterIndex);
        const delimiterLength = delimiter === "\r" && pending[delimiterIndex + 1] === "\n" ? 2 : 1;
        pending = pending.slice(delimiterIndex + delimiterLength);
        consumeLine(line);
      }
      if (completed) break;
      if (done) {
        if (pending) consumeLine(pending);
        consumeEvent();
        break;
      }
    }
    signal.throwIfAborted();
    const currentSession = getSessionSnapshot();
    if (currentSession.revision !== session.revision || currentSession.userId !== session.userId) throw new Error("账户已切换，模型请求已取消");
    if (!completed || !result) throw new Error("模型连接中断，未收到完整结果");
    if (result.stopReason === "error" || result.stopReason === "aborted") throw new Error(result.errorMessage || "文本模型生成失败");
    if (responseText && !result.content.some(part => part.type === "text" && part.text.length > 0)) {
      return { ...result, content: [...result.content, { type: "text", text: responseText }] };
    }
    return result;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

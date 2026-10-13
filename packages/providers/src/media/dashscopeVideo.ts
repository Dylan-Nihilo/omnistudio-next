/// <reference path="../../types.d.ts" />

const rules = [
  {
    type: "input",
    field: "apiKey" as const,
    title: "API Key",
    value: "",
    props: { type: "password", showPassword: true, autocomplete: "off" },
  },
  {
    type: "input",
    field: "baseUrl" as const,
    title: "请求地址",
    value: "https://ws-y50erldsvnjf0okr.cn-beijing.maas.aliyuncs.com/api/v1",
    props: { placeholder: "https://ws-y50erldsvnjf0okr.cn-beijing.maas.aliyuncs.com/api/v1" },
  },
] as const;

const upstreamModel = "MiniMax/MiniMax-H3";
const defaultBaseUrl = "https://ws-y50erldsvnjf0okr.cn-beijing.maas.aliyuncs.com/api/v1";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("百炼视频响应格式错误");
  return value as Record<string, unknown>;
}

function wait(signal: AbortSignal, milliseconds: number) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", abort, { once: true });
  });
}

function responseMessage(context: ProviderContext, value: unknown) {
  return context.tool.errorMessage?.(value) || "百炼视频任务失败";
}

async function readResponse(context: ProviderContext, response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (/json/i.test(contentType)) return object(await response.json());
  return response.text();
}

async function poll(context: ProviderContext, baseUrl: string, apiKey: string, taskId: string, signal: AbortSignal) {
  for (;;) {
    const response = await context.tool.fetch(`${baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const data = await readResponse(context, response);
    if (!response.ok) throw new Error(`百炼视频任务查询失败：HTTP ${response.status}${responseMessage(context, data) ? `，${responseMessage(context, data)}` : ""}`);
    const output = object(object(data).output ?? {});
    const status = String(output.task_status ?? "").toUpperCase();
    if (status === "SUCCEEDED") {
      const url = output.video_url;
      if (typeof url !== "string" || !url) throw new Error("百炼视频任务成功但未返回视频地址");
      return url;
    }
    if (["FAILED", "CANCELED", "CANCELLED", "UNKNOWN"].includes(status)) {
      throw new Error(`${status === "FAILED" ? responseMessage(context, output) : `百炼视频任务${status}`}`);
    }
    await wait(signal, 15_000);
  }
}

async function generateVideo(request: VideoRequest, context: ProviderContext<{ apiKey: string; baseUrl: string }>): Promise<MediaAsset[]> {
  const apiKey = context.config.apiKey?.trim();
  if (!apiKey) throw new Error("请填写 API Key");
  if (request.images?.length || request.videos?.length || request.audios?.length || request.firstFrame || request.lastFrame) {
    throw new Error("百炼 MiniMax H3 当前仅支持文生视频");
  }
  const baseUrl = (context.config.baseUrl?.trim() || defaultBaseUrl).replace(/\/$/, "");
  const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(context.signal ? [context.signal] : [])]);
  const duration = request.duration ?? 5;
  if (!Number.isInteger(duration) || duration < 4 || duration > 12) throw new Error("百炼 MiniMax H3 时长须为 4 到 12 秒的整数");
  const resolution = (request.resolution ?? "768P").toUpperCase();
  if (resolution !== "768P" && resolution !== "2K") throw new Error("百炼 MiniMax H3 仅支持 768P 或 2K");
  const response = await context.tool.fetch(`${baseUrl}/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: upstreamModel,
      input: { prompt: request.prompt },
      parameters: { duration, resolution, prompt_extend: true, watermark: request.watermark ?? false },
    }),
    signal,
  });
  const data = await readResponse(context, response);
  if (!response.ok) throw new Error(`百炼视频提交失败：HTTP ${response.status}${responseMessage(context, data) ? `，${responseMessage(context, data)}` : ""}`);
  const output = object(object(data).output ?? {});
  const taskId = output.task_id;
  if (typeof taskId !== "string" || !taskId) throw new Error("百炼视频提交未返回任务 ID");
  const url = await poll(context, baseUrl, apiKey, taskId, signal);
  return [{ mediaType: "video", type: "url", url }];
}

export default {
  id: "dashscopeVideo",
  label: "百炼视频",
  version: "1.0.0",
  apiUrl: defaultBaseUrl,
  protocol: "openai-completions",
  readme: "百炼原生视频接口，当前适配 MiniMax H3 文生视频。",
  rules,
  models: [
    {
      id: "minimax-h3",
      label: "MiniMax H3",
      type: "video",
      mode: ["text"],
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12], resolution: ["768P", "2K"] }],
    },
  ] satisfies ProviderModel[],
  async generateVideo(request: VideoRequest) {
    return generateVideo(request, this);
  },
} satisfies ProviderDefinition<typeof rules>;

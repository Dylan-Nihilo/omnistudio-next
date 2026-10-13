/// <reference path="../../types.d.ts" />

const rules = [
  {
    type: "input",
    field: "apiKey" as const,
    title: "API Token",
    value: "",
    props: { type: "password", showPassword: true, autocomplete: "off" },
  },
  {
    type: "input",
    field: "baseUrl" as const,
    title: "请求地址",
    value: "https://ai-gateway.utooo.com",
    props: { placeholder: "https://ai-gateway.utooo.com" },
  },
] as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Seedance 响应格式错误");
  return value as Record<string, unknown>;
}

function mediaUrl(input: MediaInput) {
  if (input.type === "url") return input.url;
  const data = input.type === "binary" ? Buffer.from(input.data).toString("base64") : input.data;
  return data.startsWith("data:") ? data : `data:${input.mimeType};base64,${data}`;
}

function wait(signal: AbortSignal, milliseconds: number) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function readResponse(context: ProviderContext, response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  return /json/i.test(contentType) ? object(await response.json()) : await response.text();
}

function responseMessage(context: ProviderContext, value: unknown) {
  return context.tool.errorMessage?.(value) || "Seedance 请求失败";
}

async function poll(context: ProviderContext, baseUrl: string, apiKey: string, taskId: string, signal: AbortSignal) {
  for (;;) {
    const response = await context.tool.fetch(`${baseUrl}/api/v3/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const data = await readResponse(context, response);
    if (!response.ok) throw new Error(`Seedance 任务查询失败：HTTP ${response.status}${responseMessage(context, data) ? `，${responseMessage(context, data)}` : ""}`);
    const status = String(object(data).status ?? "").toLowerCase();
    if (status === "succeeded") {
      const content = object(object(data).content ?? {});
      const url = content.video_url;
      if (typeof url !== "string" || !url) throw new Error("Seedance 任务成功但未返回视频地址");
      return url;
    }
    if (["failed", "expired", "cancelled", "canceled"].includes(status)) {
      throw new Error(`Seedance 任务${status === "failed" ? `失败：${responseMessage(context, data)}` : status}`);
    }
    await wait(signal, 5000);
  }
}

async function generateVideo(request: VideoRequest, context: ProviderContext<{ apiKey: string; baseUrl: string }>) {
  const apiKey = context.config.apiKey.trim();
  if (!apiKey) throw new Error("平台模型凭证未配置");
  const baseUrl = (context.config.baseUrl.trim() || "https://ai-gateway.utooo.com").replace(/\/$/, "");
  const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(context.signal ? [context.signal] : [])]);
  const content: Record<string, unknown>[] = [{ type: "text", text: request.prompt }];
  const frames = [
    ...(request.firstFrame ? [{ input: request.firstFrame, role: "first_frame" }] : []),
    ...(request.lastFrame ? [{ input: request.lastFrame, role: "last_frame" }] : []),
  ];
  if (frames.length) {
    for (const frame of frames) content.push({ type: "image_url", role: frame.role, image_url: { url: mediaUrl(frame.input) } });
  } else {
    for (const image of request.images ?? []) content.push({ type: "image_url", role: "reference_image", image_url: { url: mediaUrl(image) } });
    for (const video of request.videos ?? []) content.push({ type: "video_url", role: "reference_video", video_url: { url: mediaUrl(video) } });
    for (const audio of request.audios ?? []) content.push({ type: "audio_url", role: "reference_audio", audio_url: { url: mediaUrl(audio) } });
  }
  const payload = Object.fromEntries(Object.entries({
    model: request.model,
    content,
    ratio: request.ratio,
    resolution: request.resolution,
    duration: request.duration,
    generate_audio: request.generateAudio,
    watermark: request.watermark,
  }).filter(([, value]) => value !== undefined));
  const response = await context.tool.fetch(`${baseUrl}/api/v3/contents/generations/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await readResponse(context, response);
  if (!response.ok) throw new Error(`Seedance 任务提交失败：HTTP ${response.status}${responseMessage(context, data) ? `，${responseMessage(context, data)}` : ""}`);
  const taskId = object(data).id;
  if (typeof taskId !== "string" || !taskId) throw new Error("Seedance 任务提交未返回任务 ID");
  return [{ mediaType: "video" as const, type: "url" as const, url: await poll(context, baseUrl, apiKey, taskId, signal) }];
}

export default {
  id: "utoooSeedance",
  label: "Seedance 官方网关",
  version: "1.0.0",
  apiUrl: "https://ai-gateway.utooo.com",
  protocol: "openai-completions",
  readme: "Seedance 官方资源网关，使用平台 apiToken 和异步视频任务接口。",
  rules,
  models: [
    {
      id: "doubao-seedance-2-5-260628",
      label: "Seedance 2.5",
      type: "video",
      mode: ["text", "startFrameOptional", ["imageReference:30", "videoReference:10", "audioReference:10"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], resolution: ["480p", "720p", "1080p"] }],
    },
    {
      id: "doubao-seedance-2-0-260128",
      label: "Seedance 2.0",
      type: "video",
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p"] }],
    },
  ] satisfies ProviderModel[],
  async generateVideo(request: VideoRequest) {
    return generateVideo(request, this);
  },
} satisfies ProviderDefinition<typeof rules>;

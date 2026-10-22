/// <reference path="../../types.d.ts" />

const defaultBaseUrl = "https://qianfan.baidubce.com";
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
    value: defaultBaseUrl,
    props: { placeholder: defaultBaseUrl },
  },
] as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("百度视频响应格式错误");
  return value as Record<string, unknown>;
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

function responseMessage(context: ProviderContext, value: unknown) {
  return context.tool.errorMessage?.(value) || "百度视频任务失败";
}

function mediaUrl(input: MediaInput, mediaType: "image" | "video" | "audio") {
  if (input.type === "url") {
    const value = input.url.trim();
    if (!/^(?:https?:\/\/|asset:\/\/)/i.test(value)) throw new Error("百度视频参考素材必须是 HTTP(S) 或 asset:// 地址");
    return value;
  }
  if (mediaType !== "image") throw new Error("百度视频的参考视频和音频必须是 HTTP(S) 或 asset:// 地址；参考图片支持 Base64");
  const data = input.type === "binary" ? Buffer.from(input.data).toString("base64") : input.data;
  return data.startsWith("data:") ? data : `data:${input.mimeType};base64,${data}`;
}

async function readResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (/json/i.test(contentType)) return object(await response.json());
  const text = await response.text();
  try { return object(JSON.parse(text)); }
  catch { return text; }
}

async function poll(context: ProviderContext, baseUrl: string, apiKey: string, taskId: string, signal: AbortSignal) {
  for (;;) {
    const response = await context.tool.fetch(`${baseUrl}/v2/mm/fire/generations/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    });
    const data = await readResponse(response);
    if (!response.ok) throw new Error(`百度视频任务查询失败：HTTP ${response.status}${responseMessage(context, data) ? `，${responseMessage(context, data)}` : ""}`);
    const status = String(object(data).status ?? object(data).state ?? "").toLowerCase();
    if (status === "succeeded") {
      const content = object(object(data).content ?? {});
      const url = content.video_url;
      if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("百度视频任务成功但未返回视频地址");
      return url;
    }
    if (["failed", "cancelled", "canceled"].includes(status)) {
      throw new Error(`百度视频任务${status === "failed" ? `失败：${responseMessage(context, data)}` : status}`);
    }
    await wait(signal, 5000);
  }
}

async function generateVideo(request: VideoRequest, context: ProviderContext<{ apiKey: string; baseUrl: string }>) {
  const apiKey = context.config.apiKey?.trim();
  if (!apiKey) throw new Error("请填写百度千帆 API Key");
  const baseUrl = (context.config.baseUrl?.trim() || defaultBaseUrl).replace(/\/$/, "");
  const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(context.signal ? [context.signal] : [])]);
  const content: Record<string, unknown>[] = [{ type: "text", text: request.prompt }];
  const frames = [
    ...(request.firstFrame ? [{ input: request.firstFrame, role: "first_frame" }] : []),
    ...(request.lastFrame ? [{ input: request.lastFrame, role: "last_frame" }] : []),
  ];
  if (frames.length) {
    for (const frame of frames) content.push({ type: "image_url", image_url: { url: mediaUrl(frame.input, "image") }, role: frame.role });
  } else {
    for (const input of request.images ?? []) content.push({ type: "image_url", image_url: { url: mediaUrl(input, "image") }, role: "reference_image" });
    for (const input of request.videos ?? []) content.push({ type: "video_url", video_url: { url: mediaUrl(input, "video") }, role: "reference_video" });
    for (const input of request.audios ?? []) content.push({ type: "audio_url", audio_url: { url: mediaUrl(input, "audio") }, role: "reference_audio" });
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
  const response = await context.tool.fetch(`${baseUrl}/v2/mm/fire/generations/tasks`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await readResponse(response);
  if (!response.ok) throw new Error(`百度视频任务提交失败：HTTP ${response.status}${responseMessage(context, data) ? `，${responseMessage(context, data)}` : ""}`);
  const taskId = object(data).id ?? object(data).task_id;
  if (typeof taskId !== "string" || !taskId) throw new Error("百度视频任务提交未返回任务 ID");
  return [{ mediaType: "video" as const, type: "url" as const, url: await poll(context, baseUrl, apiKey, taskId, signal) }];
}

export default {
  id: "baiduVideoFire",
  label: "百度千帆视频",
  version: "1.0.0",
  apiUrl: defaultBaseUrl,
  protocol: "openai-completions",
  readme: "百度千帆 Video-Fire 异步视频生成接口，支持 S2.0、S2.0-Fast、S2.0-Mini 和 S2.5。参考图片支持 HTTP(S)、asset:// 和 Base64；参考视频、音频支持 HTTP(S) 和 asset://。",
  rules,
  models: [
    { id: "S2.0", label: "S2.0", type: "video", mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]], audio: "optional", durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p", "4k"] }] },
    { id: "S2.0-Fast", label: "S2.0 Fast", type: "video", mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]], audio: "optional", durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }] },
    { id: "S2.0-Mini", label: "S2.0 Mini", type: "video", mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]], audio: "optional", durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }] },
    { id: "S2.5", label: "S2.5", type: "video", mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]], audio: "optional", durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30], resolution: ["480p", "720p", "1080p"] }] },
  ] satisfies ProviderModel[],
  async generateVideo(request: VideoRequest) {
    return generateVideo(request, this);
  },
} satisfies ProviderDefinition<typeof rules>;

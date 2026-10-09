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
    value: "https://video.jojokey.com/v1",
    props: { placeholder: "https://video.jojokey.com/v1" },
  },
] as const;

type JojoRoute = { line: "cn" | "overseas"; upstream: string; dialect: "seedance" | "minimax_a" };

const routes: Record<string, JojoRoute> = {
  "seedance-2.0-mini": { line: "cn", upstream: "video-cn-2.0-mini", dialect: "seedance" },
  "seedance-2.0-fast": { line: "cn", upstream: "video-cn-2.0-fast", dialect: "seedance" },
  "seedance-2.0": { line: "cn", upstream: "video-cn-2.0-pro", dialect: "seedance" },
  "seedance-2.5": { line: "cn", upstream: "video-cn-2.5", dialect: "seedance" },
  "minimax-h3": { line: "overseas", upstream: "minimax-A", dialect: "minimax_a" },
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JojoKey 响应格式错误");
  return value as Record<string, unknown>;
}

function inputBytes(input: MediaInput) {
  if (input.type === "binary") return input.data;
  if (input.type === "url") throw new Error("JojoKey 素材上传只接受本地媒体");
  return Buffer.from(input.data.replace(/^data:[^,]+,/, ""), "base64");
}

function fileName(mimeType: string, index: number) {
  return `reference-${index}.${mimeType.split("/")[1] || "bin"}`;
}

function randomKey() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : "jojo-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

async function upload(context: ProviderContext<{ apiKey: string; baseUrl: string }>, input: MediaInput, modality: "image" | "video" | "audio", line: JojoRoute["line"], index: number) {
  if (input.type === "url") return input.url;
  const mimeType = input.mimeType || `${modality}/octet-stream`;
  const form = new FormData();
  form.append(line === "cn" ? "asset_type" : "register_asset", line === "cn" ? ({ image: "1", video: "2", audio: "3" }[modality]) : "false");
  if (line === "cn") form.append("asset_name", fileName(mimeType, index));
  form.append("file", new File([inputBytes(input) as unknown as BlobPart], fileName(mimeType, index), { type: mimeType }));
  const response = await context.tool.fetch(`${context.config.baseUrl.replace(/\/$/, "")}${line === "cn" ? "/video-cn/assets" : "/uploads"}`, {
    method: "POST", headers: { Authorization: `Bearer ${context.config.apiKey}`, "Idempotency-Key": randomKey() }, body: form, signal: context.signal,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`JojoKey 素材上传失败（HTTP ${response.status}）：${errorText}`);
  }
  const result = object(await response.json());
  const url = line === "cn" ? result.source_url : result.url;
  if (typeof url !== "string" || !url.startsWith("https://")) throw new Error("JojoKey 素材上传未返回 HTTPS 地址");
  return url;
}

async function poll(context: ProviderContext<{ apiKey: string; baseUrl: string }>, url: string, taskId: string) {
  for (;;) {
    const response = await context.tool.fetch(`${url}/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${context.config.apiKey}` }, signal: context.signal });
    if (!response.ok) throw new Error(`JojoKey 任务查询失败：HTTP ${response.status}`);
    const task = object(await response.json());
    const status = String(task.status ?? "").toLowerCase();
    if (status === "succeeded") {
      const result = task.video_url ?? object(task.output ?? {}).video_url;
      if (typeof result !== "string" || !result) throw new Error("JojoKey 任务成功但未返回视频地址");
      return result;
    }
    if (["failed", "cancelled", "expired"].includes(status)) throw new Error(`JojoKey 任务${status}`);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 5000);
      context.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(context.signal?.reason); }, { once: true });
    });
  }
}

async function generateVideo(request: VideoRequest, context: ProviderContext<{ apiKey: string; baseUrl: string }>) {
  const apiKey = context.config.apiKey.trim();
  if (!apiKey) throw new Error("平台模型凭证未配置");
  const route = routes[request.model];
  if (!route) throw new Error(`JojoKey 未配置模型 ${request.model}`);
  const base = context.config.baseUrl.replace(/\/$/, "");
  const endpoint = `${base}${route.line === "cn" ? "/video-cn/videos" : "/videos"}`;
  const mode = Array.isArray(request.mode) ? "reference" : request.mode === "startFrameOptional" || request.mode === "endFrameOptional" || request.mode === "startEndRequired" ? "keyframe" : "text";
  const images = await Promise.all((request.images ?? []).map((item, index) => upload(context, item, "image", route.line, index)));
  const videos = await Promise.all((request.videos ?? []).map((item, index) => upload(context, item, "video", route.line, index)));
  const audios = await Promise.all((request.audios ?? []).map((item, index) => upload(context, item, "audio", route.line, index)));
  const firstFrame = request.firstFrame ? await upload(context, request.firstFrame, "image", route.line, 0) : undefined;
  const lastFrame = request.lastFrame ? await upload(context, request.lastFrame, "image", route.line, 1) : undefined;
  const payload: Record<string, unknown> = { model: route.upstream, prompt: request.prompt };
  if (route.dialect === "minimax_a") {
    payload.mode = images.length || videos.length || audios.length ? "reference" : firstFrame ? "keyframe" : "text";
    if (request.duration !== undefined) payload.seconds = request.duration;
    if (request.resolution) payload.size = request.resolution;
    if (request.ratio) payload.aspect_ratio = request.ratio;
    if (payload.mode === "keyframe") { payload.first_frame = firstFrame; if (lastFrame) payload.last_frame = lastFrame; }
    else if (payload.mode === "reference") { if (images.length) payload.images = images; if (videos.length) payload.videos = videos; if (audios.length) payload.audios = audios; }
  } else {
    const content: Record<string, unknown>[] = [{ type: "text", text: request.prompt }];
    if (images.length) images.forEach(url => content.push({ type: "image_url", image_url: { url }, role: "reference_image" }));
    else if (firstFrame) content.push({ type: "image_url", image_url: { url: firstFrame }, role: "first_frame" });
    videos.forEach(url => content.push({ type: "video_url", video_url: { url }, role: "reference_video" }));
    audios.forEach(url => content.push({ type: "audio_url", audio_url: { url }, role: "reference_audio" }));
    payload.content = content;
    if (request.resolution) payload.resolution = request.resolution;
    if (request.duration !== undefined) payload.duration = request.duration;
    if (request.ratio) payload.ratio = request.ratio;
    if (request.generateAudio !== undefined) payload.generate_audio = request.generateAudio;
    if (route.line === "overseas") payload.metadata = { audit_image: true };
  }
  const response = await context.tool.fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": randomKey() },
    body: JSON.stringify(payload),
    signal: context.signal,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`JojoKey 视频提交失败（HTTP ${response.status}）：${errorText}`);
  }
  const result = object(await response.json());
  const taskId = result.id;
  if (typeof taskId !== "string" || !taskId) throw new Error("JojoKey 提交未返回任务 ID");
  return [{ mediaType: "video" as const, type: "url" as const, url: await poll(context, endpoint, taskId) }];
}

export default {
  id: "jojokey",
  label: "JojoKey 视频",
  version: "1.0.0",
  apiUrl: "https://video.jojokey.com/v1",
  protocol: "openai-completions",
  readme: "旧 omnistudio-next 使用的 JojoKey Seedance / MiniMax 视频服务。",
  rules,
  models: [
    {
      id: "seedance-2.0-mini",
      label: "Seedance 2.0 标准",
      type: "video",
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }],
    },
    {
      id: "seedance-2.0-fast",
      label: "Seedance 2.0 高级",
      type: "video",
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p"] }],
    },
    {
      id: "seedance-2.0",
      label: "Seedance 2.0 卓越",
      type: "video",
      mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p"] }],
    },
    {
      id: "seedance-2.5",
      label: "Seedance 2.5",
      type: "video",
      mode: ["text", "startFrameOptional", ["imageReference:30", "videoReference:10", "audioReference:10"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["480p", "720p", "1080p"] }],
    },
    { id: "minimax-h3", label: "MiniMax H3", type: "video", mode: ["text", "startFrameOptional", ["imageReference:9", "videoReference:3", "audioReference:3"]], audio: "optional" },
  ] satisfies ProviderModel[],
  async generateVideo(request: VideoRequest) {
    return generateVideo(request, this);
  },
} satisfies ProviderDefinition<typeof rules>;

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
    value: "https://dashscope.aliyuncs.com/api/v1",
    props: { placeholder: "https://dashscope.aliyuncs.com/api/v1" },
  },
] as const;

const upstreamModel = "MiniMax/MiniMax-H3";
const defaultBaseUrl = "https://dashscope.aliyuncs.com/api/v1";
const maxUploadBytes = 30 * 1024 * 1024;
const imageMimeTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic", "image/heif"]);
const audioMimeTypes = new Set(["audio/mp3", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "audio/m4a", "audio/flac", "audio/webm", "audio/opus"]);

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

function mediaUrl(input: MediaInput, kind: "image" | "audio") {
  if (input.type !== "url" || !/^https?:\/\//i.test(input.url)) {
    throw new Error(`百炼 MiniMax H3 ${kind === "image" ? "图片" : "音频"}需要可公网访问的 HTTP(S) 地址`);
  }
  return input.url;
}

function mediaMimeType(input: MediaInput, kind: "image" | "audio") {
  const mimeType = input.mimeType?.split(";", 1)[0].trim().toLowerCase();
  const allowed = kind === "image" ? imageMimeTypes : audioMimeTypes;
  if (!mimeType || !allowed.has(mimeType)) {
    throw new Error(kind === "image"
      ? "百炼 MiniMax H3 图片仅支持 PNG、JPEG、WebP、HEIC 或 HEIF"
      : "百炼 MiniMax H3 音频仅支持 MP3、WAV、OGG、AAC、M4A 或 FLAC");
  }
  return mimeType === "image/jpg" ? "image/jpeg" : mimeType;
}

function mediaBytes(input: MediaInput, mimeType: string, kind: "image" | "audio") {
  if (input.type === "binary") return input.data;
  if (input.type !== "base64") throw new Error(`百炼 MiniMax H3 ${kind === "image" ? "图片" : "音频"}必须是本地 Base64 或二进制数据`);
  const value = input.data.replace(/^data:([^;,]+);base64,/i, (_match: string, dataMimeType: string) => {
    const normalized = dataMimeType.trim().toLowerCase() === "image/jpg" ? "image/jpeg" : dataMimeType.trim().toLowerCase();
    if (normalized !== mimeType) throw new Error(`百炼 MiniMax H3 ${kind === "image" ? "图片" : "音频"}的 MIME 类型与内容不一致`);
    return "";
  }).replace(/\s/g, "");
  if (!value || value.length % 4 === 1 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(value)) throw new Error(`百炼 MiniMax H3 ${kind === "image" ? "图片" : "音频"}的 Base64 内容无效`);
  return Buffer.from(value, "base64");
}

function requiredPolicyField(policy: Record<string, unknown>, field: string) {
  const value = policy[field];
  if (typeof value !== "string" || !value.trim()) throw new Error(`百炼临时文件上传策略缺少 ${field}`);
  return value;
}

async function uploadMedia(context: ProviderContext<{ apiKey: string; baseUrl: string }>, baseUrl: string, apiKey: string, input: MediaInput, kind: "image" | "audio", signal: AbortSignal) {
  if (input.type === "url") return { url: mediaUrl(input, kind), useOssResourceResolve: false };
  const mimeType = mediaMimeType(input, kind);
  const bytes = mediaBytes(input, mimeType, kind);
  if (!bytes.byteLength || bytes.byteLength > maxUploadBytes) {
    throw new Error(`百炼 MiniMax H3 ${kind === "image" ? "图片" : "音频"}须为不超过 30 MB 的文件`);
  }
  const policyResponse = await context.tool.fetch(`${baseUrl}/uploads?action=getPolicy&model=${encodeURIComponent(upstreamModel)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal,
  });
  const policyData = await readResponse(context, policyResponse);
  if (!policyResponse.ok) throw new Error(`百炼临时文件策略请求失败：HTTP ${policyResponse.status}${responseMessage(context, policyData) ? `，${responseMessage(context, policyData)}` : ""}`);
  const policy = object(object(policyData).data ?? policyData);
  const uploadHost = requiredPolicyField(policy, "upload_host");
  if (!/^https:\/\//i.test(uploadHost)) throw new Error("百炼临时文件上传策略返回了无效的 HTTPS 地址");
  const uploadDirectory = requiredPolicyField(policy, "upload_dir").replace(/\/$/, "");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1] ?? "bin";
  const key = `${uploadDirectory}/minimax-${kind}-${crypto.randomUUID()}.${extension}`;
  const form = new FormData();
  form.append("OSSAccessKeyId", requiredPolicyField(policy, "oss_access_key_id"));
  form.append("policy", requiredPolicyField(policy, "policy"));
  form.append("Signature", requiredPolicyField(policy, "signature"));
  form.append("key", key);
  form.append("x-oss-object-acl", requiredPolicyField(policy, "x_oss_object_acl"));
  form.append("x-oss-forbid-overwrite", requiredPolicyField(policy, "x_oss_forbid_overwrite"));
  form.append("success_action_status", "200");
  form.append("file", new File([bytes as unknown as BlobPart], key.split("/").pop()!, { type: mimeType }));
  const uploadResponse = await context.tool.fetch(uploadHost, { method: "POST", body: form, signal });
  if (!uploadResponse.ok) {
    const detail = (await uploadResponse.text().catch(() => "")).trim().slice(0, 500);
    throw new Error(`百炼${kind === "image" ? "图片" : "音频"}上传失败：HTTP ${uploadResponse.status}${detail ? `，${detail}` : ""}`);
  }
  return { url: `oss://${key}`, useOssResourceResolve: true };
}

async function uploadMediaList(context: ProviderContext<{ apiKey: string; baseUrl: string }>, baseUrl: string, apiKey: string, inputs: { input: MediaInput; kind: "image" | "audio" }[], signal: AbortSignal) {
  return Promise.all(inputs.map(item => uploadMedia(context, baseUrl, apiKey, item.input, item.kind, signal)));
}

async function readResponse(context: ProviderContext, response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (/json/i.test(contentType)) return object(await response.json());
  const text = await response.text();
  try { return object(JSON.parse(text)); }
  catch { return text; }
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
  if (request.videos?.length) throw new Error("百炼 MiniMax H3 当前适配首尾帧、多图参考及音频参考，暂不支持视频参考");
  const images = request.images ?? [];
  const audios = request.audios ?? [];
  if (images.length > 9) throw new Error("百炼 MiniMax H3 多图参考最多支持 9 张图片");
  if (audios.length > 3) throw new Error("百炼 MiniMax H3 音频参考最多支持 3 个音频文件");
  if ((request.firstFrame || request.lastFrame) && images.length) throw new Error("百炼 MiniMax H3 首尾帧模式不能同时传多图参考");
  const baseUrl = (context.config.baseUrl?.trim() || defaultBaseUrl).replace(/\/$/, "");
  const signal = AbortSignal.any([AbortSignal.timeout(30 * 60_000), ...(context.signal ? [context.signal] : [])]);
  const duration = request.duration ?? 6;
  if (!Number.isInteger(duration) || duration < 4 || duration > 15) throw new Error("百炼 MiniMax H3 时长须为 4 到 15 秒的整数");
  const resolution = (request.resolution ?? "768P").toUpperCase();
  if (resolution !== "768P" && resolution !== "2K") throw new Error("百炼 MiniMax H3 仅支持 768P 或 2K");
  const referenceMode = Array.isArray(request.mode) || images.length > 1;
  const frameInputs = request.firstFrame || request.lastFrame
    ? [
      ...(request.firstFrame ? [{ type: "first_frame" as const, input: request.firstFrame, kind: "image" as const }] : []),
      ...(request.lastFrame ? [{ type: "last_frame" as const, input: request.lastFrame, kind: "image" as const }] : []),
    ]
    : referenceMode
    ? images.map(input => ({ type: "image_url" as const, input, kind: "image" as const }))
    : images[0]
    ? [{ type: "first_frame" as const, input: images[0], kind: "image" as const }]
    : [];
  const audioInputs = audios.map(input => ({ type: "audio" as const, input, kind: "audio" as const }));
  const allMediaInputs = [...frameInputs, ...audioInputs];
  const uploaded = await uploadMediaList(context, baseUrl, apiKey, allMediaInputs, signal);
  const media = uploaded.map((item, index) => ({ type: allMediaInputs[index]!.type, url: item.url }));
  const ratio = request.ratio ?? (referenceMode ? "adaptive" : "16:9");
  if (!["16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "adaptive"].includes(ratio)) throw new Error("百炼 MiniMax H3 比例须为 16:9、4:3、1:1、3:4、9:16、21:9 或 adaptive");
  const response = await context.tool.fetch(`${baseUrl}/services/aigc/video-generation/video-synthesis`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
      ...(uploaded.some(item => item.useOssResourceResolve) ? { "X-DashScope-OssResourceResolve": "enable" } : {}),
    },
    body: JSON.stringify({
      model: upstreamModel,
      input: {
        prompt: request.prompt,
        ...(media.length ? { media } : {}),
      },
      parameters: {
        duration,
        resolution,
        ratio,
        prompt_extend: true,
        watermark: request.watermark ?? false,
        ...(request.generateAudio !== undefined ? { has_audio: request.generateAudio ? 1 : 0 } : {}),
      },
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
  readme: "百炼原生视频接口，适配 MiniMax H3 文生视频、首尾帧图生视频、最多 9 张多图参考及最多 3 段音频参考。支持原生立体声音视频同步生成。公网 HTTP(S) 素材直接引用；工作区 Base64/二进制图片与音频会通过百炼临时文件接口上传（不超过 30 MB）后引用。",
  rules,
  models: [
    {
      id: "minimax-h3",
      label: "MiniMax H3",
      type: "video",
      mode: ["text", "singleImage", "endFrameOptional", "startFrameOptional", "startEndRequired", ["imageReference:9", "audioReference:3"]],
      audio: "optional",
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["768P", "2K"] }],
    },
  ] satisfies ProviderModel[],
  async generateVideo(request: VideoRequest) {
    return generateVideo(request, this);
  },
} satisfies ProviderDefinition<typeof rules>;

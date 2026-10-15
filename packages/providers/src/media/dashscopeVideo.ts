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

function imageUrl(input: MediaInput) {
  if (input.type !== "url" || !/^https?:\/\//i.test(input.url)) {
    throw new Error("百炼 MiniMax H3 图生视频需要可公网访问的 HTTP(S) 首帧图片地址");
  }
  return input.url;
}

function imageMimeType(input: MediaInput) {
  const mimeType = input.mimeType?.split(";", 1)[0].trim().toLowerCase();
  if (!mimeType || !imageMimeTypes.has(mimeType)) throw new Error("百炼 MiniMax H3 首帧图片仅支持 PNG、JPEG、WebP、HEIC 或 HEIF");
  return mimeType === "image/jpg" ? "image/jpeg" : mimeType;
}

function imageBytes(input: MediaInput, mimeType: string) {
  if (input.type === "binary") return input.data;
  if (input.type !== "base64") throw new Error("百炼 MiniMax H3 首帧图片必须是本地 Base64 或二进制图片");
  const value = input.data.replace(/^data:([^;,]+);base64,/i, (_match: string, dataMimeType: string) => {
    const normalized = dataMimeType.trim().toLowerCase() === "image/jpg" ? "image/jpeg" : dataMimeType.trim().toLowerCase();
    if (normalized !== mimeType) throw new Error("百炼 MiniMax H3 首帧图片的 MIME 类型与内容不一致");
    return "";
  }).replace(/\s/g, "");
  if (!value || value.length % 4 === 1 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(value)) throw new Error("百炼 MiniMax H3 首帧图片的 Base64 内容无效");
  return Buffer.from(value, "base64");
}

function requiredPolicyField(policy: Record<string, unknown>, field: string) {
  const value = policy[field];
  if (typeof value !== "string" || !value.trim()) throw new Error(`百炼临时文件上传策略缺少 ${field}`);
  return value;
}

async function uploadImage(context: ProviderContext<{ apiKey: string; baseUrl: string }>, baseUrl: string, apiKey: string, input: MediaInput, signal: AbortSignal) {
  if (input.type === "url") return { url: imageUrl(input), useOssResourceResolve: false };
  const mimeType = imageMimeType(input);
  const bytes = imageBytes(input, mimeType);
  if (!bytes.byteLength || bytes.byteLength > maxUploadBytes) throw new Error("百炼 MiniMax H3 首帧图片须为不超过 30 MB 的 PNG、JPEG、WebP、HEIC 或 HEIF");
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
  const key = `${uploadDirectory}/minimax-${crypto.randomUUID()}.${mimeType === "image/jpeg" ? "jpg" : mimeType.slice("image/".length)}`;
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
    throw new Error(`百炼首帧图片上传失败：HTTP ${uploadResponse.status}${detail ? `，${detail}` : ""}`);
  }
  return { url: `oss://${key}`, useOssResourceResolve: true };
}

async function uploadImages(context: ProviderContext<{ apiKey: string; baseUrl: string }>, baseUrl: string, apiKey: string, inputs: MediaInput[], signal: AbortSignal) {
  return Promise.all(inputs.map(input => uploadImage(context, baseUrl, apiKey, input, signal)));
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
  if (request.videos?.length || request.audios?.length) throw new Error("百炼 MiniMax H3 当前适配首尾帧和多图参考，暂不支持视频或音频参考");
  const images = request.images ?? [];
  if (images.length > 9) throw new Error("百炼 MiniMax H3 多图参考最多支持 9 张图片");
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
      ...(request.firstFrame ? [{ type: "first_frame" as const, input: request.firstFrame }] : []),
      ...(request.lastFrame ? [{ type: "last_frame" as const, input: request.lastFrame }] : []),
    ]
    : referenceMode
    ? images.map(input => ({ type: "image_url" as const, input }))
    : images[0]
    ? [{ type: "first_frame" as const, input: images[0] }]
    : [];
  const uploaded = await uploadImages(context, baseUrl, apiKey, frameInputs.map(item => item.input), signal);
  const media = uploaded.map((item, index) => ({ type: frameInputs[index]!.type, url: item.url }));
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
      parameters: { duration, resolution, ratio: referenceMode ? request.ratio ?? "adaptive" : "adaptive", prompt_extend: true, watermark: request.watermark ?? false },
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
  readme: "百炼原生视频接口，适配 MiniMax H3 文生视频、首尾帧图生视频和最多 9 张多图参考。公网 HTTP(S) 图片直接引用；工作区 Base64/二进制 PNG、JPEG、WebP、HEIC、HEIF 图片会通过百炼临时文件接口上传（不超过 30 MB）后引用。",
  rules,
  models: [
    {
      id: "minimax-h3",
      label: "MiniMax H3",
      type: "video",
      mode: ["text", "singleImage", "endFrameOptional", "startFrameOptional", "startEndRequired", ["imageReference:9"]],
      durationResolutionMap: [{ duration: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], resolution: ["768P", "2K"] }],
    },
  ] satisfies ProviderModel[],
  async generateVideo(request: VideoRequest) {
    return generateVideo(request, this);
  },
} satisfies ProviderDefinition<typeof rules>;

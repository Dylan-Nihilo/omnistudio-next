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
    value: "https://open302.com",
    props: { placeholder: "https://open302.com" },
  },
] as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("OpenHeap 图片响应格式错误");
  return value as Record<string, unknown>;
}

function mediaBytes(input: MediaInput) {
  if (input.type === "binary") return input.data;
  if (input.type === "base64") return Buffer.from(input.data.replace(/^data:[^,]+,/, ""), "base64");
  throw new Error("OpenHeap 图片编辑只支持本地参考图");
}

function sizeValue(request: ImageRequest) {
  const value = request.size?.trim().toUpperCase() ?? "1K";
  if (request.ratio && ["1K", "2K", "4K"].includes(value)) return request.ratio;
  const squareSizes: Record<string, string> = { "1K": "1024x1024", "2K": "2048x2048", "4K": "2880x2880" };
  const size = squareSizes[value] ?? value.toLowerCase();
  if (/^[1-9]\d{2,4}x[1-9]\d{2,4}$/.test(size)) return size;
  throw new Error("图片分辨率须为 1K、2K、4K 或宽x高像素尺寸");
}

function resolutionValue(request: ImageRequest) {
  const value = request.size?.trim().toUpperCase() ?? "1K";
  return ["1K", "2K", "4K"].includes(value) ? value : "1K";
}

function wait(signal?: AbortSignal, milliseconds = 2000) {
  signal?.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function generate(request: ImageRequest, context: ProviderContext<{ apiKey: string; baseUrl: string }>) {
  const apiKey = context.config.apiKey.trim();
  if (!apiKey) throw new Error("平台模型凭证未配置");
  const baseUrl = (context.config.baseUrl.trim() || "https://open302.com").replace(/\/+$/, "");
  const apiBaseUrl = baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
  const size = sizeValue(request);
  const resolution = resolutionValue(request);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const references = request.images ?? [];
  const maxAttempts = 3;
  let response: Response | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    context.signal?.throwIfAborted();
    if (references.length) {
      const form = new FormData();
      form.append("model", request.model);
      form.append("prompt", request.prompt);
      form.append("size", size);
      if (request.ratio) {
        form.append("resolution", resolution);
        form.append("aspect_ratio", request.ratio);
      }
      for (const [index, image] of references.entries()) {
        const mimeType = image.mimeType || "image/png";
        const extension = mimeType.split("/")[1] || "png";
        form.append("image", new File([mediaBytes(image) as unknown as BlobPart], `reference-${index}.${extension}`, { type: mimeType }));
      }
      response = await context.tool.fetch(`${apiBaseUrl}/images/edits`, { method: "POST", headers, body: form, signal: context.signal });
    } else {
      response = await context.tool.fetch(`${apiBaseUrl}/images/generations`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ model: request.model, prompt: request.prompt, size, n: 1, ...(request.ratio ? { resolution, aspect_ratio: request.ratio } : {}) }), signal: context.signal,
      });
    }
    if (response.status === 429 && attempt < maxAttempts) {
      await wait(context.signal, attempt * 2000);
      continue;
    }
    break;
  }
  if (!response || !response.ok) {
    const message = response ? context.tool.errorMessage(await response.text()) : "";
    if (response?.status === 429) {
      throw new Error(`OpenHeap 供应商并发限流（HTTP 429 Too many requests），当前模型通道并发已满或调用过频，已自动重试未果，请稍候再试或切换其他图片模型`);
    }
    throw new Error(`OpenHeap 图片请求失败：HTTP ${response?.status ?? 500}${message ? `，${message}` : ""}`);
  }
  const result = object(await response.json());
  const item = Array.isArray(result.data) ? object(result.data[0]) : undefined;
  if (typeof item?.url === "string" && item.url) return [{ mediaType: "image" as const, type: "url" as const, url: item.url }];
  if (typeof item?.b64_json === "string" && item.b64_json) return [{ mediaType: "image" as const, type: "base64" as const, data: item.b64_json, mimeType: "image/png" }];
  throw new Error("OpenHeap 图片响应未返回图像");
}

export default {
  id: "openheapImage",
  label: "OpenHeap 图片",
  version: "1.0.2",
  apiUrl: "https://open302.com",
  protocol: "openai-completions",
  readme: "OpenHeapStack OpenAI 兼容图片服务。",
  rules,
  models: [
    { id: "gpt-image-2", label: "GPT Image 2", type: "image", mode: ["text", "singleImage", "multiReference"], imageSizes: ["1K", "2K", "4K"], imageRatios: ["1:1", "16:9", "9:16"] },
    { id: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", type: "image", mode: ["text", "singleImage", "multiReference"], imageSizes: ["1K", "2K", "4K"], imageRatios: ["1:1", "16:9", "9:16"] },
    { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst", type: "image", mode: ["text", "singleImage", "multiReference"], imageSizes: ["1K", "2K", "4K"], imageRatios: ["1:1", "16:9", "9:16"] },
  ] satisfies ProviderModel[],
  async generateImage(request: ImageRequest) {
    return generate(request, this);
  },
} satisfies ProviderDefinition<typeof rules>;

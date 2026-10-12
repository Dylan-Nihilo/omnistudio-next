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
    value: "https://openheapstack.com/v1",
    props: { placeholder: "https://openheapstack.com/v1" },
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
  const imageSizes: Record<string, Record<string, string>> = {
    "1K": { "1:1": "1024x1024", "16:9": "1280x720", "9:16": "720x1280" },
    "2K": { "1:1": "2048x2048", "16:9": "2048x1152", "9:16": "1152x2048" },
    "4K": { "1:1": "2880x2880", "16:9": "3840x2160", "9:16": "2160x3840" },
  };
  const value = request.size?.trim().toUpperCase() ?? (request.ratio ? "2K" : "1K");
  const size = imageSizes[value]?.[request.ratio ?? "1:1"] ?? value.toLowerCase();
  if (/^[1-9]\d{2,4}x[1-9]\d{2,4}$/.test(size)) return size;
  throw new Error("图片分辨率须为 1K、2K、4K 或宽x高像素尺寸");
}

async function generate(request: ImageRequest, context: ProviderContext<{ apiKey: string; baseUrl: string }>) {
  const apiKey = context.config.apiKey.trim();
  if (!apiKey) throw new Error("平台模型凭证未配置");
  const baseUrl = (context.config.baseUrl.trim() || "https://openheapstack.com/v1").replace(/\/$/, "");
  const size = sizeValue(request);
  const headers = { Authorization: `Bearer ${apiKey}` };
  const references = request.images ?? [];
  let response: Response;
  if (references.length) {
    const form = new FormData();
    form.append("model", request.model);
    form.append("prompt", request.prompt);
    form.append("size", size);
    for (const [index, image] of references.entries()) {
      const mimeType = image.mimeType || "image/png";
      const extension = mimeType.split("/")[1] || "png";
      form.append("image", new File([mediaBytes(image) as unknown as BlobPart], `reference-${index}.${extension}`, { type: mimeType }));
    }
    response = await context.tool.fetch(`${baseUrl}/images/edits`, { method: "POST", headers, body: form, signal: context.signal });
  } else {
    response = await context.tool.fetch(`${baseUrl}/images/generations`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model: request.model, prompt: request.prompt, size, n: 1 }), signal: context.signal,
    });
  }
  if (!response.ok) {
    const message = context.tool.errorMessage(await response.text());
    throw new Error(`OpenHeap 图片请求失败：HTTP ${response.status}${message ? `，${message}` : ""}`);
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
  version: "1.0.1",
  apiUrl: "https://openheapstack.com/v1",
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

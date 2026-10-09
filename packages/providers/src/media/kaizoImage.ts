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
    value: "https://www.kaizo.top/v1",
    props: { placeholder: "https://www.kaizo.top/v1" },
  },
] as const;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Kaizo 图片响应格式错误");
  return value as Record<string, unknown>;
}

function mediaBytes(input: MediaInput) {
  if (input.type === "binary") return input.data;
  if (input.type === "base64") return Buffer.from(input.data.replace(/^data:[^,]+,/, ""), "base64");
  throw new Error("Kaizo 图片编辑只支持本地参考图");
}

async function generate(request: ImageRequest, context: ProviderContext<{ apiKey: string; baseUrl: string }>) {
  const apiKey = context.config.apiKey.trim();
  if (!apiKey) throw new Error("平台模型凭证未配置");
  const baseUrl = (context.config.baseUrl.trim() || "https://www.kaizo.top/v1").replace(/\/$/, "");
  const headers = { Authorization: `Bearer ${apiKey}` };
  const references = request.images ?? [];
  let response: Response;
  if (references.length) {
    const boundary = `----toonflow-kaizo-${Date.now().toString(16)}`;
    const chunks: BlobPart[] = [];
    const append = (value: string | Uint8Array) => chunks.push(typeof value === "string" ? value : value as unknown as BlobPart);
    const addField = (name: string, value: string) => {
      append(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
    };
    addField("model", request.model);
    addField("prompt", request.prompt);
    addField("size", request.size ?? "1024x1024");
    addField("quality", "high");
    for (const [index, image] of references.entries()) {
      const mimeType = image.mimeType || "image/png";
      const extension = mimeType.split("/")[1] || "png";
      append(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="reference-${index}.${extension}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
      append(mediaBytes(image));
      append("\r\n");
    }
    append(`--${boundary}--\r\n`);
    response = await context.tool.fetch(`${baseUrl}/images/edits`, {
      method: "POST", headers: { ...headers, "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: new Blob(chunks), signal: context.signal,
    });
  } else {
    response = await context.tool.fetch(`${baseUrl}/images/generations`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model: request.model, prompt: request.prompt, size: request.size ?? "1024x1024", quality: "high", n: 1 }),
      signal: context.signal,
    });
  }
  if (!response.ok) throw new Error(`Kaizo 图片请求失败：HTTP ${response.status}`);
  const result = object(await response.json());
  const item = Array.isArray(result.data) ? object(result.data[0]) : undefined;
  if (typeof item?.url === "string" && item.url) return [{ mediaType: "image" as const, type: "url" as const, url: item.url }];
  if (typeof item?.b64_json === "string" && item.b64_json) return [{ mediaType: "image" as const, type: "base64" as const, data: item.b64_json, mimeType: "image/png" }];
  throw new Error("Kaizo 图片响应未返回图像");
}

export default {
  id: "kaizoImage",
  label: "Kaizo 图片",
  version: "1.0.0",
  apiUrl: "https://www.kaizo.top/v1",
  protocol: "openai-completions",
  readme: "旧 OmniStudio 使用的 Kaizo OpenAI 兼容图片服务。",
  rules,
  models: [{ id: "gpt-image-2", label: "GPT Image 2", type: "image", mode: ["text", "singleImage", "multiReference"] }],
  async generateImage(request: ImageRequest) {
    return generate(request, this);
  },
} satisfies ProviderDefinition<typeof rules>;

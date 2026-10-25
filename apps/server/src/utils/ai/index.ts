import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import type { Context, Model } from "@earendil-works/pi-ai";
import { z } from "zod";
import { readReference } from "@/utils/media/generation";
import modelContextLimits from "@/utils/ai/modelContextLimits";
import { getVideoInputCapability, type VideoInputCapability } from "@/utils/ai/platformCatalog";
import { getPlatformModel, listPlatformModels } from "@/services/modelService";
import { createChargedStream } from "@/services/generationService";

export { fetchProviderModels } from "@/utils/ai/models";
export { getVideoInputCapability };

export const providerSchema = z.object({
  apiUrl: z.url({ protocol: /^https?$/ }),
  apiKey: z.string(),
  protocol: z.enum(["openai-completions", "openai-responses", "anthropic-messages"]),
  models: z.array(z.object({
    id: z.string(), label: z.string(),
    contextWindow: z.number().int().positive().optional(),
    maxOutputTokens: z.number().int().positive().optional(),
  })),
});

const builtinModels = getBuiltinProviders().flatMap(provider => getBuiltinModels(provider));
const providerDisplayNames: Record<string, string> = { kaizoText: "高级模型", kaizoClaude: "极致模型", dashscope: "百炼模型" };

export function getModelLimits(providerId: string, model: z.infer<typeof providerSchema>["models"][number]) {
  const limits = modelContextLimits.find(item => item.id === model.id)
    ?? modelContextLimits.find(item => item.id instanceof RegExp && model.id.search(item.id) !== -1);
  if (limits) return { contextWindow: limits.contextWindow, maxTokens: limits.maxTokens };
  if (model.contextWindow != null && model.maxOutputTokens != null) {
    return { contextWindow: model.contextWindow, maxTokens: model.maxOutputTokens };
  }
  const matches = builtinModels.filter(item => item.id === model.id);
  const exact = matches.find(item => item.provider === providerId);
  const candidates = exact ? [exact] : matches;
  // ACT: 只精确匹配 ID；跨供应商同名参数逐项一致才采用，不猜别名。
  const contextWindow = candidates.every(item => item.contextWindow === candidates[0]?.contextWindow) ? candidates[0]?.contextWindow : undefined;
  const maxTokens = candidates.every(item => item.maxTokens === candidates[0]?.maxTokens) ? candidates[0]?.maxTokens : undefined;
  return {
    contextWindow: model.contextWindow ?? contextWindow ?? 262144,
    maxTokens: model.maxOutputTokens ?? maxTokens ?? 32768,
  };
}

export async function getConfiguredModel(providerId: string, modelId: string) {
  const configured = await getPlatformModel(providerId, modelId, "text");
  const limits = getModelLimits(providerId, configured.model);
  return { ...configured, model: { ...configured.model, contextWindow: limits.contextWindow, maxOutputTokens: limits.maxTokens } };
}

export async function listAiModels() {
  const models = await listPlatformModels("text");
  return models.map(model => ({
    providerId: model.providerId, providerLabel: providerDisplayNames[model.providerId] ?? model.providerId, protocol: model.protocol, modelId: model.modelId, label: model.label,
    contextWindow: 262144, maxOutputTokens: 32768, capabilities: model.capabilities,
    videoInput: getVideoInputCapability(model.providerId, model.modelId),
  }));
}

const aiApis = {
  "openai-completions": openAICompletionsApi(),
  "openai-responses": openAIResponsesApi(),
  "anthropic-messages": anthropicMessagesApi(),
};

export const aiReferenceSchema = z.discriminatedUnion("dataType", [
  z.object({ dataType: z.literal("STRING"), value: z.string().max(1000000) }),
  z.object({ dataType: z.literal("IMAGE"), value: z.object({ url: z.string().min(1).max(4096), mimeType: z.string().startsWith("image/") }) }),
  z.object({ dataType: z.literal("VIDEO"), value: z.object({ url: z.string().min(1).max(4096), mimeType: z.string().startsWith("video/") }) }),
]);

export async function readAiReferences(directory: string | undefined, references: z.infer<typeof aiReferenceSchema>[], signal?: AbortSignal, videoInput?: VideoInputCapability, apiKey?: string) {
  return Promise.all(references.map(async (item) => {
    if (item.dataType === "STRING") return { dataType: item.dataType, value: item.value, useOss: false };
    if (item.dataType === "VIDEO" && !videoInput?.supported) throw Object.assign(new Error("当前模型不支持原生视频输入，请切换到百炼 qwen3.7-plus"), { status: 400 });
    // ACT: 公网 HTTP/HTTPS 视频直传给模型 video_url，无需本地转换并享受官方 1 GB / 2 小时规格。
    if (item.dataType === "VIDEO" && /^https?:\/\//i.test(item.value.url)) {
      return { dataType: item.dataType, value: item.value.url, useOss: false };
    }
    if (!directory) throw Object.assign(new Error("媒体参考需要工作目录"), { status: 400 });
    if (item.dataType === "VIDEO") {
      const { resolveWorkspacePath } = await import("@/utils/workspace/files");
      const { stat: fsStat, readFile: fsReadFile } = await import("node:fs/promises");
      const { path } = await resolveWorkspacePath(directory, item.value.url);
      const info = await fsStat(path);
      const maxBase64 = videoInput?.maxBase64Bytes ?? 7864320;
      const maxUrl = videoInput?.maxUrlBytes ?? 1073741824;
      if (info.size > maxUrl) throw Object.assign(new Error("视频文件超过当前模型上限（1 GB）"), { status: 400 });
      if (info.size > maxBase64) {
        if (!apiKey) throw Object.assign(new Error("本地视频超过 7.5 MB，需配置百炼 API Key 自动上传或使用公网视频链接（最大 1 GB）"), { status: 400 });
        const { uploadDashscopeVideo } = await import("@/utils/ai/dashscopeUpload");
        const bytes = await fsReadFile(path, { signal });
        const ossUrl = await uploadDashscopeVideo(apiKey, bytes, item.value.mimeType, item.value.url, signal);
        return { dataType: item.dataType, value: ossUrl, useOss: true };
      }
    }
    const media = await readReference(directory, { path: item.value.url, mimeType: item.value.mimeType }, item.dataType.toLowerCase(), signal);
    const value = `data:${media.mimeType};base64,${media.data}`;
    if (item.dataType === "VIDEO" && videoInput?.maxEncodedBytes && Buffer.byteLength(value) >= videoInput.maxEncodedBytes) {
      throw Object.assign(new Error(`视频 Base64 编码后必须小于 ${Math.floor(videoInput.maxEncodedBytes / 1024 / 1024)} MB`), { status: 400 });
    }
    return { dataType: item.dataType, value, useOss: false };
  }));
}

export function referenceContent(protocol: string, prompt: string, references: Awaited<ReturnType<typeof readAiReferences>>) {
  const textPart = (text: string) => ({ type: protocol === "openai-responses" ? "input_text" : "text", text });
  const content: object[] = [textPart(prompt)];
  references.forEach((item, index) => {
    content.push(textPart(`{{ref ${index + 1}}}${item.dataType === "STRING" ? `\n${item.value}` : ""}`));
    if (item.dataType === "STRING") return;
    if (protocol === "openai-completions") {
      content.push(item.dataType === "IMAGE"
        ? { type: "image_url", image_url: { url: item.value } }
        : { type: "video_url", video_url: { url: item.value } });
    } else if (protocol === "openai-responses") {
      if (item.dataType === "VIDEO") throw Object.assign(new Error("当前 OpenAI Responses 模型未声明原生视频输入能力"), { status: 400 });
      const extension = item.value.slice(11, item.value.indexOf(";")).replace("quicktime", "mov");
      content.push(item.dataType === "IMAGE"
        ? { type: "input_image", image_url: item.value, detail: "auto" }
        : { type: "input_file", filename: `reference${index + 1}.${extension}`, file_data: item.value });
    } else {
      if (item.dataType === "VIDEO") throw Object.assign(new Error("Anthropic Claude 官方 API 不支持原生视频输入"), { status: 400 });
      const separator = item.value.indexOf(",");
      content.push({
        type: "image",
        source: { type: "base64", media_type: item.value.slice(5, item.value.indexOf(";")), data: item.value.slice(separator + 1) },
      });
    }
  });
  return content;
}

export function streamAi(
  configured: Awaited<ReturnType<typeof getConfiguredModel>>,
  context: Context,
  signal: AbortSignal,
  references: Awaited<ReturnType<typeof readAiReferences>> = [],
  idempotencyKey?: string,
  directory?: string,
) {
  const { provider, model: configuredModel, baseUrl } = configured;
  const model: Model<typeof provider.protocol> = {
    id: configuredModel.id, name: configuredModel.label, provider: "omnistudio-next", api: provider.protocol, baseUrl,
    reasoning: false, input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: configuredModel.contextWindow,
    maxTokens: configuredModel.maxOutputTokens,
  };
  const videoInput = getVideoInputCapability(configured.catalog.providerId, configured.catalog.modelId);
  if (references.some(item => item.dataType === "VIDEO") && !videoInput?.supported) {
    throw Object.assign(new Error("当前模型不支持原生视频输入，请切换到百炼 qwen3.7-plus"), { status: 400 });
  }
  const maxTokens = configuredModel.maxOutputTokens;
  const useOss = references.some(item => (item as { useOss?: boolean }).useOss);
  return createChargedStream({ providerId: configured.catalog.providerId, modelId: configured.catalog.modelId, model, context, budgetContext: { context, references }, directory, signal, idempotencyKey }, (streamSignal, recordPayload, guardedFetch) => aiApis[provider.protocol].streamSimple(model, context, {
    apiKey: provider.apiKey,
    signal: streamSignal,
    fetch: ((input, init) => {
      const headers = new Headers(init?.headers);
      if (useOss) headers.set("X-DashScope-OssResourceResolve", "enable");
      return guardedFetch(input, { ...init, headers });
    }) as typeof fetch,
    maxTokens,
    onPayload: async (payload) => {
      if (!references.length) { await recordPayload(payload); return payload; }
      const body = payload as Record<string, unknown>;
      const field = provider.protocol === "openai-responses" ? "input" : "messages";
      const messages = body[field] as { role: string; content: unknown }[];
      // ACT: 后续 Anthropic 工具结果也使用 user 角色，附件只补充到最初的输入。
      const firstUser = messages.findIndex(message => message.role === "user");
      const attachmentContent = referenceContent(provider.protocol, "", references).slice(1);
      const finalPayload = { ...body, [field]: messages.map((message, index) => index === firstUser
        ? { ...message, content: [
          ...(Array.isArray(message.content) ? message.content : referenceContent(provider.protocol, String(message.content ?? ""), [])),
          ...attachmentContent,
        ] }
        : message) };
      await recordPayload(finalPayload);
      return finalPayload;
    },
  }));
}

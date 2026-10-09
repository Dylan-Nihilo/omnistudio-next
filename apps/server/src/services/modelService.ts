import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/database";
import { platformModels, platformProviderConfigs } from "@/db/schema";
import { readPlatformSecret } from "@/utils/platformSecrets";

export const platformProviderSchema = z.object({
  apiUrl: z.url({ protocol: /^https?$/ }),
  protocol: z.enum(["openai-completions", "openai-responses", "anthropic-messages"]),
});

export type PlatformModel = typeof platformModels.$inferSelect;

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function providerConfig(value: unknown) {
  const parsed = platformProviderSchema.safeParse(value);
  if (!parsed.success) invalid("平台供应商配置无效", 503);
  return parsed.data;
}

export async function listPlatformModels(mediaType?: PlatformModel["mediaType"]) {
  const filters = [eq(platformModels.enabled, 1)];
  if (mediaType) filters.push(eq(platformModels.mediaType, mediaType));
  const rows = await getDatabase().select({
    providerId: platformModels.providerId, modelId: platformModels.modelId, label: platformModels.label,
    mediaType: platformModels.mediaType, apiModelId: platformModels.apiModelId, capabilities: platformModels.capabilities,
    protocolConfig: platformProviderConfigs.config,
  }).from(platformModels).innerJoin(platformProviderConfigs, eq(platformProviderConfigs.providerId, platformModels.providerId))
    .where(and(...filters, eq(platformProviderConfigs.enabled, 1))).orderBy(asc(platformModels.sortOrder), asc(platformModels.label));
  return rows.map(({ protocolConfig, ...model }) => ({ ...model, protocol: providerConfig(protocolConfig).protocol }));
}

export async function getPlatformModel(providerId: string, modelId: string, mediaType: PlatformModel["mediaType"]) {
  const [model] = await getDatabase().select().from(platformModels).where(and(eq(platformModels.providerId, providerId), eq(platformModels.modelId, modelId), eq(platformModels.mediaType, mediaType), eq(platformModels.enabled, 1))).limit(1);
  if (!model) invalid("所选模型未启用或不存在", 400);
  const [provider] = await getDatabase().select().from(platformProviderConfigs).where(and(eq(platformProviderConfigs.providerId, providerId), eq(platformProviderConfigs.enabled, 1))).limit(1);
  if (!provider) invalid("模型供应商当前不可用", 503);
  const config = providerConfig(provider.config);
  const secretRef = provider.secretRef?.trim();
  const apiKey = await readPlatformSecret(providerId) ?? (secretRef ? process.env[secretRef]?.trim() : "");
  if (!apiKey) invalid("平台模型凭证未配置", 503);
  const baseUrl = new URL(config.apiUrl);
  if (baseUrl.pathname === "/") baseUrl.pathname = "/v1";
  return {
    provider: { apiUrl: config.apiUrl, apiKey, protocol: config.protocol, models: [{ id: model.modelId, label: model.label }] },
    model: { id: model.apiModelId || model.modelId, label: model.label, contextWindow: 262144, maxOutputTokens: 32768 },
    baseUrl: baseUrl.href.replace(/\/+$/, ""),
    catalog: model,
  };
}

export async function getPlatformMediaModel(providerId: string, modelId: string, mediaType: Exclude<PlatformModel["mediaType"], "text">) {
  const [model] = await getDatabase().select().from(platformModels).where(and(
    eq(platformModels.providerId, providerId),
    eq(platformModels.modelId, modelId),
    eq(platformModels.mediaType, mediaType),
    eq(platformModels.enabled, 1),
  )).limit(1);
  if (!model) invalid("所选媒体模型未启用或不存在", 400);
  return model;
}

export async function requireEnabledPlatformModel(providerId: string, modelId: string, mediaType: PlatformModel["mediaType"]) {
  const [model] = await getDatabase().select().from(platformModels).where(and(eq(platformModels.providerId, providerId), eq(platformModels.modelId, modelId), eq(platformModels.mediaType, mediaType), eq(platformModels.enabled, 1))).limit(1);
  if (!model) invalid("所选模型未启用或不存在", 400);
  return model;
}

export async function getPlatformProviderRuntimeConfig(providerId: string) {
  const [provider] = await getDatabase().select().from(platformProviderConfigs).where(and(eq(platformProviderConfigs.providerId, providerId), eq(platformProviderConfigs.enabled, 1))).limit(1);
  if (!provider) invalid("模型供应商当前不可用", 503);
  const config = provider.config && typeof provider.config === "object" && !Array.isArray(provider.config) ? provider.config as Record<string, unknown> : {};
  const apiKey = await readPlatformSecret(providerId) ?? (provider.secretRef?.trim() ? process.env[provider.secretRef.trim()]?.trim() : "");
  if (!apiKey) invalid("平台模型凭证未配置", 503);
  return { ...structuredClone(config), ...(apiKey ? { apiKey } : {}) };
}

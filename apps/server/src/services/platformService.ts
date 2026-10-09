import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/database";
import { auditEvents, platformModels, platformProviderConfigs, platformSecrets, priceBookVersions, pricingItems, pricingSettings } from "@/db/schema";
import { requireRootAccount } from "@/utils/accountContext";
import { encryptPlatformSecret } from "@/utils/platformSecrets";
import { platformModelCatalog, platformProviders } from "@/utils/ai/platformCatalog";
import { getMediaProvider, listMediaProviders } from "@/utils/media/provider";

const apiUrl = z.url({ protocol: /^https?$/ }).max(2048).refine(value => {
  const url = new URL(value);
  return !url.username && !url.password && !url.search && !url.hash;
}, "API 地址不能包含账号、密码、查询参数或锚点");

export const providerInputSchema = z.strictObject({
  providerId: z.string().regex(/^[a-z][a-zA-Z0-9]{0,99}$/),
  apiUrl, protocol: z.enum(["openai-completions", "openai-responses", "anthropic-messages"]),
  enabled: z.boolean(), apiKey: z.string().trim().max(8192).regex(/^[^\r\n\u0000]*$/).optional(), removeApiKey: z.boolean().optional(),
}).refine(value => !value.removeApiKey || !value.apiKey, "不能同时保存和移除 API 凭据");

export const modelInputSchema = z.strictObject({
  id: z.uuid().optional(), providerId: z.string().min(1).max(100), modelId: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200), mediaType: z.enum(["text", "image", "video", "audio"]),
  apiModelId: z.string().trim().max(200).optional(), enabled: z.boolean(), sortOrder: z.number().int().min(-100000).max(100000),
  capabilities: z.record(z.string(), z.json()).refine(value => JSON.stringify(value).length <= 100000, "模型能力配置不能超过 100 KB").optional(),
});

export const pricesInputSchema = z.strictObject({ items: z.array(z.strictObject({
  providerId: z.string().min(1).max(100), modelId: z.string().min(1).max(200), mediaType: z.enum(["text", "image", "video", "audio"]),
  creditsPerUnit: z.number().int().min(0).max(1_000_000_000),
})).min(1).max(1000) });

export async function getPlatformConfiguration() {
  requireRootAccount();
  const database = getDatabase();
  const providers = await database.select().from(platformProviderConfigs).orderBy(asc(platformProviderConfigs.providerId));
  const secretIds = new Set((await database.select({ id: platformSecrets.id }).from(platformSecrets)).map(row => row.id));
  const models = await database.select().from(platformModels).orderBy(asc(platformModels.sortOrder), asc(platformModels.label));
  const [pricing] = await database.select().from(pricingSettings).where(eq(pricingSettings.id, "platform")).limit(1);
  const [version] = pricing?.activePriceBookVersionId ? await database.select().from(priceBookVersions).where(eq(priceBookVersions.id, pricing.activePriceBookVersionId)).limit(1) : [];
  const prices = version ? await database.select().from(pricingItems).where(eq(pricingItems.priceBookVersionId, version.id)) : [];
  const mediaProviders = await listMediaProviders();
  return {
    providers: providers.map(provider => ({ id: provider.id, providerId: provider.providerId, enabled: Boolean(provider.enabled), config: provider.config, apiKeyConfigured: secretIds.has(provider.providerId) || Boolean(provider.secretRef && process.env[provider.secretRef]?.trim()) })),
    models, prices, priceVersion: version?.version ?? null,
    mediaProviders: mediaProviders.map(provider => ({ id: provider.id, label: provider.label, models: provider.models })),
  };
}

export async function savePlatformProvider(input: z.infer<typeof providerInputSchema>) {
  const account = requireRootAccount();
  const now = new Date();
  const ciphertext = input.apiKey ? encryptPlatformSecret(input.apiKey) : undefined;
  await getDatabase().transaction(async tx => {
    const [existing] = await tx.select().from(platformProviderConfigs).where(eq(platformProviderConfigs.providerId, input.providerId)).limit(1).for("update");
    const config = { apiUrl: input.apiUrl, baseUrl: input.apiUrl, protocol: input.protocol };
    await tx.insert(platformProviderConfigs).values({ id: existing?.id ?? randomUUID(), providerId: input.providerId, enabled: input.enabled ? 1 : 0, config, secretRef: input.removeApiKey ? null : existing?.secretRef ?? null, createdAt: existing?.createdAt ?? now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { enabled: input.enabled ? 1 : 0, config, secretRef: input.removeApiKey ? null : existing?.secretRef ?? null, updatedAt: now } });
    if (input.removeApiKey) await tx.delete(platformSecrets).where(eq(platformSecrets.id, input.providerId));
    else if (ciphertext) await tx.insert(platformSecrets).values({ id: input.providerId, ciphertext, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { ciphertext, updatedAt: now } });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: "platform.provider.save", metadata: { providerId: input.providerId, enabled: input.enabled, credentialChanged: Boolean(ciphertext) || input.removeApiKey === true }, createdAt: now, updatedAt: now });
  });
}

export async function savePlatformModel(input: z.infer<typeof modelInputSchema>) {
  const account = requireRootAccount();
  const database = getDatabase();
  const [provider] = await database.select({ id: platformProviderConfigs.id }).from(platformProviderConfigs).where(eq(platformProviderConfigs.providerId, input.providerId)).limit(1);
  if (!provider) throw Object.assign(new Error("请先配置这个 API 提供方"), { status: 400 });
  if (input.mediaType !== "text") {
    if (input.apiModelId && input.apiModelId !== input.modelId) throw Object.assign(new Error("媒体模型的上游标识由已安装适配器管理"), { status: 400 });
    const installed = await getMediaProvider(input.providerId);
    if (!installed.models.some(model => model.id === input.modelId && model.type === input.mediaType)) throw Object.assign(new Error("这个媒体模型尚未由已安装的适配器支持"), { status: 400 });
  }
  const now = new Date();
  await database.transaction(async tx => {
    const [existing] = input.id ? await tx.select().from(platformModels).where(eq(platformModels.id, input.id)).limit(1).for("update") : [];
    if (input.id && !existing) throw Object.assign(new Error("模型不存在，请刷新后重试"), { status: 404 });
    if (existing && (existing.providerId !== input.providerId || existing.modelId !== input.modelId || existing.mediaType !== input.mediaType)) throw Object.assign(new Error("已有模型的标识与类型不能更改，请添加新模型并停用旧模型"), { status: 409 });
    const value = { label: input.label, apiModelId: input.apiModelId || null, enabled: input.enabled ? 1 : 0, sortOrder: input.sortOrder, capabilities: input.capabilities ?? null, updatedAt: now };
    if (existing) await tx.update(platformModels).set(value).where(eq(platformModels.id, existing.id));
    else await tx.insert(platformModels).values({ id: randomUUID(), providerId: input.providerId, modelId: input.modelId, mediaType: input.mediaType, ...value, createdAt: now });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: "platform.model.save", metadata: { providerId: input.providerId, modelId: input.modelId, enabled: input.enabled }, createdAt: now, updatedAt: now });
  });
}

export async function initializePlatformCatalog() {
  const account = requireRootAccount();
  const now = new Date();
  await getDatabase().transaction(async tx => {
    for (const provider of platformProviders) await tx.insert(platformProviderConfigs).values({ id: randomUUID(), providerId: provider.providerId, enabled: 1, config: { apiUrl: provider.apiUrl, protocol: provider.protocol, ...provider.config }, secretRef: provider.secretRef, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { providerId: provider.providerId } });
    for (const model of platformModelCatalog) await tx.insert(platformModels).values({ id: randomUUID(), ...model, enabled: 1, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { modelId: model.modelId } });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: "platform.catalog.initialize", createdAt: now, updatedAt: now });
  });
}

export async function publishPlatformPrices(input: z.infer<typeof pricesInputSchema>) {
  const account = requireRootAccount();
  const keys = input.items.map(item => `${item.providerId}:${item.mediaType}:${item.modelId}`);
  if (new Set(keys).size !== keys.length) throw Object.assign(new Error("同一模型的价格不能重复"), { status: 400 });
  const now = new Date();
  return getDatabase().transaction(async tx => {
    await tx.insert(pricingSettings).values({ id: "platform", createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
    await tx.select().from(pricingSettings).where(eq(pricingSettings.id, "platform")).limit(1).for("update");
    const catalog = await tx.select().from(platformModels);
    for (const item of input.items) if (!catalog.some(model => model.providerId === item.providerId && model.modelId === item.modelId && model.mediaType === item.mediaType)) throw Object.assign(new Error("价格中包含不存在的模型，请刷新后重试"), { status: 400 });
    if (catalog.some(model => model.enabled && !keys.includes(`${model.providerId}:${model.mediaType}:${model.modelId}`))) throw Object.assign(new Error("请为所有已启用模型填写价格"), { status: 400 });
    const [previous] = await tx.select().from(priceBookVersions).orderBy(desc(priceBookVersions.version)).limit(1);
    const id = randomUUID();
    const version = (previous?.version ?? 0) + 1;
    await tx.insert(priceBookVersions).values({ id, version, status: "published", publishedAt: now, createdAt: now, updatedAt: now });
    for (const item of input.items) await tx.insert(pricingItems).values({ id: randomUUID(), priceBookVersionId: id, ...item, unit: item.mediaType === "video" ? "second" : item.mediaType === "image" ? "image" : "10k_chars", constraints: {}, createdAt: now, updatedAt: now });
    await tx.update(pricingSettings).set({ activePriceBookVersionId: id, updatedAt: now }).where(eq(pricingSettings.id, "platform"));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: "platform.prices.publish", metadata: { version, items: input.items }, createdAt: now, updatedAt: now });
    return { version };
  });
}

export async function listPlatformAudit() {
  requireRootAccount();
  return getDatabase().select().from(auditEvents).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(200);
}

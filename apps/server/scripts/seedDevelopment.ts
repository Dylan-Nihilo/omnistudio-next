import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { checkDatabase, closeDatabase, getDatabase, runSqlMigrations } from "@/db/database";
import { creditLedger, platformModels, platformProviderConfigs, platformRoles, pricingItems, pricingSettings, priceBookVersions, users, wallets, workspaceMemberships, workspaces } from "@/db/schema";

if (process.env.NODE_ENV !== "development" || process.env.SEED_DEVELOPMENT !== "true") {
  throw new Error("开发 seed 仅允许在 NODE_ENV=development 且 SEED_DEVELOPMENT=true 时执行");
}

await runSqlMigrations();
await checkDatabase();
const database = getDatabase();
const now = new Date();
const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@omnistudio.local").trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe_123456";
if (!email || !password || password.length < 12) throw new Error("SEED_ADMIN_EMAIL 和长度至少 12 位的 SEED_ADMIN_PASSWORD 必须有效");

const [existingUser] = await database.select().from(users).where(eq(users.email, email)).limit(1);
const userId = existingUser?.id ?? randomUUID();
const passwordHash = existingUser?.passwordHash ?? await hash(password, { algorithm: 2 });
await database.insert(users).values({ id: userId, email, displayName: existingUser?.displayName ?? "开发管理员", passwordHash, status: "active", createdAt: existingUser?.createdAt ?? now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });

await database.insert(platformRoles).values({ id: randomUUID(), userId, role: "root", createdAt: now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });

const slug = "development";
const [existingWorkspace] = await database.select().from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
const workspaceId = existingWorkspace?.id ?? randomUUID();
await database.insert(workspaces).values({ id: workspaceId, name: existingWorkspace?.name ?? "开发工作区", slug, createdBy: userId, createdAt: existingWorkspace?.createdAt ?? now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });
await database.insert(workspaceMemberships).values({ id: randomUUID(), workspaceId, userId, role: "owner", createdAt: now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });
await database.insert(wallets).values({ id: randomUUID(), workspaceId, balance: 100000, frozen: 0, createdAt: now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });
const [seedWallet] = await database.select().from(wallets).where(eq(wallets.workspaceId, workspaceId)).limit(1);
if (seedWallet) {
  const [seedLedger] = await database.select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.idempotencyKey, "seed:development:initial-credits")).limit(1);
  if (!seedLedger) await database.insert(creditLedger).values({
    id: randomUUID(), walletId: seedWallet.id, workspaceId, actorUserId: userId, kind: "grant", amount: seedWallet.balance,
    balanceAfter: seedWallet.balance, frozenAfter: seedWallet.frozen, idempotencyKey: "seed:development:initial-credits",
    reason: "开发环境初始积分", createdAt: now, updatedAt: now,
  });
}

// 开发环境提供一套可直接验证登录、模型目录和积分流程的目录。密钥只从服务端环境变量读取，绝不写入数据库。
const providerConfigs = [
  { providerId: "dashscope", apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", protocol: "openai-completions" as const, secretRef: "DASHSCOPE_API_KEY", config: {} },
  { providerId: "deepSeek", apiUrl: "https://api.deepseek.com", protocol: "openai-completions" as const, secretRef: "DEEPSEEK_API_KEY", config: {} },
  { providerId: "apiMart", apiUrl: "https://api.apib.ai/v1", protocol: "openai-completions" as const, secretRef: "APIMART_API_KEY", config: { isOverseas: "1" } },
  { providerId: "meta", apiUrl: "https://metaso.cn/api/minimax", protocol: "openai-completions" as const, secretRef: "METASO_API_KEY", config: { baseUrl: "https://metaso.cn/api/minimax" } },
];
for (const provider of providerConfigs) {
  await database.insert(platformProviderConfigs).values({
    id: randomUUID(), providerId: provider.providerId, enabled: 1,
    config: { apiUrl: provider.apiUrl, protocol: provider.protocol, ...provider.config }, secretRef: provider.secretRef,
    createdAt: now, updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { enabled: 1, config: { apiUrl: provider.apiUrl, protocol: provider.protocol, ...provider.config }, secretRef: provider.secretRef, updatedAt: now } });
}

const models: Array<{ providerId: string; modelId: string; label: string; mediaType: "text" | "image" | "video"; apiModelId?: string; capabilities?: Record<string, boolean>; sortOrder: number }> = [
  { providerId: "dashscope", modelId: "qwen-plus", label: "通义千问 Plus", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 10 },
  { providerId: "dashscope", modelId: "qwen-turbo", label: "通义千问 Turbo", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 11 },
  { providerId: "deepSeek", modelId: "deepseek-chat", label: "DeepSeek Chat", mediaType: "text", capabilities: { reasoning: true, tools: true }, sortOrder: 20 },
  { providerId: "apiMart", modelId: "seedance-2.5", label: "Seedance 2.5", mediaType: "video", sortOrder: 100 },
  { providerId: "apiMart", modelId: "seedance-2.0", label: "Seedance 2.0", mediaType: "video", sortOrder: 101 },
  { providerId: "apiMart", modelId: "seedance-2.0-fast", label: "Seedance 2.0 Fast", mediaType: "video", sortOrder: 102 },
  { providerId: "apiMart", modelId: "seedance-2.0-mini", label: "Seedance 2.0 Mini", mediaType: "video", sortOrder: 103 },
  { providerId: "apiMart", modelId: "wan3.0-video", label: "Wan 3.0", mediaType: "video", sortOrder: 110 },
  { providerId: "apiMart", modelId: "MiniMax-H3", label: "MiniMax H3", mediaType: "video", sortOrder: 120 },
  { providerId: "apiMart", modelId: "seedream-5-0-lite", label: "Seedream 5.0 Lite", mediaType: "image", sortOrder: 200 },
  { providerId: "apiMart", modelId: "seedream-5-0-pro", label: "Seedream 5.0 Pro", mediaType: "image", sortOrder: 201 },
  { providerId: "apiMart", modelId: "gpt-image-2", label: "GPT Image 2", mediaType: "image", sortOrder: 210 },
  { providerId: "apiMart", modelId: "gemini-3-pro-image-preview", label: "Nano Banana Pro", mediaType: "image", sortOrder: 220 },
  { providerId: "apiMart", modelId: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", mediaType: "image", sortOrder: 221 },
  { providerId: "meta", modelId: "MiniMax-H3", label: "MiniMax H3（秘塔）", mediaType: "video", sortOrder: 300 },
];
for (const model of models) {
  await database.insert(platformModels).values({ id: randomUUID(), ...model, enabled: 1, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { label: model.label, apiModelId: model.apiModelId ?? null, capabilities: model.capabilities ?? null, enabled: 1, sortOrder: model.sortOrder, updatedAt: now } });
}

const [priceBook] = await database.select().from(priceBookVersions).where(eq(priceBookVersions.version, 1)).limit(1);
const priceBookId = priceBook?.id ?? randomUUID();
await database.insert(priceBookVersions).values({ id: priceBookId, version: 1, status: "published", publishedAt: now, createdAt: priceBook?.createdAt ?? now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { status: "published", publishedAt: now, updatedAt: now } });
await database.insert(pricingSettings).values({ id: "development-default", activePriceBookVersionId: priceBookId, createdAt: now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { activePriceBookVersionId: priceBookId, updatedAt: now } });
for (const model of models) {
  const creditsPerUnit = model.mediaType === "video" ? 30 : model.mediaType === "image" ? 20 : 2;
  const unit = model.mediaType === "video" ? "second" : model.mediaType === "image" ? "image" : "1k_chars";
  await database.insert(pricingItems).values({ id: randomUUID(), priceBookVersionId: priceBookId, modelId: model.modelId, mediaType: model.mediaType, unit, creditsPerUnit, constraints: {}, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { unit, creditsPerUnit, constraints: {}, updatedAt: now } });
}

console.log(`开发 seed 完成：${email}，Workspace=${workspaceId}，已写入 ${models.length} 个平台模型和默认价格簿。默认密码来自 SEED_ADMIN_PASSWORD。`);
await closeDatabase();

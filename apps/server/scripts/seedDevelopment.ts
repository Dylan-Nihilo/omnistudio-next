import { platformModelCatalog, platformProviders } from "@/utils/ai/platformCatalog";
import { hash } from "@node-rs/argon2";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { checkDatabase, closeDatabase, getDatabase, runSqlMigrations } from "@/db/database";
import { creditLedger, platformModels, platformProviderConfigs, platformRoles, pricingItems, pricingSettings, priceBookVersions, teamMembers, teams, users, wallets } from "@/db/schema";
import { initializePersonalSpace } from "@/services/accountService";

if (process.env.NODE_ENV !== "development" || process.env.SEED_DEVELOPMENT !== "true") {
  throw new Error("开发 seed 仅允许在 NODE_ENV=development 且 SEED_DEVELOPMENT=true 时执行");
}

await runSqlMigrations();
await checkDatabase();
const database = getDatabase();
const now = new Date();
const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@omnistudio.local").trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
if (!email || !password || password.length < 12) throw new Error("SEED_ADMIN_EMAIL 和长度至少 12 位的 SEED_ADMIN_PASSWORD 必须有效");

const [existingUser] = await database.select().from(users).where(eq(users.email, email)).limit(1);
const userId = existingUser?.id ?? randomUUID();
const passwordHash = existingUser?.passwordHash ?? await hash(password, { algorithm: 2 });
await database.insert(users).values({ id: userId, email, displayName: existingUser?.displayName ?? "开发管理员", passwordHash, status: "active", createdAt: existingUser?.createdAt ?? now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });

await database.insert(platformRoles).values({ id: randomUUID(), userId, role: "root", createdAt: now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });

const [existingTeam] = await database.select().from(teams).where(and(eq(teams.ownerUserId, userId), eq(teams.name, "开发团队"))).limit(1);
const teamId = existingTeam?.id ?? randomUUID();
await database.insert(teams).values({ id: teamId, name: "开发团队", ownerUserId: userId, status: "active", createdAt: existingTeam?.createdAt ?? now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });
await database.insert(teamMembers).values({ id: randomUUID(), teamId, userId, role: "owner", createdAt: now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });
await database.insert(wallets).values({ id: randomUUID(), userId, balance: 100000, frozen: 0, createdAt: now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { updatedAt: now } });
const [seedWallet] = await database.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
if (seedWallet) {
  const [seedLedger] = await database.select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.idempotencyKey, "seed:development:initial-credits")).limit(1);
  if (!seedLedger) await database.insert(creditLedger).values({
    id: randomUUID(), walletId: seedWallet.id, userId, actorUserId: userId, kind: "grant", amount: seedWallet.balance,
    balanceAfter: seedWallet.balance, frozenAfter: seedWallet.frozen, idempotencyKey: "seed:development:initial-credits",
    reason: "开发环境初始积分", createdAt: now, updatedAt: now,
  });
}

await initializePersonalSpace(userId, true);

// 开发环境提供一套与旧 omnistudio-next 目录一致的可直接验证目录。密钥只从服务端环境变量读取，绝不写入数据库。
await database.update(platformProviderConfigs).set({ enabled: 0, updatedAt: now });
await database.update(platformModels).set({ enabled: 0, updatedAt: now });
for (const provider of platformProviders) {
  await database.insert(platformProviderConfigs).values({
    id: randomUUID(), providerId: provider.providerId, enabled: 1,
    config: { apiUrl: provider.apiUrl, protocol: provider.protocol, ...provider.config }, secretRef: provider.secretRef,
    createdAt: now, updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { enabled: 1, config: { apiUrl: provider.apiUrl, protocol: provider.protocol, ...provider.config }, secretRef: provider.secretRef, updatedAt: now } });
}

for (const model of platformModelCatalog) {
  await database.insert(platformModels).values({ id: randomUUID(), ...model, enabled: 1, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { label: model.label, apiModelId: model.apiModelId ?? null, capabilities: model.capabilities ?? null, enabled: 1, sortOrder: model.sortOrder, updatedAt: now } });
}

const [priceBook] = await database.select().from(priceBookVersions).where(eq(priceBookVersions.version, 1)).limit(1);
const priceBookId = priceBook?.id ?? randomUUID();
await database.insert(priceBookVersions).values({ id: priceBookId, version: 1, status: "published", publishedAt: now, createdAt: priceBook?.createdAt ?? now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { status: "published", publishedAt: now, updatedAt: now } });
await database.insert(pricingSettings).values({ id: "platform", activePriceBookVersionId: priceBookId, createdAt: now, updatedAt: now })
  .onDuplicateKeyUpdate({ set: { activePriceBookVersionId: priceBookId, updatedAt: now } });
for (const model of platformModelCatalog) {
  const creditsPerUnit = model.mediaType === "video" ? 30 : model.mediaType === "image" ? 20 : 2;
  const unit = model.mediaType === "video" ? "second" : model.mediaType === "image" ? "image" : "1k_chars";
  await database.insert(pricingItems).values({ id: randomUUID(), priceBookVersionId: priceBookId, providerId: model.providerId, modelId: model.modelId, mediaType: model.mediaType, unit, creditsPerUnit, constraints: {}, createdAt: now, updatedAt: now })
    .onDuplicateKeyUpdate({ set: { unit, creditsPerUnit, constraints: {}, updatedAt: now } });
}

console.log(`开发 seed 完成：${email}，Team=${teamId}，已写入 ${platformModelCatalog.length} 个平台模型和默认价格簿。密码来自 SEED_ADMIN_PASSWORD。`);
await closeDatabase();

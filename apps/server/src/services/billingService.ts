import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/database";
import { auditEvents, creditLedger, generationJobs, pricingItems, pricingSettings, priceBookVersions, wallets, workspaces } from "@/db/schema";

export type CreditOperation = "reserve" | "capture" | "release";
export type GenerationMediaType = "text" | "image" | "video" | "audio";

const imageSizePricingSchema = z.object({ sizeTiers: z.record(z.enum(["1K", "2K", "4K"]), z.number().int().positive().safe()) });

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function imageSizeTier(size?: string): "1K" | "2K" | "4K" | undefined {
  const value = size?.trim().toUpperCase();
  if (value === "1K" || value === "2K" || value === "4K") return value;
  const dimensions = /^([1-9]\d{0,4})\s*[X*×]\s*([1-9]\d{0,4})$/.exec(value ?? "");
  if (!dimensions) return;
  const longest = Math.max(Number(dimensions[1]), Number(dimensions[2]));
  return longest <= 1024 ? "1K" : longest <= 2048 ? "2K" : "4K";
}

export async function getWallet(workspaceId: string) {
  const [wallet] = await getDatabase().select().from(wallets).where(eq(wallets.workspaceId, workspaceId)).limit(1);
  if (!wallet) invalid("Workspace 钱包不存在", 404);
  return wallet;
}

export async function listLedger(workspaceId: string, limit = 100) {
  const wallet = await getWallet(workspaceId);
  return getDatabase().select().from(creditLedger).where(eq(creditLedger.walletId, wallet.id)).orderBy(desc(creditLedger.createdAt)).limit(Math.min(Math.max(limit, 1), 200));
}

export async function listAdminWorkspaces() {
  return getDatabase().select({
    id: workspaces.id,
    name: workspaces.name,
    slug: workspaces.slug,
    balance: wallets.balance,
    frozen: wallets.frozen,
    memberCount: sql<number>`CAST((SELECT COUNT(*) FROM workspace_memberships wm WHERE wm.workspace_id = ${workspaces.id}) AS UNSIGNED)`,
  }).from(workspaces).innerJoin(wallets, eq(wallets.workspaceId, workspaces.id)).orderBy(workspaces.name);
}

async function activePriceBook() {
  const database = getDatabase();
  const [setting] = await database.select({ id: pricingSettings.activePriceBookVersionId }).from(pricingSettings).limit(1);
  if (setting?.id) return setting.id;
  const [published] = await database.select({ id: priceBookVersions.id }).from(priceBookVersions).where(eq(priceBookVersions.status, "published")).orderBy(desc(priceBookVersions.version)).limit(1);
  return published?.id ?? null;
}

export async function quoteCredits(modelId: string, mediaType: GenerationMediaType, units: number, size?: string) {
  if (!Number.isFinite(units) || units <= 0) invalid("计费单位必须是正数", 422);
  const versionId = await activePriceBook();
  if (!versionId) invalid("平台尚未发布积分价格簿", 503);
  const [item] = await getDatabase().select({ item: pricingItems }).from(pricingItems)
    .where(and(eq(pricingItems.priceBookVersionId, versionId), eq(pricingItems.modelId, modelId), eq(pricingItems.mediaType, mediaType))).limit(1);
  if (!item) invalid("所选模型尚未配置积分价格", 503);
  let creditsPerUnit = item.item.creditsPerUnit;
  const constraints = item.item.constraints;
  if (mediaType === "image" && constraints && typeof constraints === "object" && "sizeTiers" in constraints) {
    const pricing = imageSizePricingSchema.safeParse(constraints);
    if (!pricing.success) invalid("图片分辨率积分价格配置无效", 503);
    const tier = imageSizeTier(size);
    // ACT: 沿用旧项目规则，尺寸未知时按最高档报价。
    creditsPerUnit = tier ? pricing.data.sizeTiers[tier] : Math.max(...Object.values(pricing.data.sizeTiers));
  }
  const credits = Math.max(1, Math.ceil(units * creditsPerUnit));
  return { credits, priceBookVersionId: versionId, unit: item.item.unit, creditsPerUnit };
}

export async function reserveGeneration(input: {
  workspaceId: string; userId: string; modelId: string; mediaType: GenerationMediaType;
  units: number; size?: string; idempotencyKey: string; requestSnapshot: unknown;
}) {
  if (input.idempotencyKey.length > 160) invalid("Idempotency-Key 不能超过 160 个字符", 422);
  const quote = await quoteCredits(input.modelId, input.mediaType, input.units, input.size);
  const database = getDatabase();
  try {
    return await database.transaction(async tx => {
      const [existing] = await tx.select().from(generationJobs).where(eq(generationJobs.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing) {
        if (existing.workspaceId !== input.workspaceId || existing.userId !== input.userId || existing.modelId !== input.modelId || existing.mediaType !== input.mediaType
          || JSON.stringify(existing.requestSnapshot) !== JSON.stringify(input.requestSnapshot)) invalid("幂等键已被其他生成请求使用", 409);
        invalid(existing.status === "reserved" || existing.status === "running" ? "相同幂等请求正在处理中" : "相同幂等请求已处理，请勿重复提交", 409);
      }
      await tx.execute(sql`SELECT id FROM wallets WHERE workspace_id = ${input.workspaceId} FOR UPDATE`);
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.workspaceId, input.workspaceId)).limit(1);
      if (!wallet) invalid("Workspace 钱包不存在", 404);
      if (wallet.balance - wallet.frozen < quote.credits) invalid("积分不足", 402);
      const now = new Date();
      const frozenAfter = wallet.frozen + quote.credits;
      const jobId = randomUUID();
      await tx.update(wallets).set({ frozen: frozenAfter, updatedAt: now }).where(eq(wallets.id, wallet.id));
      await tx.insert(creditLedger).values({
        id: randomUUID(), walletId: wallet.id, workspaceId: input.workspaceId, actorUserId: input.userId, jobId,
        kind: "reserve", amount: 0, balanceAfter: wallet.balance, frozenAfter,
        idempotencyKey: `generation:${input.idempotencyKey}:reserve`, reason: `生成任务预留：${input.modelId}`,
        metadata: { modelId: input.modelId, mediaType: input.mediaType }, createdAt: now, updatedAt: now,
      });
      await tx.insert(generationJobs).values({
        id: jobId, workspaceId: input.workspaceId, userId: input.userId, modelId: input.modelId, mediaType: input.mediaType,
        status: "reserved", quotedCredits: quote.credits, capturedCredits: 0, priceBookVersionId: quote.priceBookVersionId,
        idempotencyKey: input.idempotencyKey, requestSnapshot: input.requestSnapshot, createdAt: now, updatedAt: now,
      });
      const [job] = await tx.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
      return { job: job!, quote, reused: false };
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ER_DUP_ENTRY") {
      const [existing] = await database.select().from(generationJobs).where(eq(generationJobs.idempotencyKey, input.idempotencyKey)).limit(1);
      if (existing && existing.workspaceId === input.workspaceId && existing.userId === input.userId && existing.modelId === input.modelId && existing.mediaType === input.mediaType
        && JSON.stringify(existing.requestSnapshot) === JSON.stringify(input.requestSnapshot)) invalid("相同幂等请求正在处理中", 409);
    }
    throw error;
  }
}

export async function settleGeneration(jobId: string, success: boolean, resultSnapshot?: unknown) {
  const database = getDatabase();
  return database.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM generation_jobs WHERE id = ${jobId} FOR UPDATE`);
    const [job] = await tx.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1);
    if (!job || (job.status !== "reserved" && job.status !== "running")) return job ?? null;
    await tx.execute(sql`SELECT id FROM wallets WHERE workspace_id = ${job.workspaceId} FOR UPDATE`);
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.workspaceId, job.workspaceId)).limit(1);
    if (!wallet || wallet.frozen < job.quotedCredits) invalid("冻结积分不足，账本状态异常", 409);
    if (success && wallet.balance < job.quotedCredits) invalid("可用积分不足，账本状态异常", 409);
    const now = new Date();
    const operation: CreditOperation = success ? "capture" : "release";
    const idempotencyKey = `generation:${job.id}:${operation}`;
    const [existing] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, idempotencyKey)).limit(1);
    const nextBalance = success ? wallet.balance - job.quotedCredits : wallet.balance;
    const nextFrozen = wallet.frozen - job.quotedCredits;
    if (!existing) {
      await tx.update(wallets).set({ balance: nextBalance, frozen: nextFrozen, updatedAt: now }).where(eq(wallets.id, wallet.id));
      await tx.insert(creditLedger).values({
        id: randomUUID(), walletId: wallet.id, workspaceId: job.workspaceId, actorUserId: job.userId, jobId: job.id,
        kind: operation, amount: success ? -job.quotedCredits : 0, balanceAfter: nextBalance, frozenAfter: nextFrozen,
        idempotencyKey, reason: success ? "生成完成" : "生成失败，释放预留", createdAt: now, updatedAt: now,
      });
    }
    await tx.update(generationJobs).set({
      status: success ? "succeeded" : "failed", capturedCredits: success ? job.quotedCredits : 0,
      resultSnapshot: resultSnapshot ?? null, updatedAt: now,
    }).where(eq(generationJobs.id, job.id));
    const [updated] = await tx.select().from(generationJobs).where(eq(generationJobs.id, job.id)).limit(1);
    return updated ?? null;
  });
}

export async function grantCredits(workspaceId: string, amount: number, idempotencyKey: string, actorUserId: string, reason: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0) invalid("积分发放数量必须是正整数", 422);
  if (!idempotencyKey.trim() || idempotencyKey.length > 160) invalid("幂等键不能为空且不能超过 160 个字符", 422);
  return getDatabase().transaction(async tx => {
    const [existing] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) return existing;
    await tx.execute(sql`SELECT id FROM wallets WHERE workspace_id = ${workspaceId} FOR UPDATE`);
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.workspaceId, workspaceId)).limit(1);
    if (!wallet) invalid("Workspace 钱包不存在", 404);
    const balanceAfter = wallet.balance + amount;
    const now = new Date();
    await tx.update(wallets).set({ balance: balanceAfter, updatedAt: now }).where(eq(wallets.id, wallet.id));
    const entryId = randomUUID();
    const [entry] = await tx.insert(creditLedger).values({ id: entryId, walletId: wallet.id, workspaceId, actorUserId, kind: "grant", amount, balanceAfter, frozenAfter: wallet.frozen, idempotencyKey, reason, createdAt: now, updatedAt: now }).$returningId();
    await tx.insert(auditEvents).values({
      id: randomUUID(), actorUserId, workspaceId, action: "billing.credits.grant",
      requestId: idempotencyKey, metadata: { ledgerId: entryId, amount, reason }, createdAt: now, updatedAt: now,
    });
    return { ...entry, balanceAfter, frozenAfter: wallet.frozen };
  });
}

export async function changeReservedCredits(workspaceId: string, operation: CreditOperation, amount: number, idempotencyKey: string, actorUserId: string | null, jobId: string | null, reason?: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0) invalid("积分数量必须是正整数", 422);
  if (!idempotencyKey.trim() || idempotencyKey.length > 160) invalid("幂等键不能为空且不能超过 160 个字符", 422);
  return getDatabase().transaction(async tx => {
    const [existing] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) return existing;
    await tx.execute(sql`SELECT id FROM wallets WHERE workspace_id = ${workspaceId} FOR UPDATE`);
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.workspaceId, workspaceId)).limit(1);
    if (!wallet) invalid("Workspace 钱包不存在", 404);
    const nextBalance = operation === "capture" ? wallet.balance - amount : wallet.balance;
    const nextFrozen = operation === "reserve" ? wallet.frozen + amount : wallet.frozen - amount;
    if (operation === "reserve" && wallet.balance - wallet.frozen < amount) invalid("积分不足", 402);
    if (operation !== "reserve" && wallet.frozen < amount) invalid("冻结积分不足，账本状态异常", 409);
    const now = new Date();
    await tx.update(wallets).set({ balance: nextBalance, frozen: nextFrozen, updatedAt: now }).where(eq(wallets.id, wallet.id));
    const kind = operation;
    const [entry] = await tx.insert(creditLedger).values({ id: randomUUID(), walletId: wallet.id, workspaceId, actorUserId, jobId, kind, amount: operation === "capture" ? -amount : 0, balanceAfter: nextBalance, frozenAfter: nextFrozen, idempotencyKey, reason, createdAt: now, updatedAt: now }).$returningId();
    return { ...entry, balanceAfter: nextBalance, frozenAfter: nextFrozen };
  });
}

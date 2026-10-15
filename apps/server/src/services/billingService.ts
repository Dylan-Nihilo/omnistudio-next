import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase, hashSecret, serverInstanceId } from "@/db/database";
import { auditEvents, creditLedger, creditTransfers, generationJobs, platformRoles, pricingItems, pricingSettings, priceBookVersions, teamMembers, teams, users, wallets } from "@/db/schema";
import { accountContext, requireAccount, requireActiveAccount, requireRootAccount } from "@/utils/accountContext";
import u from "@/utils";

export type GenerationMediaType = "text" | "image" | "video" | "audio";
export type TextBudget = { input: number; output: number; estimation: string };

const imageSizePricingSchema = z.object({ sizeTiers: z.record(z.enum(["1K", "2K", "4K"]), z.number().int().positive().safe()) });
const resolutionPricingSchema = z.object({ resolutionTiers: z.record(z.string().min(1).max(32), z.number().int().positive().safe()) });

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

function resolutionTier(resolution: string | undefined, tiers: Record<string, number>) {
  const value = resolution?.trim().toUpperCase();
  if (!value) return undefined;
  const key = Object.keys(tiers).find(item => item.toUpperCase() === value);
  return key ? tiers[key] : undefined;
}

function positiveCredits(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) invalid("积分数量必须是正的安全整数", 422);
}

function requestKey(value: string, prefix: string) {
  if (!value.trim() || value.length > 160) invalid("幂等键不能为空且不能超过 160 个字符", 422);
  return `${prefix}:${requireAccount().userId}:${hashSecret(value)}`;
}

function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${fingerprint(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function duplicate(error: unknown) {
  const value = error as { code?: string; cause?: { code?: string } };
  return value?.code === "ER_DUP_ENTRY" || value?.cause?.code === "ER_DUP_ENTRY";
}

export async function getWallet(userId = requireAccount().userId) {
  const account = requireAccount();
  if (userId !== account.userId && !account.isRoot) invalid("无权访问这个积分账户", 403);
  const [wallet] = await getDatabase().select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  if (!wallet) invalid("个人积分账户不存在", 404);
  return wallet;
}

export async function listLedger(userId = requireAccount().userId, limit = 100) {
  const wallet = await getWallet(userId);
  const rows = await getDatabase().select().from(creditLedger).where(eq(creditLedger.walletId, wallet.id)).orderBy(desc(creditLedger.createdAt), desc(creditLedger.id)).limit(Math.min(Math.max(Math.floor(limit), 1), 200));
  return rows.map(({ id, kind, amount, balanceAfter, frozenAfter, reason, createdAt }) => ({ id, kind, amount, balanceAfter, frozenAfter, reason, createdAt }));
}

export async function listAdminUsers() {
  requireRootAccount();
  const rows = await getDatabase().select({ id: users.id, email: users.email, displayName: users.displayName, status: users.status, balance: wallets.balance, frozen: wallets.frozen, role: platformRoles.role })
    .from(users).innerJoin(wallets, eq(wallets.userId, users.id)).leftJoin(platformRoles, and(eq(platformRoles.userId, users.id), eq(platformRoles.role, "root"))).orderBy(asc(users.email));
  return rows.map(({ role, ...user }) => ({ ...user, isRoot: role === "root", available: u.billingCredits.formatCredits(u.billingCredits.parseCredits(user.balance) - u.billingCredits.parseCredits(user.frozen)) }));
}

async function activePriceBook() {
  const database = getDatabase();
  const [setting] = await database.select({ id: pricingSettings.activePriceBookVersionId }).from(pricingSettings).where(eq(pricingSettings.id, "platform")).limit(1);
  if (setting?.id) return setting.id;
  const [published] = await database.select({ id: priceBookVersions.id }).from(priceBookVersions).where(eq(priceBookVersions.status, "published")).orderBy(desc(priceBookVersions.version)).limit(1);
  return published?.id ?? null;
}

export async function quoteCredits(providerId: string, modelId: string, mediaType: GenerationMediaType, units: number, versionId?: string, size?: string, textBudget?: TextBudget) {
  if (!Number.isFinite(units) || units <= 0) invalid("计费单位必须是正数", 422);
  const id = versionId ?? await activePriceBook();
  if (!id) invalid("平台尚未发布积分价格", 503);
  const [item] = await getDatabase().select().from(pricingItems).where(and(eq(pricingItems.priceBookVersionId, id), eq(pricingItems.providerId, providerId), eq(pricingItems.modelId, modelId), eq(pricingItems.mediaType, mediaType))).limit(1);
  if (!item) invalid("所选模型尚未配置积分价格", 503);
  let creditsPerUnit = item.creditsPerUnit;
  const constraints = item.constraints;
  const textPricing = mediaType === "text" ? u.billingCredits.readTextPricing(constraints) : undefined;
  if (item.unit === "millionTokens" && !textPricing) invalid("文本 token 价格配置缺失", 503);
  if (textPricing) {
    if (!textBudget || !Number.isSafeInteger(textBudget.input) || textBudget.input < 0 || !Number.isSafeInteger(textBudget.output) || textBudget.output < 0) invalid("文本报价需要有效的输入和输出 token 预算", 422);
    const rates = textPricing.ratesPerMillion;
    const highestInputRate = [rates.input, rates.cacheRead, rates.cacheWrite].filter((rate): rate is string => rate !== null).reduce((highest, rate) => u.billingCredits.parseCredits(rate) > u.billingCredits.parseCredits(highest) ? rate : highest);
    const estimate = u.billingCredits.calculateTextCredits({ input: textBudget.input, output: textBudget.output, cacheRead: 0, cacheWrite: 0 }, { ...rates, input: highestInputRate }, "up6");
    return { credits: estimate.credits, priceBookVersionId: id, unit: item.unit, creditsPerUnit: 0, billingRule: textPricing.billingRule, ratesPerMillion: rates, textBudget };
  }
  if (mediaType === "image" && constraints && typeof constraints === "object" && "sizeTiers" in constraints) {
    const pricing = imageSizePricingSchema.safeParse(constraints);
    if (!pricing.success) invalid("图片分辨率积分价格配置无效", 503);
    const tier = imageSizeTier(size);
    // ACT: 沿用旧项目规则，尺寸未知时按最高档报价。
    creditsPerUnit = tier ? pricing.data.sizeTiers[tier] : Math.max(...Object.values(pricing.data.sizeTiers));
  }
  if (mediaType === "video" && constraints && typeof constraints === "object" && "resolutionTiers" in constraints) {
    const pricing = resolutionPricingSchema.safeParse(constraints);
    if (!pricing.success) invalid("视频分辨率积分价格配置无效", 503);
    creditsPerUnit = resolutionTier(size, pricing.data.resolutionTiers) ?? Math.max(...Object.values(pricing.data.resolutionTiers));
  }
  const credits = Math.ceil(units * creditsPerUnit);
  if (!Number.isSafeInteger(credits) || credits < 0) invalid("价格计算超出安全范围", 422);
  return { credits: u.billingCredits.formatCredits(u.billingCredits.parseCredits(credits)), priceBookVersionId: id, unit: item.unit, creditsPerUnit, billingRule: "legacy" };
}

export async function reserveGeneration(input: { userId: string; providerId: string; modelId: string; mediaType: GenerationMediaType; units: number; size?: string; textBudget?: TextBudget; idempotencyKey: string; requestSnapshot: unknown }) {
  const account = requireAccount();
  if (input.userId !== account.userId) invalid("生成任务只能使用调用者自己的积分", 403);
  const key = requestKey(input.idempotencyKey, "generation");
  const quote = await quoteCredits(input.providerId, input.modelId, input.mediaType, input.units, undefined, input.size, input.textBudget);
  const database = getDatabase();
  try {
    return await database.transaction(async tx => {
      const [user] = await tx.select({ status: users.status }).from(users).where(eq(users.id, account.userId)).limit(1).for("update");
      if (user?.status !== "active") invalid("账户已停用", 403);
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, account.userId)).limit(1).for("update");
      if (!wallet) invalid("个人积分账户不存在", 404);
      const [existing] = await tx.select().from(generationJobs).where(eq(generationJobs.idempotencyKey, key)).limit(1);
      if (existing) {
        const previous = existing.requestSnapshot as { request?: unknown } | null;
        invalid(fingerprint(previous?.request ?? existing.requestSnapshot) !== fingerprint(input.requestSnapshot) ? "幂等键已用于另一条生成请求" : "相同生成请求已接收，请勿重复提交", 409);
      }
      const quoted = u.billingCredits.parseCredits(quote.credits);
      const frozen = u.billingCredits.parseCredits(wallet.frozen);
      let balance = u.billingCredits.parseCredits(wallet.balance);
      if (account.isRoot && balance < u.billingCredits.parseCredits(10000000)) balance = u.billingCredits.parseCredits(99999999);
      if (balance - frozen < quoted) invalid("个人可用积分不足", 402);
      wallet.balance = u.billingCredits.formatCredits(balance);
      const now = new Date();
      const frozenAfter = u.billingCredits.formatCredits(frozen + quoted);
      const job = { id: randomUUID(), userId: account.userId, providerId: input.providerId, modelId: input.modelId, mediaType: input.mediaType, status: "reserved" as const, quotedCredits: quote.credits, capturedCredits: "0.000000", priceBookVersionId: quote.priceBookVersionId, idempotencyKey: key, requestSnapshot: { runtimeId: serverInstanceId, request: input.requestSnapshot, quote }, createdAt: now, updatedAt: now };
      await tx.update(wallets).set({ balance: wallet.balance, frozen: frozenAfter, updatedAt: now }).where(eq(wallets.id, wallet.id));
      await tx.insert(generationJobs).values(job);
      await tx.insert(creditLedger).values({ id: randomUUID(), walletId: wallet.id, userId: account.userId, actorUserId: account.userId, jobId: job.id, kind: "reserve", amount: "0.000000", balanceAfter: wallet.balance, frozenAfter, idempotencyKey: `${job.id}:reserve`, reason: `生成预留：${input.modelId}`, metadata: { modelId: input.modelId, mediaType: input.mediaType, quote }, createdAt: now, updatedAt: now });
      return { job, quote };
    });
  } catch (error) {
    if (duplicate(error)) invalid("相同生成请求已接收，请勿重复提交", 409);
    throw error;
  }
}

export async function markGenerationStarted(jobId: string, payloadSnapshot?: unknown) {
  const account = requireAccount();
  await getDatabase().transaction(async tx => {
    const [job] = await tx.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1).for("update");
    if (!job || job.userId !== account.userId) invalid("无权更新这个生成任务", 403);
    if (job.status !== "reserved" && job.status !== "running") invalid("生成任务已结算", 409);
    const snapshot = job.requestSnapshot as Record<string, unknown>;
    await tx.update(generationJobs).set({ status: "running", requestSnapshot: { ...snapshot, upstreamStartedAt: snapshot.upstreamStartedAt ?? new Date().toISOString(), ...(payloadSnapshot !== undefined ? { finalRequest: payloadSnapshot } : {}) }, updatedAt: new Date() }).where(eq(generationJobs.id, jobId));
  });
}

export async function settleGeneration(jobId: string, success: boolean, resultSnapshot?: unknown) {
  const account = requireAccount();
  return getDatabase().transaction(async tx => {
    const [job] = await tx.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1).for("update");
    if (!job || job.userId !== account.userId) invalid("无权结算这个生成任务", 403);
    if (job.status !== "reserved" && job.status !== "running") return job;
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, job.userId)).limit(1).for("update");
    if (!wallet) invalid("积分账户不存在", 404);
    const walletBalance = u.billingCredits.parseCredits(wallet.balance);
    const walletFrozen = u.billingCredits.parseCredits(wallet.frozen);
    const quoted = u.billingCredits.parseCredits(job.quotedCredits);
    if (walletFrozen < quoted || walletBalance < walletFrozen) invalid("积分账本状态异常", 409);
    const now = new Date();
    const snapshot = resultSnapshot && typeof resultSnapshot === "object" ? resultSnapshot as Record<string, unknown> : {};
    const [item] = job.priceBookVersionId ? await tx.select().from(pricingItems).where(and(eq(pricingItems.priceBookVersionId, job.priceBookVersionId), eq(pricingItems.providerId, job.providerId), eq(pricingItems.modelId, job.modelId), eq(pricingItems.mediaType, job.mediaType))).limit(1) : [];
    const textPricing = job.mediaType === "text" ? u.billingCredits.readTextPricing(item?.constraints) : undefined;
    if (item?.unit === "millionTokens" && !textPricing) invalid("任务锁定的文本价格已丢失", 409);
    let captured = success ? quoted : 0n;
    let billing: Record<string, unknown> = { billingRule: "legacy", priceBookVersionId: job.priceBookVersionId };
    if (textPricing) {
      let computed: bigint | null = null;
      let status = snapshot.usage === undefined || snapshot.usage === null ? "usageMissing" : "settled";
      let usage = null;
      let numerator: string | null = null;
      let usageError: string | null = null;
      if (status === "settled") {
        try {
          const calculation = u.billingCredits.calculateTextCredits(snapshot.usage, textPricing.ratesPerMillion);
          computed = u.billingCredits.parseCredits(calculation.credits);
          usage = calculation.usage;
          numerator = calculation.numerator;
        } catch (error) {
          status = "usageInvalid";
          usageError = error instanceof Error ? error.message : "供应商计量无效";
        }
      }
      if (!success && !(job.requestSnapshot as { upstreamStartedAt?: string })?.upstreamStartedAt && status === "usageMissing") status = "released";
      captured = computed === null ? 0n : computed > quoted ? quoted : computed;
      billing = {
        billingRule: textPricing.billingRule, priceBookVersionId: job.priceBookVersionId, status,
        usage, ratesPerMillion: textPricing.ratesPerMillion, numerator, usageError,
        quotedCredits: job.quotedCredits,
        computedCredits: computed === null ? null : u.billingCredits.formatCredits(computed),
        capturedCredits: u.billingCredits.formatCredits(captured),
        releasedCredits: u.billingCredits.formatCredits(quoted - captured),
        platformAbsorbedCredits: computed === null ? null : u.billingCredits.formatCredits(computed - captured),
        rounding: "halfUp6",
      };
    } else if (success) {
      const legacySnapshot = snapshot as { usage?: { totalTokens?: number; input?: number; output?: number } };
      const usage = legacySnapshot.usage;
      if (usage && (typeof usage.totalTokens === "number" || typeof usage.input === "number")) {
        const tokens = usage.totalTokens ?? ((usage.input ?? 0) + (usage.output ?? 0));
        if (tokens > 0 && item) {
          const divisor = item.unit === "10k_chars" ? 10000 : 1000;
          const actualUnits = Math.max(1, Math.ceil(tokens / divisor));
          const actual = u.billingCredits.parseCredits(Math.ceil(actualUnits * item.creditsPerUnit));
          captured = actual < quoted ? actual : quoted;
        }
      }
    }
    const operation = captured > 0n || (success && (!textPricing || billing.status === "settled")) ? "capture" : "release";
    const balance = u.billingCredits.formatCredits(walletBalance - captured);
    const frozen = u.billingCredits.formatCredits(walletFrozen - quoted);
    const capturedCredits = u.billingCredits.formatCredits(captured);
    const status = success ? "succeeded" as const : "failed" as const;
    const settledSnapshot = { ...snapshot, billing };
    const reason = billing.status === "usageMissing" ? "供应商计量缺失，释放预留" : billing.status === "usageInvalid" ? "供应商计量异常，释放预留" : success ? "生成完成，按锁定价格结算" : captured > 0n ? "生成停止，按已发生用量结算" : "生成失败或取消，释放预留";
    await tx.update(wallets).set({ balance, frozen, updatedAt: now }).where(eq(wallets.id, wallet.id));
    await tx.insert(creditLedger).values({ id: randomUUID(), walletId: wallet.id, userId: job.userId, actorUserId: account.userId, jobId: job.id, kind: operation, amount: u.billingCredits.formatCredits(-captured), balanceAfter: balance, frozenAfter: frozen, idempotencyKey: `${job.id}:${operation}`, reason, metadata: { modelId: job.modelId, mediaType: job.mediaType, billing }, createdAt: now, updatedAt: now });
    await tx.update(generationJobs).set({ status, capturedCredits, resultSnapshot: settledSnapshot, updatedAt: now }).where(eq(generationJobs.id, job.id));
    return { ...job, status, capturedCredits, resultSnapshot: settledSnapshot };
  });
}

export async function adjustCredits(userId: string, amount: number, idempotencyKey: string, reason: string, kind: "grant" | "adjustment" = "adjustment") {
  const account = requireRootAccount();
  if (!Number.isSafeInteger(amount) || amount === 0 || (kind === "grant" && amount < 0)) invalid("积分变更数量无效", 422);
  const key = requestKey(idempotencyKey, "adminCredits");
  const metadata = { userId, amount, reason, kind };
  const database = getDatabase();
  const readExisting = async () => {
    const [entry] = await database.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, key)).limit(1);
    if (entry && fingerprint(entry.metadata) !== fingerprint(metadata)) invalid("幂等键已用于另一条积分变更", 409);
    return entry;
  };
  const existing = await readExisting();
  if (existing) return existing;
  try {
    return await database.transaction(async tx => {
      const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1).for("update");
      if (!wallet) invalid("积分账户不存在", 404);
      const [duplicateEntry] = await tx.select().from(creditLedger).where(eq(creditLedger.idempotencyKey, key)).limit(1);
      if (duplicateEntry) {
        if (fingerprint(duplicateEntry.metadata) !== fingerprint(metadata)) invalid("幂等键已用于另一条积分变更", 409);
        return duplicateEntry;
      }
      const balanceMicro = u.billingCredits.parseCredits(wallet.balance) + u.billingCredits.parseCredits(amount);
      if (balanceMicro < u.billingCredits.parseCredits(wallet.frozen)) invalid("变更后余额不能低于冻结积分", 422);
      const balanceAfter = u.billingCredits.formatCredits(balanceMicro);
      const now = new Date();
      const entry = { id: randomUUID(), walletId: wallet.id, userId, actorUserId: account.userId, kind, amount: u.billingCredits.formatCredits(u.billingCredits.parseCredits(amount)), balanceAfter, frozenAfter: wallet.frozen, idempotencyKey: key, reason, metadata, createdAt: now, updatedAt: now };
      await tx.update(wallets).set({ balance: balanceAfter, updatedAt: now }).where(eq(wallets.id, wallet.id));
      await tx.insert(creditLedger).values(entry);
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: `billing.credits.${kind}`, requestId: hashSecret(idempotencyKey), metadata: { ...metadata, ledgerId: entry.id }, createdAt: now, updatedAt: now });
      return entry;
    });
  } catch (error) {
    if (duplicate(error)) {
      const entry = await readExisting();
      if (entry) return entry;
    }
    throw error;
  }
}

export async function transferCredits(input: { teamId: string; recipientUserId: string; amount: number; reason: string; idempotencyKey: string }) {
  const account = requireActiveAccount();
  positiveCredits(input.amount);
  if (input.recipientUserId === account.userId) invalid("不能向自己划转积分", 422);
  requestKey(input.idempotencyKey, "transfer");
  const key = hashSecret(input.idempotencyKey);
  const database = getDatabase();
  const existing = await database.select().from(creditTransfers).where(and(eq(creditTransfers.senderUserId, account.userId), eq(creditTransfers.idempotencyKey, key))).limit(1);
  const match = (value: typeof creditTransfers.$inferSelect) => {
    if (value.teamId !== input.teamId || value.recipientUserId !== input.recipientUserId || u.billingCredits.parseCredits(value.amount) !== u.billingCredits.parseCredits(input.amount) || value.reason !== input.reason) invalid("幂等键已用于另一笔积分划转", 409);
    return value;
  };
  if (existing[0]) return match(existing[0]);
  try {
    return await database.transaction(async tx => {
      // shortcut: membership changes and transfers serialize per team; use versioned membership locks if a single large team becomes a contention hotspot.
      const [team] = await tx.select().from(teams).where(and(eq(teams.id, input.teamId), eq(teams.status, "active"))).limit(1).for("update");
      if (!team) invalid("团队不存在或已解散", 404);
      const lockedWallets = new Map<string, typeof wallets.$inferSelect>();
      for (const userId of [account.userId, input.recipientUserId].sort()) {
        const [member] = await tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, input.teamId), eq(teamMembers.userId, userId))).limit(1);
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
        if (!member || user?.status !== "active") invalid("积分只能在同一团队的有效成员之间划转", 403);
        const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, userId)).limit(1).for("update");
        if (!wallet) invalid("成员积分账户不存在", 404);
        lockedWallets.set(userId, wallet);
      }
      const [previous] = await tx.select().from(creditTransfers).where(and(eq(creditTransfers.senderUserId, account.userId), eq(creditTransfers.idempotencyKey, key))).limit(1);
      if (previous) return match(previous);
      const sender = lockedWallets.get(account.userId)!;
      const recipient = lockedWallets.get(input.recipientUserId)!;
      const transferMicro = u.billingCredits.parseCredits(input.amount);
      if (u.billingCredits.parseCredits(sender.balance) - u.billingCredits.parseCredits(sender.frozen) < transferMicro) invalid("个人可用积分不足，冻结积分不能划转", 402);
      u.billingCredits.formatCredits(u.billingCredits.parseCredits(recipient.balance) + transferMicro);
      const now = new Date();
      const transfer = { id: randomUUID(), teamId: input.teamId, senderUserId: account.userId, recipientUserId: input.recipientUserId, amount: u.billingCredits.formatCredits(transferMicro), idempotencyKey: key, reason: input.reason, createdAt: now, updatedAt: now };
      await tx.insert(creditTransfers).values(transfer);
      for (const [wallet, amount, kind] of [[sender, -input.amount, "transferOut"], [recipient, input.amount, "transferIn"]] as const) {
        const balanceAfter = u.billingCredits.formatCredits(u.billingCredits.parseCredits(wallet.balance) + u.billingCredits.parseCredits(amount));
        await tx.update(wallets).set({ balance: balanceAfter, updatedAt: now }).where(eq(wallets.id, wallet.id));
        await tx.insert(creditLedger).values({ id: randomUUID(), walletId: wallet.id, userId: wallet.userId, actorUserId: account.userId, kind, amount: u.billingCredits.formatCredits(u.billingCredits.parseCredits(amount)), balanceAfter, frozenAfter: wallet.frozen, idempotencyKey: `${transfer.id}:${kind}`, reason: input.reason, metadata: { transferId: transfer.id, teamId: input.teamId, senderUserId: account.userId, recipientUserId: input.recipientUserId }, createdAt: now, updatedAt: now });
      }
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: input.teamId, action: "billing.transfer", requestId: hashSecret(input.idempotencyKey), metadata: { transferId: transfer.id, recipientUserId: input.recipientUserId, amount: input.amount }, createdAt: now, updatedAt: now });
      return transfer;
    });
  } catch (error) {
    if (duplicate(error)) {
      const [previous] = await database.select().from(creditTransfers).where(and(eq(creditTransfers.senderUserId, account.userId), eq(creditTransfers.idempotencyKey, key))).limit(1);
      if (previous) return match(previous);
    }
    throw error;
  }
}

export async function recoverGenerationReservations() {
  const pending = await getDatabase().select().from(generationJobs).where(eq(generationJobs.status, "reserved"));
  const running = await getDatabase().select().from(generationJobs).where(eq(generationJobs.status, "running"));
  for (const job of [...pending, ...running]) {
    if ((job.requestSnapshot as { runtimeId?: string } | null)?.runtimeId === serverInstanceId) continue;
    await accountContext.run({ userId: job.userId, isRoot: false }, () => settleGeneration(job.id, false, { error: "服务重启，释放未完成任务的预留积分" }));
  }
}

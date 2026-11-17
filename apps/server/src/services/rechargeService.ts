import { randomUUID } from "node:crypto";
import { and, desc, eq, lt } from "drizzle-orm";
import { getDatabase, hashSecret } from "@/db/database";
import { auditEvents, creditLedger, rechargeOrders, wallets } from "@/db/schema";
import { requireActiveAccount } from "@/utils/accountContext";
import u from "@/utils";

export type RechargePaymentMethod = "alipay" | "wechat";
export type RechargeOrderStatus = "pending" | "paid" | "cancelled" | "expired";
export type RechargePackage = { id: string; name: string; amountCents: number; credits: number; description: string; badge?: string };
export const rechargeTermsVersion = "recharge-2026-11-17-v2";
export const rechargePackages: RechargePackage[] = [
  { id: "credits200", name: "灵感补给", amountCents: 2000, credits: 200, description: "适合体验与轻量创作" },
  { id: "credits500", name: "创作常备", amountCents: 5000, credits: 500, description: "适合持续打磨内容" },
  { id: "credits1000", name: "高频创作", amountCents: 10000, credits: 1000, description: "适合稳定制作节奏", badge: "常用" },
  { id: "credits5000", name: "制作进阶", amountCents: 50000, credits: 5000, description: "适合系列化生产" },
  { id: "credits10000", name: "工作室储备", amountCents: 100000, credits: 10000, description: "适合工作室长期使用" },
  { id: "credits20000", name: "工作室扩展", amountCents: 200000, credits: 20000, description: "适合多项目并行制作" },
  { id: "credits50000", name: "工作室进阶", amountCents: 500000, credits: 50000, description: "适合高频制作团队" },
  { id: "credits100000", name: "企业储备", amountCents: 1000000, credits: 100000, description: "适合大型项目持续制作" },
];

export type RechargeOrder = Pick<typeof rechargeOrders.$inferSelect, "id" | "packageId" | "packageName" | "credits" | "amountCents" | "paymentMethod" | "status" | "expiresAt" | "paidAt" | "createdAt">;
export type RechargePaymentInstruction = { type: "qr" | "redirect"; value: string; expiresAt: string };
export type RechargePaymentAdapter = {
  createPayment(order: RechargeOrder): Promise<RechargePaymentInstruction>;
  verifyNotification(request: { headers: Record<string, string | string[] | undefined>; body: unknown; rawBody: string }): Promise<{ orderId: string; providerTradeNo: string; amountCents: number; currency: "CNY" }>;
};

// 支付渠道接入时，在此按渠道注册签名验签与下单适配器；未注册的渠道保持关闭。
const paymentAdapters: Partial<Record<RechargePaymentMethod, RechargePaymentAdapter>> = {};

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function duplicate(error: unknown) {
  const value = error as { code?: string; cause?: { code?: string } };
  return value?.code === "ER_DUP_ENTRY" || value?.cause?.code === "ER_DUP_ENTRY";
}

function requestKey(value: string, userId: string) {
  if (!value.trim() || value.length > 160) invalid("幂等键不能为空且不能超过 160 个字符", 422);
  return `recharge:${userId}:${hashSecret(value)}`;
}

function orderView(order: typeof rechargeOrders.$inferSelect): RechargeOrder {
  const { id, packageId, packageName, credits, amountCents, paymentMethod, status, expiresAt, paidAt, createdAt } = order;
  return { id, packageId, packageName, credits, amountCents, paymentMethod, status, expiresAt, paidAt, createdAt };
}

async function expireOrders(userId: string) {
  const now = new Date();
  await getDatabase().update(rechargeOrders).set({ status: "expired", updatedAt: now })
    .where(and(eq(rechargeOrders.userId, userId), eq(rechargeOrders.status, "pending"), lt(rechargeOrders.expiresAt, now)));
}

export function getRechargeCatalog() {
  return {
    packages: rechargePackages,
    paymentMethods: [
      { id: "alipay" as const, label: "支付宝", enabled: Boolean(paymentAdapters.alipay) },
      { id: "wechat" as const, label: "微信支付", enabled: Boolean(paymentAdapters.wechat) },
    ],
    termsVersion: rechargeTermsVersion,
    creditsPerYuan: 10,
  };
}

export async function createRechargeOrder(input: { packageId: string; paymentMethod: RechargePaymentMethod; agreementVersion: string; idempotencyKey: string }) {
  const account = requireActiveAccount();
  const item = rechargePackages.find(value => value.id === input.packageId);
  if (!item) invalid("充值套餐不存在或已下架", 422);
  if (!paymentAdapters[input.paymentMethod]) invalid(`${input.paymentMethod === "alipay" ? "支付宝" : "微信支付"}支付通道暂未开放，当前不能创建充值订单`, 503);
  if (input.agreementVersion !== rechargeTermsVersion) invalid("购买协议已更新，请重新阅读并确认", 409);
  const key = requestKey(input.idempotencyKey, account.userId);
  const matches = (order: typeof rechargeOrders.$inferSelect) => {
    if (order.userId !== account.userId || order.packageId !== item.id || order.paymentMethod !== input.paymentMethod || order.agreementVersion !== input.agreementVersion) invalid("幂等键已用于另一笔充值订单", 409);
    return orderView(order);
  };
  const database = getDatabase();
  const [existing] = await database.select().from(rechargeOrders).where(eq(rechargeOrders.idempotencyKey, key)).limit(1);
  if (existing) return matches(existing);
  const now = new Date();
  const order = {
    id: randomUUID(), userId: account.userId, packageId: item.id, packageName: item.name,
    credits: String(item.credits), amountCents: item.amountCents, paymentMethod: input.paymentMethod,
    status: "pending" as const, agreementVersion: input.agreementVersion, idempotencyKey: key,
    providerTradeNo: null, expiresAt: new Date(now.getTime() + 15 * 60 * 1000), paidAt: null,
    createdAt: now, updatedAt: now,
  };
  try {
    await database.transaction(async tx => {
      await tx.insert(rechargeOrders).values(order);
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: "billing.recharge.orderCreated", requestId: hashSecret(input.idempotencyKey), metadata: { orderId: order.id, packageId: item.id, paymentMethod: input.paymentMethod, amountCents: item.amountCents }, createdAt: now, updatedAt: now });
    });
    return orderView(order);
  } catch (error) {
    if (duplicate(error)) {
      const [duplicateOrder] = await database.select().from(rechargeOrders).where(eq(rechargeOrders.idempotencyKey, key)).limit(1);
      if (duplicateOrder) return matches(duplicateOrder);
    }
    throw error;
  }
}

export async function listRechargeOrders(limit = 20) {
  const account = requireActiveAccount();
  await expireOrders(account.userId);
  const rows = await getDatabase().select().from(rechargeOrders).where(eq(rechargeOrders.userId, account.userId))
    .orderBy(desc(rechargeOrders.createdAt)).limit(Math.min(Math.max(Math.floor(limit), 1), 50));
  return rows.map(orderView);
}

export async function getRechargeOrder(id: string) {
  const account = requireActiveAccount();
  await expireOrders(account.userId);
  const [order] = await getDatabase().select().from(rechargeOrders).where(and(eq(rechargeOrders.id, id), eq(rechargeOrders.userId, account.userId))).limit(1);
  if (!order) invalid("充值订单不存在", 404);
  return orderView(order);
}

export async function cancelRechargeOrder(id: string) {
  const account = requireActiveAccount();
  const database = getDatabase();
  return database.transaction(async tx => {
    const [order] = await tx.select().from(rechargeOrders).where(and(eq(rechargeOrders.id, id), eq(rechargeOrders.userId, account.userId))).limit(1).for("update");
    if (!order) invalid("充值订单不存在", 404);
    if (order.status === "paid") invalid("已支付订单不能关闭", 409);
    if (order.status === "pending") {
      const now = new Date();
      await tx.update(rechargeOrders).set({ status: "cancelled", updatedAt: now }).where(eq(rechargeOrders.id, id));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: "billing.recharge.orderCancelled", requestId: id, metadata: { orderId: id }, createdAt: now, updatedAt: now });
      return orderView({ ...order, status: "cancelled", updatedAt: now });
    }
    return orderView(order);
  });
}

export async function startRechargePayment(id: string) {
  const order = await getRechargeOrder(id);
  if (order.status !== "pending") invalid("当前订单已关闭或已完成", 409);
  const adapter = paymentAdapters[order.paymentMethod];
  if (!adapter) invalid(`${order.paymentMethod === "alipay" ? "支付宝" : "微信支付"}支付通道暂未开放，订单尚未扣款或入账`, 503);
  return adapter.createPayment(order);
}

export async function settleVerifiedRechargePayment(input: { paymentMethod: RechargePaymentMethod; orderId: string; providerTradeNo: string; amountCents: number; currency: "CNY" }) {
  if (input.currency !== "CNY" || !input.providerTradeNo.trim() || input.providerTradeNo.length > 128 || !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) invalid("支付通知字段无效", 422);
  const database = getDatabase();
  return database.transaction(async tx => {
    const [order] = await tx.select().from(rechargeOrders).where(eq(rechargeOrders.id, input.orderId)).limit(1).for("update");
    if (!order) invalid("充值订单不存在", 404);
    if (order.paymentMethod !== input.paymentMethod || order.amountCents !== input.amountCents) invalid("支付通知与充值订单不匹配", 409);
    if (order.status === "paid") {
      if (order.providerTradeNo !== input.providerTradeNo) invalid("订单已由另一笔交易完成", 409);
      return orderView(order);
    }
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, order.userId)).limit(1).for("update");
    if (!wallet) invalid("个人积分账户不存在", 404);
    const balanceAfter = u.billingCredits.formatCredits(u.billingCredits.parseCredits(wallet.balance) + u.billingCredits.parseCredits(order.credits));
    const now = new Date();
    await tx.update(wallets).set({ balance: balanceAfter, updatedAt: now }).where(eq(wallets.id, wallet.id));
    await tx.insert(creditLedger).values({
      id: randomUUID(), walletId: wallet.id, userId: order.userId, actorUserId: null, kind: "recharge",
      amount: order.credits, balanceAfter, frozenAfter: wallet.frozen, idempotencyKey: `recharge:${order.id}`,
      reason: `${order.packageName}积分充值`, metadata: { orderId: order.id, paymentMethod: order.paymentMethod, providerTradeNo: input.providerTradeNo, amountCents: order.amountCents }, createdAt: now, updatedAt: now,
    });
    await tx.update(rechargeOrders).set({ status: "paid", providerTradeNo: input.providerTradeNo, paidAt: now, updatedAt: now }).where(eq(rechargeOrders.id, order.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: null, action: "billing.recharge.orderPaid", requestId: input.providerTradeNo, metadata: { orderId: order.id, userId: order.userId, paymentMethod: order.paymentMethod, amountCents: order.amountCents, credits: order.credits }, createdAt: now, updatedAt: now });
    return orderView({ ...order, status: "paid", providerTradeNo: input.providerTradeNo, paidAt: now, updatedAt: now });
  });
}

export async function verifyAndSettleRechargeNotification(input: { paymentMethod: RechargePaymentMethod; headers: Record<string, string | string[] | undefined>; body: unknown; rawBody: string }) {
  const adapter = paymentAdapters[input.paymentMethod];
  if (!adapter) invalid("支付通知适配器尚未配置", 503);
  const verified = await adapter.verifyNotification({ headers: input.headers, body: input.body, rawBody: input.rawBody });
  return settleVerifiedRechargePayment({ ...verified, paymentMethod: input.paymentMethod });
}

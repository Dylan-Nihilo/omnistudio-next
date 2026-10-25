import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { getDatabase } from "@/db/database";
import { generationJobs, generationOutputs, generationUsageDaily } from "@/db/schema";
import { requireAccount } from "@/utils/accountContext";
import u from "@/utils";

type UsageTransaction = any;
type GenerationJob = typeof generationJobs.$inferSelect;
type UsageSnapshot = Record<string, any>;

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function usageObject(snapshot: UsageSnapshot) {
  const usage = snapshot.usage;
  return usage && typeof usage === "object" && !Array.isArray(usage) ? usage as UsageSnapshot : {};
}

function directoryFrom(job: GenerationJob, snapshot: UsageSnapshot) {
  const request = snapshot.request && typeof snapshot.request === "object" ? snapshot.request as UsageSnapshot : {};
  const jobSnapshot = job.requestSnapshot && typeof job.requestSnapshot === "object" ? job.requestSnapshot as UsageSnapshot : {};
  const jobRequest = jobSnapshot.request && typeof jobSnapshot.request === "object" ? jobSnapshot.request as UsageSnapshot : {};
  const value = [
    snapshot.directory, request.directory, snapshot.workspaceDirectory, request.workspaceDirectory, snapshot.cwd, request.cwd,
    jobSnapshot.directory, jobRequest.directory, jobSnapshot.workspaceDirectory, jobRequest.workspaceDirectory, jobSnapshot.cwd, jobRequest.cwd,
  ].find(item => typeof item === "string" && item.trim());
  return typeof value === "string" ? value.trim() : "unassigned";
}

function workspaceNameFrom(snapshot: UsageSnapshot, directory: string) {
  if (typeof snapshot.workspaceName === "string" && snapshot.workspaceName.trim()) return snapshot.workspaceName.trim().slice(0, 255);
  if (directory === "unassigned") return "未分配工作区";
  const normalized = directory.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.split("/").pop()?.slice(0, 255) || "工作区";
}

function dayString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function videoKind(job: GenerationJob, snapshot: UsageSnapshot) {
  if (job.mediaType !== "video") return "none";
  const billing = snapshot.billing && typeof snapshot.billing === "object" ? snapshot.billing as UsageSnapshot : {};
  if (billing.videoBillingKind === "videoToVideo" || billing.videoBillingKind === "textImageToVideo") return billing.videoBillingKind;
  if (snapshot.videoBillingKind === "videoToVideo" || snapshot.videoBillingKind === "textImageToVideo") return snapshot.videoBillingKind;
  const request = snapshot.request && typeof snapshot.request === "object" ? snapshot.request as UsageSnapshot : {};
  const jobSnapshot = job.requestSnapshot && typeof job.requestSnapshot === "object" ? job.requestSnapshot as UsageSnapshot : {};
  const jobRequest = jobSnapshot.request && typeof jobSnapshot.request === "object" ? jobSnapshot.request as UsageSnapshot : {};
  const quote = jobSnapshot.quote && typeof jobSnapshot.quote === "object" ? jobSnapshot.quote as UsageSnapshot : {};
  if (quote.videoBillingKind === "videoToVideo" || quote.videoBillingKind === "textImageToVideo") return quote.videoBillingKind;
  const hasVideoReference = (Array.isArray(request.videos) && request.videos.length > 0) || (Array.isArray(jobRequest.videos) && jobRequest.videos.length > 0);
  return hasVideoReference ? "videoToVideo" : "textImageToVideo";
}

function outputFiles(snapshot: UsageSnapshot) {
  return Array.isArray(snapshot.files) ? snapshot.files.filter(item => item && typeof item === "object") as UsageSnapshot[] : [];
}

function toDecimal(value: number) {
  return Number.isFinite(value) && value > 0 ? value.toFixed(6) : "0.000000";
}

export async function recordGenerationUsage(tx: UsageTransaction, job: GenerationJob, success: boolean, resultSnapshot: unknown, capturedCredits: bigint, settled = true) {
  if (!settled && capturedCredits <= 0n) return;
  const snapshot = resultSnapshot && typeof resultSnapshot === "object" ? resultSnapshot as UsageSnapshot : {};
  const directory = directoryFrom(job, snapshot);
  const directoryHash = directory === "unassigned" ? "unassigned" : createHash("sha256").update(directory).digest("hex");
  const usage = usageObject(snapshot);
  const input = numberValue(usage.input);
  const cacheRead = numberValue(usage.cacheRead);
  const cacheWrite = numberValue(usage.cacheWrite);
  const outputTokens = numberValue(usage.output);
  const units = numberValue(snapshot.units) || numberValue((snapshot.request as UsageSnapshot | undefined)?.duration) || (job.mediaType === "text" ? (input + cacheRead + cacheWrite + outputTokens) / 1_000_000 : 1);
  const files = outputFiles(snapshot);
  const outputFilesForReview = job.mediaType === "image" || job.mediaType === "video" ? files : [];
  const outputCount = outputFilesForReview.length;
  const pendingCount = outputCount;
  const now = new Date();
  const day = dayString(job.createdAt);
  const row = {
    id: randomUUID(), day, userId: job.userId, directoryHash, workspaceName: workspaceNameFrom(snapshot, directory), providerId: job.providerId,
    modelId: job.modelId, mediaType: job.mediaType, videoBillingKind: videoKind(job, snapshot), requestCount: 1, successCount: success ? 1 : 0,
    failedCount: success ? 0 : 1, outputCount, units: toDecimal(units), capturedCredits: u.billingCredits.formatCredits(capturedCredits), billableInputTokens: String(Math.round(input + cacheRead + cacheWrite)), outputTokens: String(Math.round(outputTokens)),
    videoSeconds: toDecimal(job.mediaType === "video" ? numberValue((snapshot.request as UsageSnapshot | undefined)?.duration) : 0), pendingCount, usableCount: 0, wasteCount: 0, createdAt: now, updatedAt: now,
  };
  await tx.insert(generationUsageDaily).values(row).onDuplicateKeyUpdate({ set: {
    requestCount: sql`${generationUsageDaily.requestCount} + 1`, successCount: sql`${generationUsageDaily.successCount} + ${success ? 1 : 0}`,
    failedCount: sql`${generationUsageDaily.failedCount} + ${success ? 0 : 1}`, outputCount: sql`${generationUsageDaily.outputCount} + ${outputCount}`,
    units: sql`${generationUsageDaily.units} + ${row.units}`, capturedCredits: sql`${generationUsageDaily.capturedCredits} + ${row.capturedCredits}`,
    billableInputTokens: sql`${generationUsageDaily.billableInputTokens} + ${row.billableInputTokens}`, outputTokens: sql`${generationUsageDaily.outputTokens} + ${row.outputTokens}`,
    videoSeconds: sql`${generationUsageDaily.videoSeconds} + ${row.videoSeconds}`, pendingCount: sql`${generationUsageDaily.pendingCount} + ${pendingCount}`, updatedAt: now,
  } });
  if (outputFilesForReview.length) {
    await tx.insert(generationOutputs).values(outputFilesForReview.map((file, index) => ({ id: randomUUID(), jobId: job.id, userId: job.userId, outputIndex: index, mediaType: job.mediaType as "image" | "video", status: "pending" as const, wasteReason: null, outputSnapshot: file, createdAt: now, updatedAt: now }))).onDuplicateKeyUpdate({ set: { updatedAt: now } });
  }
}

export async function listUsageSummary(input: { from?: string; to?: string; userId?: string; workspace?: string; modelId?: string; mediaType?: "text" | "image" | "video" | "audio"; limit?: number } = {}) {
  const workspace = input.workspace?.trim();
  const modelId = input.modelId?.trim();
  const where = [
    input.from ? gte(generationUsageDaily.day, input.from) : undefined,
    input.to ? lte(generationUsageDaily.day, input.to) : undefined,
    input.userId ? eq(generationUsageDaily.userId, input.userId) : undefined,
    workspace ? or(eq(generationUsageDaily.workspaceName, workspace), eq(generationUsageDaily.directoryHash, workspace)) : undefined,
    modelId ? eq(generationUsageDaily.modelId, modelId) : undefined,
    input.mediaType ? eq(generationUsageDaily.mediaType, input.mediaType) : undefined,
  ].filter(Boolean) as any[];
  return getDatabase().select().from(generationUsageDaily).where(where.length ? and(...where) : undefined).orderBy(desc(generationUsageDaily.day), desc(generationUsageDaily.updatedAt)).limit(Math.min(Math.max(input.limit ?? 5000, 1), 20000));
}

export async function listGenerationOutputs(input: { status?: "pending" | "usable" | "waste"; userId?: string; limit?: number } = {}) {
  const account = requireAccount();
  if (input.userId && input.userId !== account.userId && !account.isRoot) throw Object.assign(new Error("无权查看其他账户的输出"), { status: 403 });
  const userId = account.isRoot ? input.userId : account.userId;
  const where = [userId ? eq(generationOutputs.userId, userId) : undefined, input.status ? eq(generationOutputs.status, input.status) : undefined].filter(Boolean) as any[];
  return getDatabase().select().from(generationOutputs).where(where.length ? and(...where) : undefined).orderBy(desc(generationOutputs.createdAt)).limit(Math.min(Math.max(input.limit ?? 500, 1), 5000));
}

export async function updateGenerationOutputStatus(id: string, status: "usable" | "waste", wasteReason?: string) {
  if (status === "waste" && !wasteReason?.trim()) throw Object.assign(new Error("标记废片时必须填写原因"), { status: 422 });
  const account = requireAccount();
  return getDatabase().transaction(async tx => {
    const [output] = await tx.select().from(generationOutputs).where(eq(generationOutputs.id, id)).limit(1).for("update");
    if (!output) throw Object.assign(new Error("生成输出不存在"), { status: 404 });
    if (output.userId !== account.userId && !account.isRoot) throw Object.assign(new Error("无权审核这个生成输出"), { status: 403 });
    if (output.status === status) return output;
    const [job] = await tx.select().from(generationJobs).where(eq(generationJobs.id, output.jobId)).limit(1);
    if (!job) throw Object.assign(new Error("生成任务不存在"), { status: 404 });
    const snapshot = job.resultSnapshot && typeof job.resultSnapshot === "object" ? job.resultSnapshot as UsageSnapshot : {};
    const directory = directoryFrom(job, snapshot);
    const directoryHash = directory === "unassigned" ? "unassigned" : createHash("sha256").update(directory).digest("hex");
    const day = dayString(job.createdAt);
    const [summary] = await tx.select().from(generationUsageDaily).where(and(eq(generationUsageDaily.day, day), eq(generationUsageDaily.userId, job.userId), eq(generationUsageDaily.directoryHash, directoryHash), eq(generationUsageDaily.providerId, job.providerId), eq(generationUsageDaily.modelId, job.modelId), eq(generationUsageDaily.mediaType, job.mediaType), eq(generationUsageDaily.videoBillingKind, videoKind(job, snapshot)))).limit(1).for("update");
    if (summary) {
      const fromPending = output.status === "pending" ? 1 : 0;
      const fromUsable = output.status === "usable" ? 1 : 0;
      const fromWaste = output.status === "waste" ? 1 : 0;
      const toUsable = status === "usable" ? 1 : 0;
      const toWaste = status === "waste" ? 1 : 0;
      await tx.update(generationUsageDaily).set({ pendingCount: sql`${generationUsageDaily.pendingCount} - ${fromPending}`, usableCount: sql`${generationUsageDaily.usableCount} + ${toUsable - fromUsable}`, wasteCount: sql`${generationUsageDaily.wasteCount} + ${toWaste - fromWaste}`, updatedAt: new Date() }).where(eq(generationUsageDaily.id, summary.id));
    }
    const now = new Date();
    await tx.update(generationOutputs).set({ status, wasteReason: status === "waste" ? wasteReason!.trim().slice(0, 500) : null, reviewedBy: account.userId, reviewedAt: now, updatedAt: now }).where(eq(generationOutputs.id, id));
    return { ...output, status, wasteReason: status === "waste" ? wasteReason!.trim().slice(0, 500) : null, reviewedBy: account.userId, reviewedAt: now };
  });
}

export function usageCsv(rows: Awaited<ReturnType<typeof listUsageSummary>>) {
  const headers = ["日期", "用户", "工作区", "供应商", "模型", "类型", "视频计费类型", "请求数", "成功数", "失败数", "输出数", "单位", "消耗积分", "输入Token", "输出Token", "视频秒数", "待审核", "可用", "废片", "废片率"];
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const lines = [headers, ...rows.map(row => {
    const denominator = row.usableCount + row.wasteCount;
    const wasteRate = denominator ? `${(row.wasteCount / denominator * 100).toFixed(2)}%` : "";
    return [row.day, row.userId, row.workspaceName, row.providerId, row.modelId, row.mediaType, row.videoBillingKind, row.requestCount, row.successCount, row.failedCount, row.outputCount, row.units, row.capturedCredits, row.billableInputTokens, row.outputTokens, row.videoSeconds, row.pendingCount, row.usableCount, row.wasteCount, wasteRate].map(escape);
  })];
  return `\uFEFF${lines.map(line => line.join(",")).join("\r\n")}\r\n`;
}

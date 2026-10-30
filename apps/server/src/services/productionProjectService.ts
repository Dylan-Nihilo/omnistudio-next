import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { GeneratedMedia, MediaGenerationRequest } from "@omnistudio-next/tools-scaffold/runtime";
import { getDatabase } from "@/db/database";
import { auditEvents, generationJobs, productionApprovals, productionClipVariants, productionEpisodes, productionProjectMembers, productionProjects, productionReviews, productionScenes, productionSeasons, productionShots, teamMembers, teams, users } from "@/db/schema";
import { requireAccount } from "@/utils/accountContext";
import { roleAllows, type ProductionProjectAction, type ProductionProjectRole } from "@/utils/productionProject/permissions";
import { generateMedia, getVideoBillingKind } from "@/utils/media/generation";
import { quoteCredits } from "@/services/billingService";
import u from "@/utils";

export type ProductionProjectStatus = "draft" | "scripted" | "storyboarded" | "generating" | "editing" | "review" | "approved" | "delivered";

const statusTransitions: Record<ProductionProjectStatus, readonly ProductionProjectStatus[]> = {
  draft: ["scripted"], scripted: ["storyboarded"], storyboarded: ["generating"], generating: ["editing"], editing: ["review"], review: ["approved"], approved: ["delivered"], delivered: [],
};

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function assertBudget(value: string) {
  if (!/^\d{1,20}(\.\d{1,6})?$/.test(value)) invalid("项目预算必须是非负金额", 422);
}

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1) invalid(`${name}必须是正整数`, 422);
}

async function requireWorkspaceMember(workspaceId: string) {
  const account = requireAccount();
  const database = getDatabase();
  const membership = await database.select({ id: teams.id }).from(teams).leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, account.userId)))
    .where(account.isRoot ? and(eq(teams.id, workspaceId), eq(teams.status, "active")) : and(eq(teams.id, workspaceId), eq(teams.status, "active"), eq(teamMembers.userId, account.userId))).limit(1);
  if (!membership.length) invalid("无权访问这个工作空间", 403);
}

export async function createProductionProject(input: { workspaceId: string; title: string; customerId?: string; budgetCents: string }) {
  const account = requireAccount();
  await requireWorkspaceMember(input.workspaceId);
  assertBudget(input.budgetCents);
  const now = new Date();
  const project = { id: randomUUID(), workspaceId: input.workspaceId, customerId: input.customerId ?? null, title: input.title.trim(), status: "draft" as const, budgetCents: input.budgetCents, createdBy: account.userId, createdAt: now, updatedAt: now };
  await getDatabase().transaction(async tx => {
    await tx.insert(productionProjects).values(project);
    await tx.insert(productionProjectMembers).values({ id: randomUUID(), projectId: project.id, userId: account.userId, role: "owner", status: "active", createdBy: account.userId, createdAt: now, updatedAt: now });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: input.workspaceId, action: "productionProject.create", metadata: { projectId: project.id, title: project.title, budgetCents: project.budgetCents }, createdAt: now, updatedAt: now });
  });
  return project;
}

export async function listProductionProjects(workspaceId?: string) {
  const account = requireAccount();
  const filters = [eq(productionProjectMembers.userId, account.userId), eq(productionProjectMembers.status, "active"), workspaceId ? eq(productionProjects.workspaceId, workspaceId) : undefined].filter(Boolean) as any[];
  return getDatabase().select({ id: productionProjects.id, workspaceId: productionProjects.workspaceId, customerId: productionProjects.customerId, title: productionProjects.title, status: productionProjects.status, budgetCents: productionProjects.budgetCents, createdBy: productionProjects.createdBy, createdAt: productionProjects.createdAt, updatedAt: productionProjects.updatedAt, role: productionProjectMembers.role })
    .from(productionProjects).innerJoin(productionProjectMembers, eq(productionProjectMembers.projectId, productionProjects.id)).where(and(...filters)).orderBy(asc(productionProjects.createdAt));
}

export async function requireProjectAccess(projectId: string, action: ProductionProjectAction) {
  const account = requireAccount();
  const [result] = await getDatabase().select({ project: productionProjects, member: productionProjectMembers }).from(productionProjects).innerJoin(productionProjectMembers, eq(productionProjectMembers.projectId, productionProjects.id))
    .where(and(eq(productionProjects.id, projectId), eq(productionProjectMembers.userId, account.userId), eq(productionProjectMembers.status, "active"))).limit(1);
  if (!result || !roleAllows(result.member.role as ProductionProjectRole, action)) invalid("无权执行这个项目操作", 403);
  return result;
}

export async function getProductionProject(projectId: string) {
  const { project } = await requireProjectAccess(projectId, "read");
  const database = getDatabase();
  const members = await database.select({ id: productionProjectMembers.id, userId: productionProjectMembers.userId, email: users.email, displayName: users.displayName, role: productionProjectMembers.role, status: productionProjectMembers.status }).from(productionProjectMembers).innerJoin(users, eq(users.id, productionProjectMembers.userId)).where(eq(productionProjectMembers.projectId, projectId)).orderBy(asc(productionProjectMembers.createdAt));
  const seasons = await database.select().from(productionSeasons).where(eq(productionSeasons.projectId, projectId)).orderBy(asc(productionSeasons.seasonNumber));
  const seasonIds = seasons.map(item => item.id);
  const episodes = seasonIds.length ? await database.select().from(productionEpisodes).where(inArray(productionEpisodes.seasonId, seasonIds)).orderBy(asc(productionEpisodes.episodeNumber)) : [];
  const episodeIds = episodes.map(item => item.id);
  const scenes = episodeIds.length ? await database.select().from(productionScenes).where(inArray(productionScenes.episodeId, episodeIds)).orderBy(asc(productionScenes.sceneNumber)) : [];
  const sceneIds = scenes.map(item => item.id);
  const shots = sceneIds.length ? await database.select().from(productionShots).where(inArray(productionShots.sceneId, sceneIds)).orderBy(asc(productionShots.shotNumber)) : [];
  const shotIds = shots.map(item => item.id);
  const variants = shotIds.length ? await database.select().from(productionClipVariants).where(inArray(productionClipVariants.shotId, shotIds)).orderBy(desc(productionClipVariants.createdAt)) : [];
  const variantIds = variants.map(item => item.id);
  const reviews = variantIds.length ? await database.select().from(productionReviews).where(inArray(productionReviews.variantId, variantIds)).orderBy(desc(productionReviews.createdAt)) : [];
  const approvals = variantIds.length ? await database.select().from(productionApprovals).where(inArray(productionApprovals.variantId, variantIds)).orderBy(desc(productionApprovals.createdAt)) : [];
  return { project, members, seasons, episodes, scenes, shots, variants, reviews, approvals };
}

export async function updateProductionProject(input: { projectId: string; title?: string; customerId?: string | null; budgetCents?: string; status?: ProductionProjectStatus }) {
  const account = requireAccount();
  const action = input.budgetCents !== undefined ? "manageBudget" : input.status === "approved" ? "approve" : input.status === "delivered" ? "export" : "edit";
  const current = await requireProjectAccess(input.projectId, action);
  if (!input.title && input.customerId === undefined && input.budgetCents === undefined && !input.status) invalid("没有可保存的项目字段", 422);
  if (input.budgetCents !== undefined) assertBudget(input.budgetCents);
  if (input.status && input.status !== current.project.status && !statusTransitions[current.project.status as ProductionProjectStatus].includes(input.status)) invalid(`项目状态不能从 ${current.project.status} 变为 ${input.status}`, 409);
  const now = new Date();
  const patch = { ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.customerId !== undefined ? { customerId: input.customerId } : {}), ...(input.budgetCents !== undefined ? { budgetCents: input.budgetCents } : {}), ...(input.status ? { status: input.status } : {}), updatedAt: now };
  await getDatabase().transaction(async tx => {
    await tx.update(productionProjects).set(patch).where(eq(productionProjects.id, input.projectId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: current.project.workspaceId, action: "productionProject.update", metadata: { projectId: input.projectId, before: { title: current.project.title, customerId: current.project.customerId, budgetCents: current.project.budgetCents, status: current.project.status }, after: patch }, createdAt: now, updatedAt: now });
  });
  return { ...current.project, ...patch };
}

export async function createProductionEpisode(input: { projectId: string; seasonNumber: number; seasonTitle: string; episodeNumber: number; title: string; targetDurationMs?: number }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "create");
  assertPositiveInteger(input.seasonNumber, "季编号");
  assertPositiveInteger(input.episodeNumber, "集编号");
  const database = getDatabase();
  const now = new Date();
  return database.transaction(async tx => {
    let [season] = await tx.select().from(productionSeasons).where(and(eq(productionSeasons.projectId, input.projectId), eq(productionSeasons.seasonNumber, input.seasonNumber))).limit(1);
    if (!season) {
      season = { id: randomUUID(), projectId: input.projectId, seasonNumber: input.seasonNumber, title: input.seasonTitle.trim(), status: "draft" as const, createdAt: now, updatedAt: now };
      await tx.insert(productionSeasons).values(season);
    }
    const [existing] = await tx.select().from(productionEpisodes).where(and(eq(productionEpisodes.seasonId, season.id), eq(productionEpisodes.episodeNumber, input.episodeNumber))).limit(1);
    if (existing) invalid("该剧集编号已存在", 409);
    const episode = { id: randomUUID(), seasonId: season.id, episodeNumber: input.episodeNumber, title: input.title.trim(), status: "draft" as const, targetDurationMs: input.targetDurationMs ?? 0, createdAt: now, updatedAt: now };
    await tx.insert(productionEpisodes).values(episode);
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionEpisode.create", metadata: { projectId: input.projectId, seasonId: season.id, episodeId: episode.id }, createdAt: now, updatedAt: now });
    return { season, episode };
  });
}

async function getEpisodeInProject(projectId: string, episodeId: string) {
  const [row] = await getDatabase().select({ episode: productionEpisodes, season: productionSeasons }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionEpisodes.id, episodeId), eq(productionSeasons.projectId, projectId))).limit(1);
  if (!row) invalid("剧集不属于当前项目", 404);
  return row;
}

export async function createProductionShot(input: { projectId: string; episodeId: string; sceneNumber: number; sceneTitle: string; continuityNotes?: string; shotNumber: number; durationMs?: number; shotType?: string; camera?: string; lighting?: string; dialogue?: string; narration?: string; prompt?: string }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "create");
  const { episode, season } = await getEpisodeInProject(input.projectId, input.episodeId);
  assertPositiveInteger(input.sceneNumber, "场景编号");
  assertPositiveInteger(input.shotNumber, "镜头编号");
  const database = getDatabase();
  const now = new Date();
  return database.transaction(async tx => {
    let [scene] = await tx.select().from(productionScenes).where(and(eq(productionScenes.episodeId, episode.id), eq(productionScenes.sceneNumber, input.sceneNumber))).limit(1);
    if (!scene) {
      scene = { id: randomUUID(), episodeId: episode.id, sceneNumber: input.sceneNumber, title: input.sceneTitle.trim(), continuityNotes: input.continuityNotes?.trim() || null, createdAt: now, updatedAt: now };
      await tx.insert(productionScenes).values(scene);
    }
    const [existing] = await tx.select().from(productionShots).where(and(eq(productionShots.sceneId, scene.id), eq(productionShots.shotNumber, input.shotNumber))).limit(1);
    if (existing) invalid("该场景镜头编号已存在", 409);
    const shot = { id: randomUUID(), sceneId: scene.id, shotNumber: input.shotNumber, durationMs: input.durationMs ?? 0, shotType: input.shotType?.trim() || null, camera: input.camera?.trim() || null, lighting: input.lighting?.trim() || null, dialogue: input.dialogue?.trim() || null, narration: input.narration?.trim() || null, prompt: input.prompt?.trim() || null, status: "draft" as const, revision: 1, createdAt: now, updatedAt: now };
    await tx.insert(productionShots).values(shot);
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionShot.create", metadata: { projectId: input.projectId, seasonId: season.id, episodeId: episode.id, sceneId: scene.id, shotId: shot.id }, createdAt: now, updatedAt: now });
    return { season, episode, scene, shot };
  });
}

export async function updateProductionShot(input: { projectId: string; shotId: string; durationMs?: number; shotType?: string | null; camera?: string | null; lighting?: string | null; dialogue?: string | null; narration?: string | null; prompt?: string | null; status?: "draft" | "ready" }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "edit");
  const [row] = await getDatabase().select({ shot: productionShots, scene: productionScenes, episode: productionEpisodes }).from(productionShots).innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId)).innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId)).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionShots.id, input.shotId), eq(productionSeasons.projectId, input.projectId))).limit(1);
  if (!row) invalid("镜头不属于当前项目", 404);
  if (row.shot.status === "approved") invalid("已批准镜头不能直接修改", 409);
  if (input.durationMs !== undefined && (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0)) invalid("镜头时长无效", 422);
  const patch = { ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}), ...(input.shotType !== undefined ? { shotType: input.shotType?.trim() || null } : {}), ...(input.camera !== undefined ? { camera: input.camera?.trim() || null } : {}), ...(input.lighting !== undefined ? { lighting: input.lighting?.trim() || null } : {}), ...(input.dialogue !== undefined ? { dialogue: input.dialogue?.trim() || null } : {}), ...(input.narration !== undefined ? { narration: input.narration?.trim() || null } : {}), ...(input.prompt !== undefined ? { prompt: input.prompt?.trim() || null } : {}), ...(input.status ? { status: input.status } : {}), revision: row.shot.revision + 1, updatedAt: new Date() };
  if (Object.keys(patch).length === 2) invalid("没有可保存的镜头字段", 422);
  await getDatabase().transaction(async tx => {
    await tx.update(productionShots).set(patch).where(eq(productionShots.id, input.shotId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionShot.update", metadata: { projectId: input.projectId, shotId: input.shotId, revision: patch.revision }, createdAt: new Date(), updatedAt: new Date() });
  });
  return { ...row.shot, ...patch };
}

function costMicro(value: string) {
  return u.billingCredits.parseCredits(value);
}

async function assertProjectBudget(projectId: string, budgetCents: string, quoteCents: string) {
  const budget = costMicro(budgetCents);
  if (budget === 0n) return;
  const rows = await getDatabase().select({ status: generationJobs.status, quotedCredits: generationJobs.quotedCredits, capturedCredits: generationJobs.capturedCredits }).from(generationJobs).where(eq(generationJobs.projectId, projectId));
  const committed = rows.reduce((total, row) => total + (row.status === "reserved" || row.status === "running" ? costMicro(row.quotedCredits) : row.status === "succeeded" ? costMicro(row.capturedCredits) : 0n), 0n);
  if (committed + costMicro(quoteCents) > budget) invalid("项目预算不足，已阻止本次生成", 402);
}

export async function generateProductionShot(input: { projectId: string; shotId: string; cwd: string; mediaType: "image" | "video" | "audio"; request: MediaGenerationRequest; idempotencyKey: string }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "generate");
  const [row] = await getDatabase().select({ shot: productionShots, scene: productionScenes, episode: productionEpisodes, season: productionSeasons }).from(productionShots).innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId)).innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId)).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionShots.id, input.shotId), eq(productionSeasons.projectId, input.projectId))).limit(1);
  if (!row) invalid("镜头不属于当前项目", 404);
  if (row.shot.status === "approved") invalid("已批准镜头不能重拍", 409);
  const previous = await getDatabase().select({ attemptNumber: productionClipVariants.attemptNumber }).from(productionClipVariants).where(eq(productionClipVariants.shotId, input.shotId)).orderBy(desc(productionClipVariants.attemptNumber)).limit(1);
  const attemptNumber = (previous[0]?.attemptNumber ?? 0) + 1;
  const units = input.mediaType === "video" ? Math.max(1, input.request.duration ?? 1) : input.mediaType === "audio" ? Math.max(1, input.request.prompt.length / 1000) : 1;
  const quote = await quoteCredits(input.request.providerId, input.request.modelId, input.mediaType, units, undefined, input.mediaType === "image" ? input.request.size : input.mediaType === "video" ? input.request.resolution : undefined, undefined, input.mediaType === "video" ? getVideoBillingKind(input.request) : undefined);
  await assertProjectBudget(input.projectId, project.budgetCents, quote.credits);
  const jobIdRef: { id?: string } = {};
  const now = new Date();
  await getDatabase().update(productionShots).set({ status: "generating", updatedAt: now }).where(eq(productionShots.id, input.shotId));
  try {
    const files = await generateMedia(input.cwd, input.mediaType, input.request, undefined, { userId: account.userId, idempotencyKey: input.idempotencyKey, projectId: input.projectId, seasonId: row.season.id, episodeId: row.episode.id, sceneId: row.scene.id, shotId: input.shotId, attemptNumber, estimatedCostCents: quote.credits, jobIdRef });
    if (!jobIdRef.id || !files.length) invalid("生成任务没有返回可审片文件", 502);
    const file = files[0] as GeneratedMedia;
    const [job] = await getDatabase().select({ status: generationJobs.status }).from(generationJobs).where(eq(generationJobs.id, jobIdRef.id)).limit(1);
    if (job?.status !== "succeeded") invalid("生成任务未成功结算", 409);
    const variant = { id: randomUUID(), projectId: input.projectId, shotId: input.shotId, generationJobId: jobIdRef.id, attemptNumber, mediaType: input.mediaType, filePath: file.path, mimeType: file.mimeType, status: "candidate" as const, promptSnapshot: { request: input.request, revision: row.shot.revision }, createdBy: account.userId, createdAt: now, updatedAt: new Date() };
    await getDatabase().transaction(async tx => {
      await tx.insert(productionClipVariants).values(variant);
      await tx.update(productionShots).set({ status: "review", updatedAt: new Date() }).where(eq(productionShots.id, input.shotId));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionShot.generate", metadata: { projectId: input.projectId, shotId: input.shotId, generationJobId: jobIdRef.id, attemptNumber, filePath: file.path, quotedCredits: quote.credits }, createdAt: new Date(), updatedAt: new Date() });
    });
    return { variant, files };
  } catch (error) {
    await getDatabase().update(productionShots).set({ status: "ready", updatedAt: new Date() }).where(eq(productionShots.id, input.shotId));
    throw error;
  }
}

async function getProjectVariant(projectId: string, variantId: string) {
  const [row] = await getDatabase().select({ variant: productionClipVariants, shot: productionShots }).from(productionClipVariants).innerJoin(productionShots, eq(productionShots.id, productionClipVariants.shotId)).where(and(eq(productionClipVariants.projectId, projectId), eq(productionClipVariants.id, variantId))).limit(1);
  if (!row) invalid("候选片段不属于当前项目", 404);
  return row;
}

export async function createProductionReview(input: { projectId: string; variantId: string; body: string; timecodeMs?: number; mentions?: string[] }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "comment");
  const { variant, shot } = await getProjectVariant(input.projectId, input.variantId);
  if (variant.status === "rejected") invalid("已拒绝的候选片段不能继续评论", 409);
  if (input.timecodeMs !== undefined && (!Number.isSafeInteger(input.timecodeMs) || input.timecodeMs < 0)) invalid("时间码无效", 422);
  const body = input.body.trim();
  if (!body) invalid("评论内容不能为空", 422);
  const now = new Date();
  const review = { id: randomUUID(), projectId: input.projectId, shotId: shot.id, variantId: variant.id, authorUserId: account.userId, body, timecodeMs: input.timecodeMs ?? null, mentions: input.mentions ?? [], status: "open" as const, createdAt: now, updatedAt: now };
  await getDatabase().transaction(async tx => {
    await tx.insert(productionReviews).values(review);
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionReview.create", metadata: { projectId: input.projectId, shotId: shot.id, variantId: variant.id, reviewId: review.id }, createdAt: now, updatedAt: now });
  });
  return review;
}

export async function decideProductionVariant(input: { projectId: string; variantId: string; decision: "approved" | "changesRequested"; comment?: string }) {
  const account = requireAccount();
  const action = input.decision === "approved" ? "approve" : "review";
  const { project } = await requireProjectAccess(input.projectId, action);
  const { variant, shot } = await getProjectVariant(input.projectId, input.variantId);
  if (variant.status !== "candidate") invalid("当前候选片段已经处理，不能重复审批", 409);
  const now = new Date();
  const approval = { id: randomUUID(), projectId: input.projectId, shotId: shot.id, variantId: variant.id, actorUserId: account.userId, decision: input.decision, comment: input.comment?.trim() || null, createdAt: now, updatedAt: now };
  await getDatabase().transaction(async tx => {
    await tx.insert(productionApprovals).values(approval);
    await tx.update(productionClipVariants).set({ status: input.decision, updatedAt: now }).where(eq(productionClipVariants.id, variant.id));
    await tx.update(productionShots).set({ status: input.decision === "approved" ? "approved" : "changesRequested", updatedAt: now }).where(eq(productionShots.id, shot.id));
    if (input.decision === "approved") {
      const projectShots = await tx.select({ status: productionShots.status }).from(productionShots).innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId)).innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId)).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(eq(productionSeasons.projectId, input.projectId));
      if (projectShots.length > 0 && projectShots.every(item => item.status === "approved")) await tx.update(productionProjects).set({ status: "approved", updatedAt: now }).where(eq(productionProjects.id, input.projectId));
    }
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: input.decision === "approved" ? "productionApproval.approve" : "productionApproval.changesRequested", metadata: { projectId: input.projectId, shotId: shot.id, variantId: variant.id, approvalId: approval.id, comment: approval.comment }, createdAt: now, updatedAt: now });
  });
  return approval;
}

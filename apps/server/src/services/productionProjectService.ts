import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { GeneratedMedia, MediaGenerationRequest } from "@omnistudio-next/tools-scaffold/runtime";
import { getDatabase } from "@/db/database";
import { auditEvents, generationJobs, productionApprovals, productionClipVariants, productionDeliveries, productionEpisodes, productionProjectAssets, productionProjectMembers, productionProjects, productionReviews, productionScenes, productionScriptDrafts, productionScriptRecords, productionSeasons, productionShots, teamMembers, teams, users } from "@/db/schema";
import { requireAccount } from "@/utils/accountContext";
import { roleAllows, type ProductionProjectAction, type ProductionProjectRole } from "@/utils/productionProject/permissions";
import { generateMedia, getVideoBillingKind } from "@/utils/media/generation";
import { quoteCredits } from "@/services/billingService";
import type { ProductionScriptDocument } from "@/utils/productionProject/scriptDocument";
import u from "@/utils";

export type ProductionProjectStatus = "draft" | "scripted" | "storyboarded" | "generating" | "editing" | "review" | "approved" | "delivered";
type ProductionTransaction = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];

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

const videoProductionStatuses = ["generating", "editing", "review", "approved", "delivered"];

function assertPreProductionEditable(status: string) {
  if (videoProductionStatuses.includes(status)) invalid("项目已进入视频生产阶段，剧集、主体资产和分镜已锁定", 409);
}

async function assertProjectStageReady(tx: ProductionTransaction, projectId: string, targetStatus: ProductionProjectStatus) {
  if (targetStatus === "scripted") {
    const episodes = await tx.select({ id: productionEpisodes.id }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(eq(productionSeasons.projectId, projectId)).limit(1);
    if (!episodes.length) invalid("至少创建一集后才能确认分镜剧集", 409);
    return;
  }
  if (targetStatus !== "storyboarded" && targetStatus !== "generating") return;

  const episodes = await tx.select({ id: productionEpisodes.id }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(eq(productionSeasons.projectId, projectId));
  if (!episodes.length) invalid("至少创建一集后才能确认分镜脚本", 409);
  const episodeIds = episodes.map(episode => episode.id);
  const assets = await tx.select({ assetType: productionProjectAssets.assetType, name: productionProjectAssets.name, visualDescription: productionProjectAssets.visualDescription, episodeIds: productionProjectAssets.episodeIds }).from(productionProjectAssets).where(eq(productionProjectAssets.projectId, projectId));
  if (!assets.length || assets.some(asset => !asset.name.trim() || !asset.visualDescription?.trim())) invalid("主体资产名称和视觉设定必须完整", 409);
  if (!assets.some(asset => asset.assetType === "character") || !assets.some(asset => asset.assetType === "scene")) invalid("至少需要一名角色和一个场景的主体资产设定", 409);
  if (episodeIds.some(episodeId => !assets.some(asset => !asset.episodeIds?.length || asset.episodeIds.includes(episodeId)))) invalid("每集至少需要关联一项主体资产", 409);

  const scenes = await tx.select({ id: productionScenes.id, episodeId: productionScenes.episodeId }).from(productionScenes).innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId)).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(eq(productionSeasons.projectId, projectId));
  const sceneIds = scenes.map(scene => scene.id);
  const shots = sceneIds.length ? await tx.select({ sceneId: productionShots.sceneId, durationMs: productionShots.durationMs, shotType: productionShots.shotType, prompt: productionShots.prompt }).from(productionShots).where(inArray(productionShots.sceneId, sceneIds)) : [];
  if (episodeIds.some(episodeId => !scenes.some(scene => scene.episodeId === episodeId && shots.some(shot => shot.sceneId === scene.id)))) invalid("每集至少需要一个分镜镜头", 409);
  if (!shots.length || shots.some(shot => !shot.prompt?.trim() || !shot.shotType?.trim() || shot.durationMs <= 0)) invalid("所有镜头都必须填写时长、景别和画面提示词", 409);
}

async function requireWorkspaceMember(workspaceId: string) {
  const account = requireAccount();
  const database = getDatabase();
  const membership = await database.select({ id: teams.id }).from(teams).leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), eq(teamMembers.userId, account.userId)))
    .where(account.isRoot ? and(eq(teams.id, workspaceId), eq(teams.status, "active")) : and(eq(teams.id, workspaceId), eq(teams.status, "active"), eq(teamMembers.userId, account.userId))).limit(1);
  if (!membership.length) invalid("无权访问这个工作空间", 403);
}

export async function createProductionProject(input: { workspaceId: string; title: string; customerId?: string; budgetCents: string; initialDraft?: Record<string, unknown> }) {
  const account = requireAccount();
  await requireWorkspaceMember(input.workspaceId);
  assertBudget(input.budgetCents);
  const now = new Date();
  const project = { id: randomUUID(), workspaceId: input.workspaceId, customerId: input.customerId ?? null, title: input.title.trim(), status: "draft" as const, budgetCents: input.budgetCents, createdBy: account.userId, createdAt: now, updatedAt: now };
  await getDatabase().transaction(async tx => {
    await tx.insert(productionProjects).values(project);
    await tx.insert(productionProjectMembers).values({ id: randomUUID(), projectId: project.id, userId: account.userId, role: "owner", status: "active", createdBy: account.userId, createdAt: now, updatedAt: now });
    if (input.initialDraft) await tx.insert(productionScriptDrafts).values({ projectId: project.id, draftData: input.initialDraft, generationData: null, revision: 1, updatedBy: account.userId, createdAt: now, updatedAt: now });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: input.workspaceId, action: "productionProject.create", metadata: { projectId: project.id, title: project.title, budgetCents: project.budgetCents }, createdAt: now, updatedAt: now });
  });
  return { ...project, draftRevision: input.initialDraft ? 1 : 0 };
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

const productionProjectRoles: readonly ProductionProjectRole[] = ["owner", "producer", "writer", "director", "artist", "editor", "reviewer", "viewer"];

function assertProductionProjectRole(role: string): asserts role is ProductionProjectRole {
  if (!productionProjectRoles.includes(role as ProductionProjectRole)) invalid("项目成员角色无效", 422);
}

function memberView(member: typeof productionProjectMembers.$inferSelect, user: { id: string; email: string; displayName: string | null }) {
  return { id: member.id, userId: user.id, email: user.email, displayName: user.displayName, role: member.role, status: member.status };
}

async function requireProjectMemberManager(projectId: string) {
  const result = await requireProjectAccess(projectId, "manageMembers");
  if (result.member.role !== "owner" && result.member.role !== "producer") invalid("只有项目所有者或制片人可以管理项目成员", 403);
  return result;
}

export async function listProductionProjectMembers(projectId: string) {
  const { project } = await requireProjectMemberManager(projectId);
  const database = getDatabase();
  const members = await database.select({ member: productionProjectMembers, user: { id: users.id, email: users.email, displayName: users.displayName } })
    .from(productionProjectMembers).innerJoin(users, eq(users.id, productionProjectMembers.userId))
    .where(eq(productionProjectMembers.projectId, projectId)).orderBy(asc(productionProjectMembers.createdAt));
  const teamUsers = await database.select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId)).innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(and(eq(teamMembers.teamId, project.workspaceId), eq(teams.status, "active"), eq(users.status, "active")))
    .orderBy(asc(users.displayName), asc(users.email));
  const activeIds = new Set(members.filter(item => item.member.status === "active").map(item => item.user.id));
  return {
    members: members.map(item => memberView(item.member, item.user)),
    availableUsers: teamUsers.filter(user => !activeIds.has(user.id)),
  };
}

export async function saveProductionProjectMember(input: { projectId: string; userId: string; role: ProductionProjectRole }) {
  const account = requireAccount();
  assertProductionProjectRole(input.role);
  const { project } = await requireProjectMemberManager(input.projectId);
  return getDatabase().transaction(async tx => {
    const [lockedProject] = await tx.select({ id: productionProjects.id, workspaceId: productionProjects.workspaceId }).from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!lockedProject) invalid("生产项目不存在", 404);
    const [actor] = await tx.select({ role: productionProjectMembers.role }).from(productionProjectMembers).where(and(eq(productionProjectMembers.projectId, input.projectId), eq(productionProjectMembers.userId, account.userId), eq(productionProjectMembers.status, "active"))).limit(1);
    if (!actor || (actor.role !== "owner" && actor.role !== "producer")) invalid("只有项目所有者或制片人可以管理项目成员", 403);
    if (actor.role === "producer" && (input.userId === account.userId || input.role === "owner" || input.role === "producer")) invalid("制片人不能提权或修改自己的项目角色", 403);
    const [current] = await tx.select().from(productionProjectMembers).where(and(eq(productionProjectMembers.projectId, input.projectId), eq(productionProjectMembers.userId, input.userId))).limit(1).for("update");
    if (actor.role === "producer" && (current?.role === "owner" || current?.role === "producer")) invalid("制片人不能修改 owner 或其他制片人的项目角色", 403);
    if (current?.status === "active" && current.role === "owner" && input.role !== "owner") {
      const owners = await tx.select({ id: productionProjectMembers.id }).from(productionProjectMembers).innerJoin(users, eq(users.id, productionProjectMembers.userId)).where(and(eq(productionProjectMembers.projectId, input.projectId), eq(productionProjectMembers.status, "active"), eq(productionProjectMembers.role, "owner"), eq(users.status, "active")));
      if (!owners.some(owner => owner.id !== current.id)) invalid("项目至少需要保留一名有效 owner", 409);
    }
    const [teamUser] = await tx.select({ id: users.id, email: users.email, displayName: users.displayName, teamId: teams.id }).from(users)
      .leftJoin(teamMembers, and(eq(teamMembers.userId, users.id), eq(teamMembers.teamId, lockedProject.workspaceId)))
      .leftJoin(teams, and(eq(teams.id, teamMembers.teamId), eq(teams.status, "active")))
      .where(and(eq(users.id, input.userId), eq(users.status, "active"))).limit(1);
    const existingOwner = current?.status === "active" && current.role === "owner" && actor.role === "owner" && input.userId === account.userId;
    if (!teamUser || (!teamUser.teamId && !existingOwner)) invalid("只能添加当前项目所属团队中的有效账户", 404);
    if (current?.status === "active" && current.role === input.role) return { member: memberView(current, teamUser), changed: false };
    const now = new Date();
    if (current) await tx.update(productionProjectMembers).set({ role: input.role, status: "active", updatedAt: now }).where(eq(productionProjectMembers.id, current.id));
    else await tx.insert(productionProjectMembers).values({ id: randomUUID(), projectId: input.projectId, userId: input.userId, role: input.role, status: "active", createdBy: account.userId, createdAt: now, updatedAt: now });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: current?.status === "removed" ? "productionProjectMember.restore" : current ? "productionProjectMember.update" : "productionProjectMember.add", metadata: { projectId: input.projectId, userId: input.userId, beforeRole: current?.role ?? null, beforeStatus: current?.status ?? null, role: input.role }, createdAt: now, updatedAt: now });
    const [saved] = await tx.select().from(productionProjectMembers).where(and(eq(productionProjectMembers.projectId, input.projectId), eq(productionProjectMembers.userId, input.userId))).limit(1);
    return { member: memberView(saved!, teamUser), changed: true };
  });
}

export async function removeProductionProjectMember(input: { projectId: string; userId: string }) {
  const account = requireAccount();
  const { project } = await requireProjectMemberManager(input.projectId);
  return getDatabase().transaction(async tx => {
    const [lockedProject] = await tx.select({ id: productionProjects.id }).from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!lockedProject) invalid("生产项目不存在", 404);
    const [actor] = await tx.select({ role: productionProjectMembers.role }).from(productionProjectMembers).where(and(eq(productionProjectMembers.projectId, input.projectId), eq(productionProjectMembers.userId, account.userId), eq(productionProjectMembers.status, "active"))).limit(1);
    if (!actor || (actor.role !== "owner" && actor.role !== "producer")) invalid("只有项目所有者或制片人可以管理项目成员", 403);
    const [current] = await tx.select().from(productionProjectMembers).where(and(eq(productionProjectMembers.projectId, input.projectId), eq(productionProjectMembers.userId, input.userId))).limit(1).for("update");
    if (!current || current.status === "removed") return { changed: false };
    if (input.userId === account.userId) invalid("不能移除自己的项目成员资格", 409);
    if (actor.role === "producer" && (current.role === "owner" || current.role === "producer")) invalid("制片人不能移除 owner 或其他制片人", 403);
    if (current.role === "owner") {
      const owners = await tx.select({ id: productionProjectMembers.id }).from(productionProjectMembers).innerJoin(users, eq(users.id, productionProjectMembers.userId)).where(and(eq(productionProjectMembers.projectId, input.projectId), eq(productionProjectMembers.status, "active"), eq(productionProjectMembers.role, "owner"), eq(users.status, "active")));
      if (!owners.some(owner => owner.id !== current.id)) invalid("项目至少需要保留一名有效 owner", 409);
    }
    const now = new Date();
    await tx.update(productionProjectMembers).set({ status: "removed", updatedAt: now }).where(eq(productionProjectMembers.id, current.id));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionProjectMember.remove", metadata: { projectId: input.projectId, userId: input.userId, role: current.role }, createdAt: now, updatedAt: now });
    return { changed: true };
  });
}

async function recoverProductionProjectAssetReferences(project: Pick<typeof productionProjects.$inferSelect, "id" | "workspaceId">) {
  const account = requireAccount();
  await getDatabase().transaction(async tx => {
    const assets = await tx.select().from(productionProjectAssets).where(and(eq(productionProjectAssets.projectId, project.id), eq(productionProjectAssets.referenceStatus, "generating"))).for("update");
    if (!assets.length) return;
    const jobs = await tx.select().from(generationJobs).where(and(eq(generationJobs.projectId, project.id), eq(generationJobs.mediaType, "image"))).orderBy(desc(generationJobs.createdAt));
    for (const asset of assets) {
      // ACT: 仅旧版生成中记录需要按快照找回任务；新版状态与任务 ID 在预留事务中一起提交。
      const job = jobs.find(job => job.id === asset.referenceGenerationJobId) ?? jobs.find(job => {
        if (job.createdAt.getTime() < asset.updatedAt.getTime()) return false;
        const snapshot = job.requestSnapshot as { request?: { request?: { prompt?: string; outputDirectory?: string } } } | null;
        return snapshot?.request?.request?.prompt === asset.referencePrompt && snapshot.request.request.outputDirectory === `assets/production/${project.id}`;
      });
      if (job && (job.status === "reserved" || job.status === "running")) {
        if (asset.referenceGenerationJobId !== job.id) await tx.update(productionProjectAssets).set({ referenceGenerationJobId: job.id }).where(eq(productionProjectAssets.id, asset.id));
        continue;
      }
      const files = job?.status === "succeeded" ? (job.resultSnapshot as { files?: unknown } | null)?.files : undefined;
      const file = Array.isArray(files) ? files.find((file): file is GeneratedMedia => file && typeof file === "object" && typeof file.path === "string" && file.path.trim() && file.mediaType === "image" && typeof file.mimeType === "string" && file.mimeType.startsWith("image/")) : undefined;
      const referenceStatus = file || (asset.referencePath && asset.referenceMimeType?.startsWith("image/")) ? "succeeded" as const : "failed" as const;
      const now = new Date();
      await tx.update(productionProjectAssets).set({ referenceStatus, referenceGenerationJobId: job?.id ?? null, ...(file ? { referencePath: file.path, referenceMimeType: file.mimeType } : {}), updatedAt: now }).where(eq(productionProjectAssets.id, asset.id));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionAsset.referenceImageRecovered", metadata: { projectId: project.id, assetId: asset.id, generationJobId: job?.id ?? null, attemptNumber: asset.referenceRevision, referenceStatus, jobStatus: job?.status ?? null, reason: job ? "根据已结算的真实任务恢复参考图状态" : "未找到对应的预留任务，恢复为可重试状态" }, createdAt: now, updatedAt: now });
    }
  });
}

export async function getProductionProject(projectId: string) {
  const { project } = await requireProjectAccess(projectId, "read");
  await recoverProductionProjectAssetReferences(project);
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
  const deliveries = await database.select().from(productionDeliveries).where(eq(productionDeliveries.projectId, projectId)).orderBy(desc(productionDeliveries.createdAt));
  const assets = await database.select().from(productionProjectAssets).where(eq(productionProjectAssets.projectId, projectId)).orderBy(asc(productionProjectAssets.createdAt));
  return {
    project,
    members,
    seasons,
    episodes,
    scenes,
    shots: shots.map(shot => ({ ...shot, characterAssetIds: shot.characterAssetIds ?? [], propAssetIds: shot.propAssetIds ?? [] })),
    variants,
    reviews,
    approvals,
    deliveries,
    assets: assets.map(asset => ({ ...asset, description: asset.description ?? "", visualDescription: asset.visualDescription ?? "", episodeIds: asset.episodeIds ?? [] })),
  };
}

export async function getProductionScriptDraft(projectId: string) {
  await requireProjectAccess(projectId, "read");
  const [draft] = await getDatabase().select().from(productionScriptDrafts).where(eq(productionScriptDrafts.projectId, projectId)).limit(1);
  return draft ? { draft: draft.draftData, generationData: draft.generationData, revision: draft.revision, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy } : { draft: null, generationData: null, revision: 0, updatedAt: null, updatedBy: null };
}

export async function getProductionScriptHistory(projectId: string) {
  await requireProjectAccess(projectId, "read");
  const records = await getDatabase().select().from(productionScriptRecords).where(eq(productionScriptRecords.projectId, projectId)).orderBy(desc(productionScriptRecords.revision));
  return records.map(record => {
    const { document, source, restoredFromRevision } = u.productionScriptDocument.readScriptDocumentSnapshot(record.confirmedSnapshot);
    return { id: record.id, revision: record.revision, createdAt: record.createdAt, source, episodeCount: document.episodes.length, ...(restoredFromRevision ? { restoredFromRevision } : {}) };
  });
}

async function currentScriptStructure(database: Pick<ProductionTransaction, "select">, projectId: string) {
  const episodes = await database.select({ id: productionEpisodes.id, episodeNumber: productionEpisodes.episodeNumber, title: productionEpisodes.title }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(eq(productionSeasons.projectId, projectId)).orderBy(asc(productionSeasons.seasonNumber), asc(productionEpisodes.episodeNumber));
  const episodeIds = episodes.map(episode => episode.id);
  const scenes = episodeIds.length ? await database.select().from(productionScenes).where(inArray(productionScenes.episodeId, episodeIds)).orderBy(asc(productionScenes.sceneNumber)) : [];
  const sceneIds = scenes.map(scene => scene.id);
  const shots = sceneIds.length ? await database.select().from(productionShots).where(inArray(productionShots.sceneId, sceneIds)).orderBy(asc(productionShots.shotNumber)) : [];
  return { episodes: episodes.map(episode => ({ ...episode, scenes: scenes.filter(scene => scene.episodeId === episode.id).map(scene => ({ ...scene, shots: shots.filter(shot => shot.sceneId === scene.id) })) })) };
}

export async function getProductionScriptDocument(projectId: string, revision?: number) {
  const { project } = await requireProjectAccess(projectId, "read");
  const database = getDatabase();
  const [record] = await database.select().from(productionScriptRecords).where(revision === undefined ? eq(productionScriptRecords.projectId, projectId) : and(eq(productionScriptRecords.projectId, projectId), eq(productionScriptRecords.revision, revision))).orderBy(desc(productionScriptRecords.revision)).limit(1);
  if (record) return { ...u.productionScriptDocument.readScriptDocumentSnapshot(record.confirmedSnapshot), revision: record.revision, createdAt: record.createdAt };
  if (revision !== undefined) invalid("指定剧本版本不存在", 404);
  return { document: u.productionScriptDocument.buildDerivedScriptDocument(await currentScriptStructure(database, projectId)), revision: 0, source: "derived" as const, createdAt: project.createdAt };
}

type ScriptDocumentVersionInput = { projectId: string; expectedRevision: number } & ({ document: ProductionScriptDocument; revision?: never } | { document?: never; revision: number });

export async function saveProductionScriptDocument(input: ScriptDocumentVersionInput) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "create");
  return getDatabase().transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    assertPreProductionEditable(project.status);
    const [latest] = await tx.select().from(productionScriptRecords).where(eq(productionScriptRecords.projectId, input.projectId)).orderBy(desc(productionScriptRecords.revision)).limit(1);
    if ((latest?.revision ?? 0) !== input.expectedRevision) invalid("剧本已被其他会话更新，请加载最新版本后再保存；本次修改未覆盖服务器内容", 409);
    let previous = latest;
    if (input.revision !== undefined) {
      const [target] = await tx.select().from(productionScriptRecords).where(and(eq(productionScriptRecords.projectId, input.projectId), eq(productionScriptRecords.revision, input.revision))).limit(1);
      if (!target) invalid("指定剧本版本不存在", 404);
      previous = target;
    }
    const previousSnapshot = previous?.confirmedSnapshot ?? await currentScriptStructure(tx, input.projectId);
    const previousDocument = u.productionScriptDocument.readScriptDocumentSnapshot(previousSnapshot).document;
    const document = input.document ?? previousDocument;
    if (input.document) {
      const previousNumbers = previousDocument.episodes.map(episode => episode.episodeNumber);
      const documentNumbers = document.episodes.map(episode => episode.episodeNumber);
      if (previousNumbers.length !== documentNumbers.length || previousNumbers.some((number, index) => number !== documentNumbers[index])) invalid("保存正文不能增删剧集或修改分集编号，请保留当前剧集结构", 422);
    }
    const now = new Date();
    const revision = (latest?.revision ?? 0) + 1;
    const restoredFromRevision = input.revision;
    const confirmedSnapshot = { ...previousSnapshot, scriptDocument: document, scriptSource: "edited", restoredFromRevision: restoredFromRevision ?? null };
    await tx.insert(productionScriptRecords).values({ id: randomUUID(), projectId: input.projectId, revision, generationData: previous?.generationData ?? {}, confirmedSnapshot, createdBy: account.userId, createdAt: now, updatedAt: now });
    await tx.update(productionProjects).set({ updatedAt: now }).where(eq(productionProjects.id, input.projectId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: restoredFromRevision === undefined ? "productionScript.documentSaved" : "productionScript.documentRestored", metadata: { projectId: input.projectId, revision, previousRevision: latest?.revision ?? 0, ...(restoredFromRevision ? { restoredFromRevision } : {}) }, createdAt: now, updatedAt: now });
    return { document, revision, source: "edited" as const, createdAt: now, ...(restoredFromRevision ? { restoredFromRevision } : {}) };
  });
}

export async function saveProductionScriptDraft(input: { projectId: string; expectedRevision: number; draft: Record<string, unknown>; generationData?: Record<string, unknown> | null }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "create");
  const database = getDatabase();
  const now = new Date();
  let revision = 0;
  await database.transaction(async tx => {
    const [project] = await tx.select({ id: productionProjects.id, status: productionProjects.status }).from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    if (project.status !== "draft") invalid("项目已确认剧集结构，不能再保存剧本草稿", 409);
    const [current] = await tx.select().from(productionScriptDrafts).where(eq(productionScriptDrafts.projectId, input.projectId)).limit(1).for("update");
    if ((current?.revision ?? 0) !== input.expectedRevision) invalid("剧本草稿已被其他会话更新；请刷新后恢复最新版本，本次修改未覆盖服务器草稿", 409);
    revision = input.expectedRevision + 1;
    if (current) {
      const update = { draftData: input.draft, revision, updatedBy: account.userId, updatedAt: now };
      await tx.update(productionScriptDrafts).set(input.generationData === undefined ? update : { ...update, generationData: input.generationData }).where(eq(productionScriptDrafts.projectId, input.projectId));
    } else {
      await tx.insert(productionScriptDrafts).values({ projectId: input.projectId, draftData: input.draft, generationData: input.generationData ?? null, revision, updatedBy: account.userId, createdAt: now, updatedAt: now });
    }
  });
  return { revision, updatedAt: now, updatedBy: account.userId };
}

async function assertAssetEpisodesBelongToProject(tx: ProductionTransaction, projectId: string, episodeIds: string[]) {
  if (!episodeIds.length) return;
  const rows = await tx.select({ id: productionEpisodes.id }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(and(eq(productionSeasons.projectId, projectId), inArray(productionEpisodes.id, episodeIds)));
  if (rows.length !== episodeIds.length) invalid("指定剧集不属于当前项目", 422);
}

export async function createProductionProjectAsset(input: { projectId: string; assetType: "character" | "scene" | "prop"; name: string; description: string; visualDescription: string; episodeIds: string[] }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "edit");
  if (!input.name.trim() || !input.visualDescription.trim()) invalid("主体资产名称和视觉设定不能为空", 422);
  const now = new Date();
  const asset = { id: randomUUID(), projectId: input.projectId, assetType: input.assetType, name: input.name.trim(), description: input.description.trim(), visualDescription: input.visualDescription.trim(), episodeIds: input.episodeIds, createdBy: account.userId, createdAt: now, updatedAt: now };
  await getDatabase().transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    assertPreProductionEditable(project.status);
    await assertAssetEpisodesBelongToProject(tx, input.projectId, input.episodeIds);
    await tx.insert(productionProjectAssets).values(asset);
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionProjectAsset.create", metadata: { projectId: input.projectId, assetId: asset.id, assetType: asset.assetType, name: asset.name, episodeIds: asset.episodeIds }, createdAt: now, updatedAt: now });
  });
  return asset;
}

export async function updateProductionProjectAsset(input: { projectId: string; assetId: string; assetType: "character" | "scene" | "prop"; name: string; description: string; visualDescription: string; episodeIds: string[] }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "edit");
  if (!input.name.trim() || !input.visualDescription.trim()) invalid("主体资产名称和视觉设定不能为空", 422);
  const now = new Date();
  let updatedAsset: typeof productionProjectAssets.$inferSelect | undefined;
  await getDatabase().transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    assertPreProductionEditable(project.status);
    await assertAssetEpisodesBelongToProject(tx, input.projectId, input.episodeIds);
    const [current] = await tx.select().from(productionProjectAssets).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.projectId, input.projectId))).limit(1).for("update");
    if (!current) invalid("主体资产不属于当前项目", 404);
    const shotReferences = await tx.select({ characterAssetIds: productionShots.characterAssetIds, propAssetIds: productionShots.propAssetIds, episodeId: productionEpisodes.id }).from(productionShots)
      .innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId))
      .innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId))
      .innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
      .where(eq(productionSeasons.projectId, input.projectId));
    for (const reference of shotReferences) {
      const usedAsCharacter = reference.characterAssetIds?.includes(input.assetId) ?? false;
      const usedAsProp = reference.propAssetIds?.includes(input.assetId) ?? false;
      if ((usedAsCharacter && input.assetType !== "character") || (usedAsProp && input.assetType !== "prop")) invalid("资产已被分镜引用，不能修改为不匹配的类型", 409);
      if ((usedAsCharacter || usedAsProp) && input.episodeIds.length && !input.episodeIds.includes(reference.episodeId)) invalid("资产已被分镜引用，不能移出相关剧集", 409);
    }
    updatedAsset = { ...current, assetType: input.assetType, name: input.name.trim(), description: input.description.trim(), visualDescription: input.visualDescription.trim(), episodeIds: input.episodeIds, updatedAt: now };
    await tx.update(productionProjectAssets).set({ assetType: updatedAsset.assetType, name: updatedAsset.name, description: updatedAsset.description, visualDescription: updatedAsset.visualDescription, episodeIds: updatedAsset.episodeIds, updatedAt: now }).where(eq(productionProjectAssets.id, input.assetId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionProjectAsset.update", metadata: { projectId: input.projectId, assetId: input.assetId, before: { assetType: current.assetType, name: current.name, description: current.description, visualDescription: current.visualDescription, episodeIds: current.episodeIds }, after: { assetType: updatedAsset.assetType, name: updatedAsset.name, description: updatedAsset.description, visualDescription: updatedAsset.visualDescription, episodeIds: updatedAsset.episodeIds } }, createdAt: now, updatedAt: now });
  });
  return updatedAsset;
}

export async function generateProductionProjectAsset(input: { projectId: string; assetId: string; cwd: string; request: MediaGenerationRequest; idempotencyKey: string }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "generate");
  await recoverProductionProjectAssetReferences(project);
  const database = getDatabase();
  const [currentRow] = await database.select().from(productionProjectAssets).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.projectId, input.projectId))).limit(1);
  const current = currentRow ? { ...currentRow } : undefined;
  if (!current) invalid("主体资产不属于当前项目", 404);
  const creativeSettings = project.creativeSettings;
  const prompt = [
    creativeSettings?.genre ? `题材方向：${creativeSettings.genre}` : "",
    creativeSettings?.fusionGenres?.length ? `融合题材：${creativeSettings.fusionGenres.join("、")}` : "",
    creativeSettings?.style ? `统一视觉风格：${creativeSettings.style}` : "",
    creativeSettings?.stylePrompt ? `风格提示：${creativeSettings.stylePrompt}` : "",
    creativeSettings?.styleNegativePrompt ? `风格排除：${creativeSettings.styleNegativePrompt}` : "",
    creativeSettings?.aspectRatio ? `画幅比例：${creativeSettings.aspectRatio}` : "",
    `主体类型：${current.assetType === "character" ? "角色" : current.assetType === "scene" ? "场景" : "道具"}`,
    `主体名称：${current.name}`,
    current.description ? `设定说明：${current.description}` : "",
    `视觉设定：${current.visualDescription}`,
    `参考图要求：${input.request.prompt}`,
  ].filter(Boolean).join("\n\n");
  if (prompt.length > 100000) invalid("主体资产设定与提示词合计超过模型限制，请精简后重试", 422);
  const request = { ...input.request, prompt, outputDirectory: `assets/production/${input.projectId}`, ...(creativeSettings?.aspectRatio && !input.request.ratio ? { ratio: creativeSettings.aspectRatio } : {}) };
  const quote = await quoteCredits(request.providerId, request.modelId, "image", 1, undefined, request.size);
  const jobIdRef: { id?: string } = {};
  const now = new Date();
  let attemptNumber = 0;
  try {
    const files = await generateMedia(input.cwd, "image", request, undefined, {
      userId: account.userId, idempotencyKey: input.idempotencyKey, projectId: input.projectId, estimatedCostCents: quote.credits, jobIdRef,
      onReserved: async (tx, generationJobId) => {
        const [locked] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
        if (!locked) invalid("生产项目不存在", 404);
        assertPreProductionEditable(locked.status);
        const [asset] = await tx.select().from(productionProjectAssets).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.projectId, input.projectId))).limit(1).for("update");
        if (!asset) invalid("主体资产不属于当前项目", 404);
        if (asset.referenceStatus === "generating") invalid("该主体资产正在生成参考图，请稍候", 409);
        // 当前任务已在本事务预留，预算检查只计入一次。
        await assertProjectBudget(tx, input.projectId, locked.budgetCents, "0");
        attemptNumber = asset.referenceRevision + 1;
        await tx.update(productionProjectAssets).set({ referenceStatus: "generating", referenceGenerationJobId: generationJobId, referenceRevision: attemptNumber, referencePrompt: prompt, updatedAt: now }).where(eq(productionProjectAssets.id, input.assetId));
        await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: locked.workspaceId, action: "productionAsset.referenceImageGenerationStarted", metadata: { projectId: input.projectId, assetId: input.assetId, generationJobId, attemptNumber, quotedCredits: quote.credits }, createdAt: now, updatedAt: now });
      },
    });
    if (!jobIdRef.id || !files.length) invalid("生成任务没有返回可用的参考图", 502);
    const file = files[0] as GeneratedMedia;
    const [job] = await database.select({ status: generationJobs.status }).from(generationJobs).where(eq(generationJobs.id, jobIdRef.id)).limit(1);
    if (job?.status !== "succeeded") invalid("生成任务未成功结算", 409);
    const updated = await database.transaction(async tx => {
      const [asset] = await tx.select().from(productionProjectAssets).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.projectId, input.projectId))).limit(1).for("update");
      if (!asset) invalid("主体资产不属于当前项目", 404);
      if (asset.referenceGenerationJobId !== jobIdRef.id) invalid("主体资产已有更新的生成任务，本次结果已保留在原任务记录中", 409);
      const next = { referencePath: file.path, referenceMimeType: file.mimeType, referenceGenerationJobId: jobIdRef.id ?? null, referenceStatus: "succeeded" as const, updatedAt: new Date() };
      await tx.update(productionProjectAssets).set(next).where(eq(productionProjectAssets.id, input.assetId));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionAsset.referenceImageGenerated", metadata: { projectId: input.projectId, assetId: input.assetId, generationJobId: jobIdRef.id, attemptNumber, filePath: file.path, quotedCredits: quote.credits }, createdAt: new Date(), updatedAt: new Date() });
      return { ...asset, ...next };
    });
    return { asset: updated, file, quotedCredits: quote.credits, generationJobId: jobIdRef.id };
  } catch (error) {
    if (jobIdRef.id) await database.update(productionProjectAssets).set({ referenceStatus: current.referencePath ? "succeeded" : "failed", updatedAt: new Date() }).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.referenceStatus, "generating"), eq(productionProjectAssets.referenceGenerationJobId, jobIdRef.id)));
    throw error;
  }
}

export async function updateProductionProject(input: { projectId: string; title?: string; customerId?: string | null; budgetCents?: string; status?: ProductionProjectStatus }) {
  const account = requireAccount();
  const action = input.budgetCents !== undefined ? "manageBudget" : input.status === "approved" ? "approve" : input.status === "delivered" ? "export" : "edit";
  const current = await requireProjectAccess(input.projectId, action);
  if (!input.title && input.customerId === undefined && input.budgetCents === undefined && !input.status) invalid("没有可保存的项目字段", 422);
  if (input.budgetCents !== undefined) assertBudget(input.budgetCents);
  const now = new Date();
  let updatedProject: typeof current.project | undefined;
  await getDatabase().transaction(async tx => {
    const [lockedProject] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!lockedProject) invalid("生产项目不存在", 404);
    const status = lockedProject.status as ProductionProjectStatus;
    if (input.status && input.status !== status && !statusTransitions[status].includes(input.status)) invalid(`项目状态不能从 ${status} 变为 ${input.status}`, 409);
    if (input.status) await assertProjectStageReady(tx, input.projectId, input.status);
    const patch = { ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.customerId !== undefined ? { customerId: input.customerId } : {}), ...(input.budgetCents !== undefined ? { budgetCents: input.budgetCents } : {}), ...(input.status ? { status: input.status } : {}), updatedAt: now };
    await tx.update(productionProjects).set(patch).where(eq(productionProjects.id, input.projectId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: lockedProject.workspaceId, action: "productionProject.update", metadata: { projectId: input.projectId, before: { title: lockedProject.title, customerId: lockedProject.customerId, budgetCents: lockedProject.budgetCents, status: lockedProject.status }, after: patch }, createdAt: now, updatedAt: now });
    updatedProject = { ...lockedProject, ...patch };
  });
  return updatedProject;
}

export async function createProductionEpisode(input: { projectId: string; seasonNumber: number; seasonTitle: string; episodeNumber: number; title: string; targetDurationMs?: number }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "create");
  assertPositiveInteger(input.seasonNumber, "季编号");
  assertPositiveInteger(input.episodeNumber, "集编号");
  const database = getDatabase();
  const now = new Date();
  return database.transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    assertPreProductionEditable(project.status);
    let [season] = await tx.select().from(productionSeasons).where(and(eq(productionSeasons.projectId, input.projectId), eq(productionSeasons.seasonNumber, input.seasonNumber))).limit(1);
    if (!season) {
      season = { id: randomUUID(), projectId: input.projectId, seasonNumber: input.seasonNumber, title: input.seasonTitle.trim(), status: "draft" as const, createdAt: now, updatedAt: now };
      await tx.insert(productionSeasons).values(season);
    }
    const [existing] = await tx.select().from(productionEpisodes).where(and(eq(productionEpisodes.seasonId, season.id), eq(productionEpisodes.episodeNumber, input.episodeNumber))).limit(1);
    if (existing) invalid("该剧集编号已存在", 409);
    const episode = { id: randomUUID(), seasonId: season.id, episodeNumber: input.episodeNumber, title: input.title.trim(), status: "draft" as const, targetDurationMs: input.targetDurationMs ?? 0, createdAt: now, updatedAt: now };
    await tx.insert(productionEpisodes).values(episode);
    if (project.status === "draft") await tx.update(productionProjects).set({ status: "scripted", updatedAt: now }).where(eq(productionProjects.id, input.projectId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionEpisode.create", metadata: { projectId: input.projectId, seasonId: season.id, episodeId: episode.id, projectStatus: project.status === "draft" ? { before: "draft", after: "scripted" } : undefined }, createdAt: now, updatedAt: now });
    return { season, episode };
  });
}

async function getEpisodeInProject(projectId: string, episodeId: string) {
  const [row] = await getDatabase().select({ episode: productionEpisodes, season: productionSeasons }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionEpisodes.id, episodeId), eq(productionSeasons.projectId, projectId))).limit(1);
  if (!row) invalid("剧集不属于当前项目", 404);
  return row;
}

async function validateShotAssetReferences(tx: ProductionTransaction, projectId: string, episodeId: string, characterAssetIds: string[], propAssetIds: string[]) {
  const assetIds = [...characterAssetIds, ...propAssetIds];
  if (!assetIds.length) return;
  if (new Set(assetIds).size !== assetIds.length) invalid("镜头关联资产不能重复", 422);
  const assets = await tx.select({ id: productionProjectAssets.id, assetType: productionProjectAssets.assetType, episodeIds: productionProjectAssets.episodeIds }).from(productionProjectAssets)
    .where(and(eq(productionProjectAssets.projectId, projectId), inArray(productionProjectAssets.id, assetIds)));
  if (assets.length !== assetIds.length) invalid("镜头关联资产不属于当前项目", 422);
  for (const asset of assets) {
    const expectedType = characterAssetIds.includes(asset.id) ? "character" : "prop";
    if (asset.assetType !== expectedType) invalid("镜头关联资产类型不匹配", 422);
    if (asset.episodeIds?.length && !asset.episodeIds.includes(episodeId)) invalid("镜头关联资产不适用于当前剧集", 422);
  }
}

function normalizeImportedAssetName(name: string) {
  return name.replace(/\s/gu, "");
}

function resolveImportedAssetNames(assets: { id: string; assetType: "character" | "scene" | "prop"; name: string }[], assetType: "character" | "prop", names: string[] = []) {
  return names.map(name => {
    const normalizedName = normalizeImportedAssetName(name);
    const matches = assets.filter(asset => asset.assetType === assetType && normalizeImportedAssetName(asset.name) === normalizedName);
    if (matches.length === 0) invalid(`剧本引用的${assetType === "character" ? "角色" : "道具"}资产不存在：${name}`, 422);
    if (matches.length > 1) invalid(`剧本引用的${assetType === "character" ? "角色" : "道具"}资产名称重复，无法确定：${name}`, 422);
    return matches[0]!.id;
  });
}

export async function createProductionShot(input: { projectId: string; episodeId: string; sceneNumber: number; sceneTitle: string; continuityNotes?: string; shotNumber: number; durationMs?: number; shotType?: string; camera?: string; lighting?: string; characterAssetIds?: string[]; propAssetIds?: string[]; soundEffects?: string | null; dialogue?: string; narration?: string; prompt?: string }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "create");
  const { episode, season } = await getEpisodeInProject(input.projectId, input.episodeId);
  assertPositiveInteger(input.sceneNumber, "场景编号");
  assertPositiveInteger(input.shotNumber, "镜头编号");
  const database = getDatabase();
  const now = new Date();
  return database.transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    assertPreProductionEditable(project.status);
    const characterAssetIds = input.characterAssetIds ?? [];
    const propAssetIds = input.propAssetIds ?? [];
    await validateShotAssetReferences(tx, input.projectId, episode.id, characterAssetIds, propAssetIds);
    let [scene] = await tx.select().from(productionScenes).where(and(eq(productionScenes.episodeId, episode.id), eq(productionScenes.sceneNumber, input.sceneNumber))).limit(1);
    if (!scene) {
      scene = { id: randomUUID(), episodeId: episode.id, sceneNumber: input.sceneNumber, title: input.sceneTitle.trim(), continuityNotes: input.continuityNotes?.trim() || null, createdAt: now, updatedAt: now };
      await tx.insert(productionScenes).values(scene);
    }
    const [existing] = await tx.select().from(productionShots).where(and(eq(productionShots.sceneId, scene.id), eq(productionShots.shotNumber, input.shotNumber))).limit(1);
    if (existing) invalid("该场景镜头编号已存在", 409);
    const shot = { id: randomUUID(), sceneId: scene.id, shotNumber: input.shotNumber, durationMs: input.durationMs ?? 0, shotType: input.shotType?.trim() || null, camera: input.camera?.trim() || null, lighting: input.lighting?.trim() || null, characterAssetIds, propAssetIds, soundEffects: input.soundEffects?.trim() || null, dialogue: input.dialogue?.trim() || null, narration: input.narration?.trim() || null, prompt: input.prompt?.trim() || null, status: "draft" as const, revision: 1, createdAt: now, updatedAt: now };
    await tx.insert(productionShots).values(shot);
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionShot.create", metadata: { projectId: input.projectId, seasonId: season.id, episodeId: episode.id, sceneId: scene.id, shotId: shot.id }, createdAt: now, updatedAt: now });
    return { season, episode, scene, shot };
  });
}

export type ProductionScriptStructureInput = {
  projectId: string;
  logline: string;
  sourceGeneration: Record<string, unknown>;
  scriptDocument?: ProductionScriptDocument;
  generation: { providerId: string; modelId: string; genre: string; fusionGenres: string[]; style: string; aspectRatio: string; stylePrompt?: string; styleNegativePrompt?: string };
  assets: { assetType: "character" | "scene" | "prop"; name: string; description: string; visualDescription: string }[];
  episodes: {
    episodeNumber: number;
    title: string;
    targetDurationMs: number;
    scenes: {
      sceneNumber: number;
      title: string;
      continuityNotes: string;
      shots: { shotNumber: number; durationMs: number; shotType: string; camera: string; lighting: string; characterAssetIds?: string[]; propAssetIds?: string[]; characterNames?: string[]; propNames?: string[]; soundEffects?: string | null; prompt: string; dialogue: string; narration: string }[];
    }[];
  }[];
};

export async function createProductionScriptStructure(input: ProductionScriptStructureInput) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "create");
  const database = getDatabase();
  const now = new Date();
  const created = { episodes: 0, scenes: 0, shots: 0, assets: 0 };
  await database.transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    if (project.status !== "draft") invalid("当前项目已离开剧本创作阶段，无法再次写入生成草案", 409);
    const [draft] = await tx.select().from(productionScriptDrafts).where(eq(productionScriptDrafts.projectId, input.projectId)).limit(1).for("update");
    const existing = await tx.select({ id: productionEpisodes.id }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(eq(productionSeasons.projectId, input.projectId)).limit(1);
    if (existing.length) invalid("项目已存在剧集，请刷新后继续编辑", 409);

    const importedAssets = input.assets.map(assetData => ({ id: randomUUID(), projectId: input.projectId, assetType: assetData.assetType, name: assetData.name.trim(), description: assetData.description.trim(), visualDescription: assetData.visualDescription.trim(), episodeIds: [] as string[], createdBy: account.userId, createdAt: now, updatedAt: now }));
    for (const asset of importedAssets) await tx.insert(productionProjectAssets).values(asset);
    created.assets = importedAssets.length;

    const season = { id: randomUUID(), projectId: input.projectId, seasonNumber: 1, title: "第一季", status: "draft" as const, createdAt: now, updatedAt: now };
    await tx.insert(productionSeasons).values(season);
    for (const episodeData of input.episodes) {
      const episode = { id: randomUUID(), seasonId: season.id, episodeNumber: episodeData.episodeNumber, title: episodeData.title.trim(), status: "draft" as const, targetDurationMs: episodeData.targetDurationMs, createdAt: now, updatedAt: now };
      await tx.insert(productionEpisodes).values(episode);
      created.episodes += 1;
      for (const sceneData of episodeData.scenes) {
        const scene = { id: randomUUID(), episodeId: episode.id, sceneNumber: sceneData.sceneNumber, title: sceneData.title.trim(), continuityNotes: sceneData.continuityNotes.trim() || null, createdAt: now, updatedAt: now };
        await tx.insert(productionScenes).values(scene);
        created.scenes += 1;
        for (const shotData of sceneData.shots) {
          const characterAssetIds = [...new Set([...(shotData.characterAssetIds ?? []), ...resolveImportedAssetNames(importedAssets, "character", shotData.characterNames)])];
          const propAssetIds = [...new Set([...(shotData.propAssetIds ?? []), ...resolveImportedAssetNames(importedAssets, "prop", shotData.propNames)])];
          await validateShotAssetReferences(tx, input.projectId, episode.id, characterAssetIds, propAssetIds);
          const shot = { id: randomUUID(), sceneId: scene.id, shotNumber: shotData.shotNumber, durationMs: shotData.durationMs, shotType: shotData.shotType.trim(), camera: shotData.camera.trim() || null, lighting: shotData.lighting.trim() || null, characterAssetIds, propAssetIds, soundEffects: shotData.soundEffects?.trim() || null, dialogue: shotData.dialogue.trim() || null, narration: shotData.narration.trim() || null, prompt: shotData.prompt.trim(), status: "draft" as const, revision: 1, createdAt: now, updatedAt: now };
          await tx.insert(productionShots).values(shot);
          created.shots += 1;
        }
      }
    }
    await tx.update(productionProjects).set({ status: "scripted", creativeSettings: input.generation, updatedAt: now }).where(eq(productionProjects.id, input.projectId));
    const scriptInput = {
      mode: typeof draft?.draftData.mode === "string" ? draft.draftData.mode : "create",
      instruction: typeof draft?.draftData.instruction === "string" ? draft.draftData.instruction : "",
      pastedScript: typeof draft?.draftData.pastedScript === "string" ? draft.draftData.pastedScript : "",
    };
    const generatedDocument = input.scriptDocument ?? u.productionScriptDocument.buildDerivedScriptDocument(input);
    const scriptDocument = {
      ...generatedDocument,
      sourceText: input.scriptDocument ? input.scriptDocument.sourceText : scriptInput.pastedScript || generatedDocument.sourceText,
    };
    await tx.insert(productionScriptRecords).values({
      id: randomUUID(),
      projectId: input.projectId,
      revision: 1,
      generationData: input.sourceGeneration,
      confirmedSnapshot: { logline: input.logline, generation: input.generation, assets: input.assets, episodes: input.episodes, scriptDocument, scriptSource: input.scriptDocument ? (scriptInput.mode === "create" ? "generated" : "imported") : "derived", scriptInput },
      createdBy: account.userId,
      createdAt: now,
      updatedAt: now,
    });
    await tx.delete(productionScriptDrafts).where(eq(productionScriptDrafts.projectId, input.projectId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionProject.scriptCreated", metadata: { projectId: input.projectId, logline: input.logline, generation: input.generation, created }, createdAt: now, updatedAt: now });
  });
  return created;
}

export async function updateProductionShot(input: { projectId: string; shotId: string; durationMs?: number; shotType?: string | null; camera?: string | null; lighting?: string | null; characterAssetIds?: string[]; propAssetIds?: string[]; soundEffects?: string | null; dialogue?: string | null; narration?: string | null; prompt?: string | null; status?: "draft" | "ready" }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "edit");
  if (input.durationMs !== undefined && (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0)) invalid("镜头时长无效", 422);
  const now = new Date();
  return getDatabase().transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    assertPreProductionEditable(project.status);
    const [row] = await tx.select({ shot: productionShots, scene: productionScenes, episode: productionEpisodes }).from(productionShots).innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId)).innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId)).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionShots.id, input.shotId), eq(productionSeasons.projectId, input.projectId))).limit(1).for("update");
    if (!row) invalid("镜头不属于当前项目", 404);
    if (row.shot.status === "approved") invalid("已批准镜头不能直接修改", 409);
    const characterAssetIds = input.characterAssetIds ?? row.shot.characterAssetIds ?? [];
    const propAssetIds = input.propAssetIds ?? row.shot.propAssetIds ?? [];
    await validateShotAssetReferences(tx, input.projectId, row.episode.id, characterAssetIds, propAssetIds);
    const patch = { ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}), ...(input.shotType !== undefined ? { shotType: input.shotType?.trim() || null } : {}), ...(input.camera !== undefined ? { camera: input.camera?.trim() || null } : {}), ...(input.lighting !== undefined ? { lighting: input.lighting?.trim() || null } : {}), ...(input.characterAssetIds !== undefined ? { characterAssetIds } : {}), ...(input.propAssetIds !== undefined ? { propAssetIds } : {}), ...(input.soundEffects !== undefined ? { soundEffects: input.soundEffects?.trim() || null } : {}), ...(input.dialogue !== undefined ? { dialogue: input.dialogue?.trim() || null } : {}), ...(input.narration !== undefined ? { narration: input.narration?.trim() || null } : {}), ...(input.prompt !== undefined ? { prompt: input.prompt?.trim() || null } : {}), ...(input.status ? { status: input.status } : {}), revision: row.shot.revision + 1, updatedAt: now };
    if (Object.keys(patch).length === 2) invalid("没有可保存的镜头字段", 422);
    await tx.update(productionShots).set(patch).where(eq(productionShots.id, input.shotId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionShot.update", metadata: { projectId: input.projectId, shotId: input.shotId, revision: patch.revision }, createdAt: now, updatedAt: now });
    return { ...row.shot, ...patch, characterAssetIds, propAssetIds };
  });
}

function costMicro(value: string) {
  return u.billingCredits.parseCredits(value);
}

type ProductionCreativeSettings = NonNullable<(typeof productionProjects.$inferSelect)["creativeSettings"]>;
type ProductionPromptAsset = Pick<(typeof productionProjectAssets.$inferSelect), "assetType" | "name" | "description" | "visualDescription" | "episodeIds">;
type ProductionVideoReferenceAsset = Pick<(typeof productionProjectAssets.$inferSelect), "id" | "assetType" | "name" | "episodeIds" | "referencePath" | "referenceMimeType" | "referenceStatus">;

function buildProductionMediaRequest(input: {
  request: MediaGenerationRequest;
  creativeSettings: ProductionCreativeSettings | null;
  scene: Pick<(typeof productionScenes.$inferSelect), "title" | "continuityNotes">;
  episodeId: string;
  assets: ProductionPromptAsset[];
}): MediaGenerationRequest {
  const { request, creativeSettings, scene, episodeId, assets } = input;
  const episodeAssets = assets.filter(asset => !asset.episodeIds?.length || asset.episodeIds.includes(episodeId));
  const aspectRatio = request.ratio ?? creativeSettings?.aspectRatio;
  const prompt = [
    creativeSettings?.genre ? `题材方向：${creativeSettings.genre}${creativeSettings.fusionGenres.length ? `；融合题材：${creativeSettings.fusionGenres.join("、")}` : ""}` : "",
    creativeSettings?.style ? `统一视觉风格：${creativeSettings.style}` : "",
    creativeSettings?.stylePrompt ? `风格提示：${creativeSettings.stylePrompt}` : "",
    creativeSettings?.styleNegativePrompt ? `风格排除：${creativeSettings.styleNegativePrompt}` : "",
    aspectRatio ? `画幅比例：${aspectRatio}` : "",
    `场景连续性：${scene.title}${scene.continuityNotes ? `；${scene.continuityNotes}` : ""}`,
    ...episodeAssets.map(asset => `主体资产（${asset.assetType === "character" ? "角色" : asset.assetType === "scene" ? "场景" : "道具"}：${asset.name}）：${[asset.description, asset.visualDescription].filter(Boolean).join("；")}`),
    `本镜头画面与动作：${request.prompt}`,
  ].filter(Boolean).join("\n\n");
  if (prompt.length > 100000) invalid("题材、风格和主体资产提示词合计超过模型限制，请精简设定后重试", 422);
  return { ...request, prompt, ...(aspectRatio ? { ratio: aspectRatio } : {}) };
}

function videoImageReferenceLimit(mode: unknown) {
  if (!Array.isArray(mode)) return 0;
  const imageReferenceLimits = mode.flatMap(item => Array.isArray(item) ? item : []).flatMap(item => {
    if (typeof item !== "string") return [];
    const match = /^imageReference:([1-9]\d{0,2})$/.exec(item);
    return match ? [Number(match[1])] : [];
  });
  return Math.max(mode.includes("singleImage") ? 1 : 0, ...imageReferenceLimits);
}

async function addProductionShotVideoReferences(input: {
  request: MediaGenerationRequest;
  shot: Pick<(typeof productionShots.$inferSelect), "characterAssetIds" | "propAssetIds">;
  episodeId: string;
  assets: ProductionVideoReferenceAsset[];
}) {
  const { request, shot, episodeId, assets } = input;
  const characterAssetIds = shot.characterAssetIds ?? [];
  const propAssetIds = shot.propAssetIds ?? [];
  const assetById = new Map(assets.map(asset => [asset.id, asset]));
  const linkedAssets = [
    ...characterAssetIds.map(id => ({ id, assetType: "character" as const })),
    ...propAssetIds.map(id => ({ id, assetType: "prop" as const })),
  ].map(reference => {
    const asset = assetById.get(reference.id);
    if (!asset || asset.assetType !== reference.assetType || (asset.episodeIds?.length && !asset.episodeIds.includes(episodeId))) invalid("镜头关联主体资产无效，请重新保存分镜", 409);
    return asset;
  });
  const assetByReferencePath = new Map(assets.filter(asset => asset.referencePath).map(asset => [asset.referencePath!, asset]));
  const requiredAssets = new Map<string, ProductionVideoReferenceAsset>();
  for (const asset of linkedAssets) requiredAssets.set(asset.id, asset);
  for (const image of request.images ?? []) {
    const asset = assetByReferencePath.get(image.path);
    if (asset) requiredAssets.set(asset.id, asset);
  }
  const missingAssets = [...requiredAssets.values()].filter(asset => asset.referenceStatus !== "succeeded" || !asset.referencePath || !asset.referenceMimeType?.startsWith("image/"));
  if (missingAssets.length) invalid(`请先为以下主体资产生成成功的参考图：${missingAssets.map(asset => asset.name).join("、")}`, 409);

  const imagesByPath = new Map<string, NonNullable<MediaGenerationRequest["images"]>[number]>();
  for (const image of request.images ?? []) {
    if (!image.mimeType.startsWith("image/")) invalid("视频参考素材必须是图片", 422);
    const asset = assetByReferencePath.get(image.path);
    imagesByPath.set(image.path, asset?.referenceStatus === "succeeded" && asset.referenceMimeType?.startsWith("image/") ? { path: asset.referencePath!, mimeType: asset.referenceMimeType } : image);
  }
  for (const asset of linkedAssets) imagesByPath.set(asset.referencePath!, { path: asset.referencePath!, mimeType: asset.referenceMimeType! });
  const images = [...imagesByPath.values()];
  if (images.length) {
    if (request.firstFrame || request.lastFrame) invalid("主体资产图片参考不能与首尾帧同时使用，请选择一种输入方式", 422);
    const models = await u.mediaGeneration.listMediaModels();
    const model = models.find(item => item.type === "video" && item.providerId === request.providerId && item.modelId === request.modelId);
    if (!model) invalid("所选视频模型不存在或未启用", 400);
    const imageReferenceLimit = videoImageReferenceLimit(model.mode);
    if (!imageReferenceLimit) invalid("所选视频模型不支持图片参考，请切换支持图片参考的模型", 422);
    if (images.length > imageReferenceLimit) invalid(`所选视频模型最多支持 ${imageReferenceLimit} 张图片参考，当前有 ${images.length} 张`, 422);
    const modes = Array.isArray(model.mode) ? model.mode : [];
    const referenceMode = modes.find((mode): mode is (`${"image" | "video" | "audio"}Reference:${number}`)[] => Array.isArray(mode)
      && mode.every(item => typeof item === "string" && /^(image|video|audio)Reference:[1-9]\d{0,2}$/.test(item))
      && videoImageReferenceLimit([mode]) >= images.length);
    const mode: MediaGenerationRequest["mode"] = referenceMode ?? (images.length === 1 && modes.includes("singleImage") ? "singleImage" : undefined);
    if (!mode) invalid("所选视频模型没有兼容的图片引用模式，请切换模型", 422);
    return { ...request, images, mode };
  }
  return { ...request, ...(images.length ? { images } : {}) };
}

async function assertProjectBudget(tx: ProductionTransaction, projectId: string, budgetCents: string, quoteCents: string) {
  const budget = costMicro(budgetCents);
  if (budget === 0n) return;
  const rows = await tx.select({ status: generationJobs.status, quotedCredits: generationJobs.quotedCredits, capturedCredits: generationJobs.capturedCredits }).from(generationJobs).where(eq(generationJobs.projectId, projectId));
  const committed = rows.reduce((total, row) => total + (row.status === "reserved" || row.status === "running" ? costMicro(row.quotedCredits) : row.status === "succeeded" ? costMicro(row.capturedCredits) : 0n), 0n);
  if (committed + costMicro(quoteCents) > budget) invalid("项目预算不足，已阻止本次生成", 402);
}

export async function generateProductionShot(input: { projectId: string; shotId: string; cwd: string; mediaType: "image" | "video" | "audio"; request: MediaGenerationRequest; idempotencyKey: string }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "generate");
  await recoverProductionProjectAssetReferences(project);
  const database = getDatabase();
  const [mediaContext] = await database.select({ scene: productionScenes, episode: productionEpisodes, characterAssetIds: productionShots.characterAssetIds, propAssetIds: productionShots.propAssetIds }).from(productionShots).innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId)).innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId)).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionShots.id, input.shotId), eq(productionSeasons.projectId, input.projectId))).limit(1);
  if (!mediaContext) invalid("镜头不属于当前项目", 404);
  const assets = await database.select({ id: productionProjectAssets.id, assetType: productionProjectAssets.assetType, name: productionProjectAssets.name, description: productionProjectAssets.description, visualDescription: productionProjectAssets.visualDescription, episodeIds: productionProjectAssets.episodeIds, referencePath: productionProjectAssets.referencePath, referenceMimeType: productionProjectAssets.referenceMimeType, referenceStatus: productionProjectAssets.referenceStatus }).from(productionProjectAssets).where(eq(productionProjectAssets.projectId, input.projectId));
  const mediaRequest = buildProductionMediaRequest({ request: input.request, creativeSettings: project.creativeSettings, scene: mediaContext.scene, episodeId: mediaContext.episode.id, assets });
  const request = input.mediaType === "video" ? await addProductionShotVideoReferences({ request: mediaRequest, shot: mediaContext, episodeId: mediaContext.episode.id, assets }) : mediaRequest;
  const units = input.mediaType === "video" ? Math.max(1, request.duration ?? 1) : input.mediaType === "audio" ? Math.max(1, request.prompt.length / 1000) : 1;
  const quote = await quoteCredits(request.providerId, request.modelId, input.mediaType, units, undefined, input.mediaType === "image" ? request.size : input.mediaType === "video" ? request.resolution : undefined, undefined, input.mediaType === "video" ? getVideoBillingKind(request) : undefined);
  const jobIdRef: { id?: string } = {};
  const now = new Date();
  const { project: lockedProject, row, attemptNumber } = await getDatabase().transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    if (["draft", "scripted"].includes(project.status)) invalid("请先确认分镜脚本后再提交生成", 409);
    if (project.status === "approved" || project.status === "delivered") invalid("项目已批准或交付，不能继续生成", 409);
    await assertProjectStageReady(tx, input.projectId, "generating");
    const [row] = await tx.select({ shot: productionShots, scene: productionScenes, episode: productionEpisodes, season: productionSeasons }).from(productionShots).innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId)).innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId)).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionShots.id, input.shotId), eq(productionSeasons.projectId, input.projectId))).limit(1).for("update");
    if (!row) invalid("镜头不属于当前项目", 404);
    if (row.shot.status === "approved") invalid("已批准镜头不能重拍", 409);
    if (row.shot.status === "generating") invalid("镜头正在生成，请勿重复提交", 409);
    if (!["draft", "ready", "changesRequested"].includes(row.shot.status)) invalid("当前镜头已有待审候选，请先处理审片结果", 409);
    await assertProjectBudget(tx, input.projectId, project.budgetCents, quote.credits);
    const previous = await tx.select({ attemptNumber: productionClipVariants.attemptNumber }).from(productionClipVariants).where(eq(productionClipVariants.shotId, input.shotId)).orderBy(desc(productionClipVariants.attemptNumber)).limit(1);
    const attemptNumber = (previous[0]?.attemptNumber ?? 0) + 1;
    await tx.update(productionShots).set({ status: "generating", updatedAt: now }).where(eq(productionShots.id, input.shotId));
    if (project.status === "storyboarded") await tx.update(productionProjects).set({ status: "generating", updatedAt: now }).where(eq(productionProjects.id, input.projectId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionShot.generationStarted", metadata: { projectId: input.projectId, shotId: input.shotId, attemptNumber, previousProjectStatus: project.status }, createdAt: now, updatedAt: now });
    return { project, row, attemptNumber };
  });
  try {
    const files = await generateMedia(input.cwd, input.mediaType, request, undefined, { userId: account.userId, idempotencyKey: input.idempotencyKey, projectId: input.projectId, seasonId: row.season.id, episodeId: row.episode.id, sceneId: row.scene.id, shotId: input.shotId, attemptNumber, estimatedCostCents: quote.credits, jobIdRef });
    if (!jobIdRef.id || !files.length) invalid("生成任务没有返回可审片文件", 502);
    const file = files[0] as GeneratedMedia;
    const [job] = await getDatabase().select({ status: generationJobs.status }).from(generationJobs).where(eq(generationJobs.id, jobIdRef.id)).limit(1);
    if (job?.status !== "succeeded") invalid("生成任务未成功结算", 409);
    const variant = { id: randomUUID(), projectId: input.projectId, shotId: input.shotId, generationJobId: jobIdRef.id, attemptNumber, mediaType: input.mediaType, filePath: file.path, mimeType: file.mimeType, status: "candidate" as const, promptSnapshot: { request, revision: row.shot.revision }, createdBy: account.userId, createdAt: now, updatedAt: new Date() };
    await getDatabase().transaction(async tx => {
      await tx.insert(productionClipVariants).values(variant);
      await tx.update(productionShots).set({ status: "review", updatedAt: new Date() }).where(eq(productionShots.id, input.shotId));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: lockedProject.workspaceId, action: "productionShot.generate", metadata: { projectId: input.projectId, shotId: input.shotId, generationJobId: jobIdRef.id, attemptNumber, filePath: file.path, quotedCredits: quote.credits }, createdAt: new Date(), updatedAt: new Date() });
    });
    return { variant, files };
  } catch (error) {
    await getDatabase().update(productionShots).set({ status: row.shot.status, updatedAt: new Date() }).where(and(eq(productionShots.id, input.shotId), eq(productionShots.status, "generating")));
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
  const comment = input.comment?.trim() || null;
  const review = comment ? { id: randomUUID(), projectId: input.projectId, shotId: shot.id, variantId: variant.id, authorUserId: account.userId, body: comment, timecodeMs: null, mentions: [], status: "open" as const, createdAt: now, updatedAt: now } : null;
  const approval = { id: randomUUID(), projectId: input.projectId, shotId: shot.id, variantId: variant.id, actorUserId: account.userId, decision: input.decision, comment, createdAt: now, updatedAt: now };
  await getDatabase().transaction(async tx => {
    if (review) {
      await tx.insert(productionReviews).values(review);
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionReview.create", metadata: { projectId: input.projectId, shotId: shot.id, variantId: variant.id, reviewId: review.id }, createdAt: now, updatedAt: now });
    }
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

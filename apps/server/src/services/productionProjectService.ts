import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { GeneratedMedia, MediaGenerationRequest } from "@omnistudio-next/tools-scaffold/runtime";
import { getDatabase } from "@/db/database";
import { auditEvents, generationJobs, productionApprovals, productionClipVariants, productionDeliveries, productionEpisodes, productionProjectAssets, productionProjectMembers, productionProjects, productionReviews, productionScenes, productionScriptDrafts, productionScriptRecords, productionSeasons, productionShots, teamMembers, teams, users } from "@/db/schema";
import { requireAccount } from "@/utils/accountContext";
import { roleAllows, type ProductionProjectAction, type ProductionProjectRole } from "@/utils/productionProject/permissions";
import { generateMedia, getVideoBillingKind } from "@/utils/media/generation";
import { quoteCredits } from "@/services/billingService";
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
  const deliveries = await database.select().from(productionDeliveries).where(eq(productionDeliveries.projectId, projectId)).orderBy(desc(productionDeliveries.createdAt));
  const assets = await database.select().from(productionProjectAssets).where(eq(productionProjectAssets.projectId, projectId)).orderBy(asc(productionProjectAssets.createdAt));
  const referenceJobIds = assets.map(asset => asset.referenceGenerationJobId).filter((id): id is string => Boolean(id));
  const referenceJobs = referenceJobIds.length ? await database.select({ id: generationJobs.id, status: generationJobs.status }).from(generationJobs).where(inArray(generationJobs.id, referenceJobIds)) : [];
  const referenceJobStatus = new Map(referenceJobs.map(job => [job.id, job.status]));
  return {
    project,
    members,
    seasons,
    episodes,
    scenes,
    shots,
    variants,
    reviews,
    approvals,
    deliveries,
    assets: assets.map(asset => {
      const jobStatus = asset.referenceGenerationJobId ? referenceJobStatus.get(asset.referenceGenerationJobId) : undefined;
      const referenceStatus = asset.referenceStatus === "generating" && jobStatus === "succeeded" ? "succeeded" : asset.referenceStatus === "generating" && jobStatus === "failed" ? "failed" : asset.referenceStatus;
      return { ...asset, referenceStatus, description: asset.description ?? "", visualDescription: asset.visualDescription ?? "", episodeIds: asset.episodeIds ?? [] };
    }),
  };
}

export async function getProductionScriptDraft(projectId: string) {
  await requireProjectAccess(projectId, "read");
  const [draft] = await getDatabase().select().from(productionScriptDrafts).where(eq(productionScriptDrafts.projectId, projectId)).limit(1);
  return draft ? { draft: draft.draftData, generationData: draft.generationData, revision: draft.revision, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy } : { draft: null, generationData: null, revision: 0, updatedAt: null, updatedBy: null };
}

export async function getProductionScriptHistory(projectId: string) {
  await requireProjectAccess(projectId, "read");
  return getDatabase().select().from(productionScriptRecords).where(eq(productionScriptRecords.projectId, projectId)).orderBy(asc(productionScriptRecords.revision));
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
    updatedAsset = { ...current, assetType: input.assetType, name: input.name.trim(), description: input.description.trim(), visualDescription: input.visualDescription.trim(), episodeIds: input.episodeIds, updatedAt: now };
    await tx.update(productionProjectAssets).set({ assetType: updatedAsset.assetType, name: updatedAsset.name, description: updatedAsset.description, visualDescription: updatedAsset.visualDescription, episodeIds: updatedAsset.episodeIds, updatedAt: now }).where(eq(productionProjectAssets.id, input.assetId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionProjectAsset.update", metadata: { projectId: input.projectId, assetId: input.assetId, before: { assetType: current.assetType, name: current.name, description: current.description, visualDescription: current.visualDescription, episodeIds: current.episodeIds }, after: { assetType: updatedAsset.assetType, name: updatedAsset.name, description: updatedAsset.description, visualDescription: updatedAsset.visualDescription, episodeIds: updatedAsset.episodeIds } }, createdAt: now, updatedAt: now });
  });
  return updatedAsset;
}

export async function generateProductionProjectAsset(input: { projectId: string; assetId: string; cwd: string; request: MediaGenerationRequest; idempotencyKey: string }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "generate");
  const database = getDatabase();
  const [currentRow] = await database.select().from(productionProjectAssets).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.projectId, input.projectId))).limit(1);
  const current = currentRow ? { ...currentRow } : undefined;
  if (!current) invalid("主体资产不属于当前项目", 404);
  if (current.referenceStatus === "generating" && current.referenceGenerationJobId) {
    const [referenceJob] = await database.select({ status: generationJobs.status }).from(generationJobs).where(eq(generationJobs.id, current.referenceGenerationJobId)).limit(1);
    if (referenceJob?.status === "succeeded" || referenceJob?.status === "failed") {
      const nextStatus = referenceJob.status === "succeeded" ? "succeeded" : "failed";
      await database.update(productionProjectAssets).set({ referenceStatus: nextStatus, updatedAt: new Date() }).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.referenceStatus, "generating")));
      current.referenceStatus = nextStatus;
    }
  }
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
  let lockedProject: typeof project;
  await database.transaction(async tx => {
    const [locked] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!locked) invalid("生产项目不存在", 404);
    assertPreProductionEditable(locked.status);
    const [asset] = await tx.select().from(productionProjectAssets).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.projectId, input.projectId))).limit(1).for("update");
    if (!asset) invalid("主体资产不属于当前项目", 404);
    if (asset.referenceStatus === "generating") invalid("该主体资产正在生成参考图，请稍候", 409);
    await assertProjectBudget(tx, input.projectId, locked.budgetCents, quote.credits);
    attemptNumber = asset.referenceRevision + 1;
    await tx.update(productionProjectAssets).set({ referenceStatus: "generating", referenceRevision: attemptNumber, referencePrompt: prompt, updatedAt: now }).where(eq(productionProjectAssets.id, input.assetId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: locked.workspaceId, action: "productionAsset.referenceImageGenerationStarted", metadata: { projectId: input.projectId, assetId: input.assetId, attemptNumber, quotedCredits: quote.credits }, createdAt: now, updatedAt: now });
    lockedProject = locked;
  });
  try {
    const files = await generateMedia(input.cwd, "image", request, undefined, { userId: account.userId, idempotencyKey: input.idempotencyKey, projectId: input.projectId, estimatedCostCents: quote.credits, jobIdRef });
    if (!jobIdRef.id || !files.length) invalid("生成任务没有返回可用的参考图", 502);
    const file = files[0] as GeneratedMedia;
    const [job] = await database.select({ status: generationJobs.status }).from(generationJobs).where(eq(generationJobs.id, jobIdRef.id)).limit(1);
    if (job?.status !== "succeeded") invalid("生成任务未成功结算", 409);
    const updated = await database.transaction(async tx => {
      const [asset] = await tx.select().from(productionProjectAssets).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.projectId, input.projectId))).limit(1).for("update");
      if (!asset) invalid("主体资产不属于当前项目", 404);
      const next = { referencePath: file.path, referenceMimeType: file.mimeType, referenceGenerationJobId: jobIdRef.id ?? null, referenceStatus: "succeeded" as const, updatedAt: new Date() };
      await tx.update(productionProjectAssets).set(next).where(eq(productionProjectAssets.id, input.assetId));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: lockedProject.workspaceId, action: "productionAsset.referenceImageGenerated", metadata: { projectId: input.projectId, assetId: input.assetId, generationJobId: jobIdRef.id, attemptNumber, filePath: file.path, quotedCredits: quote.credits }, createdAt: new Date(), updatedAt: new Date() });
      return { ...asset, ...next };
    });
    return { asset: updated, file, quotedCredits: quote.credits, generationJobId: jobIdRef.id };
  } catch (error) {
    await database.update(productionProjectAssets).set({ referenceStatus: current.referencePath ? "succeeded" : "failed", updatedAt: new Date() }).where(and(eq(productionProjectAssets.id, input.assetId), eq(productionProjectAssets.referenceStatus, "generating")));
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

export async function createProductionShot(input: { projectId: string; episodeId: string; sceneNumber: number; sceneTitle: string; continuityNotes?: string; shotNumber: number; durationMs?: number; shotType?: string; camera?: string; lighting?: string; dialogue?: string; narration?: string; prompt?: string }) {
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

export type ProductionScriptStructureInput = {
  projectId: string;
  logline: string;
  sourceGeneration: Record<string, unknown>;
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
      shots: { shotNumber: number; durationMs: number; shotType: string; camera: string; lighting: string; prompt: string; dialogue: string; narration: string }[];
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
    const existing = await tx.select({ id: productionEpisodes.id }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(eq(productionSeasons.projectId, input.projectId)).limit(1);
    if (existing.length) invalid("项目已存在剧集，请刷新后继续编辑", 409);

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
          const shot = { id: randomUUID(), sceneId: scene.id, shotNumber: shotData.shotNumber, durationMs: shotData.durationMs, shotType: shotData.shotType.trim(), camera: shotData.camera.trim() || null, lighting: shotData.lighting.trim() || null, dialogue: shotData.dialogue.trim() || null, narration: shotData.narration.trim() || null, prompt: shotData.prompt.trim(), status: "draft" as const, revision: 1, createdAt: now, updatedAt: now };
          await tx.insert(productionShots).values(shot);
          created.shots += 1;
        }
      }
    }
    for (const assetData of input.assets) {
      const asset = { id: randomUUID(), projectId: input.projectId, assetType: assetData.assetType, name: assetData.name.trim(), description: assetData.description.trim(), visualDescription: assetData.visualDescription.trim(), episodeIds: [], createdBy: account.userId, createdAt: now, updatedAt: now };
      await tx.insert(productionProjectAssets).values(asset);
      created.assets += 1;
    }
    await tx.update(productionProjects).set({ status: "scripted", creativeSettings: input.generation, updatedAt: now }).where(eq(productionProjects.id, input.projectId));
    await tx.insert(productionScriptRecords).values({
      id: randomUUID(),
      projectId: input.projectId,
      revision: 1,
      generationData: input.sourceGeneration,
      confirmedSnapshot: { logline: input.logline, generation: input.generation, assets: input.assets, episodes: input.episodes },
      createdBy: account.userId,
      createdAt: now,
      updatedAt: now,
    });
    await tx.delete(productionScriptDrafts).where(eq(productionScriptDrafts.projectId, input.projectId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionProject.scriptCreated", metadata: { projectId: input.projectId, logline: input.logline, generation: input.generation, created }, createdAt: now, updatedAt: now });
  });
  return created;
}

export async function updateProductionShot(input: { projectId: string; shotId: string; durationMs?: number; shotType?: string | null; camera?: string | null; lighting?: string | null; dialogue?: string | null; narration?: string | null; prompt?: string | null; status?: "draft" | "ready" }) {
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
    const patch = { ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}), ...(input.shotType !== undefined ? { shotType: input.shotType?.trim() || null } : {}), ...(input.camera !== undefined ? { camera: input.camera?.trim() || null } : {}), ...(input.lighting !== undefined ? { lighting: input.lighting?.trim() || null } : {}), ...(input.dialogue !== undefined ? { dialogue: input.dialogue?.trim() || null } : {}), ...(input.narration !== undefined ? { narration: input.narration?.trim() || null } : {}), ...(input.prompt !== undefined ? { prompt: input.prompt?.trim() || null } : {}), ...(input.status ? { status: input.status } : {}), revision: row.shot.revision + 1, updatedAt: now };
    if (Object.keys(patch).length === 2) invalid("没有可保存的镜头字段", 422);
    await tx.update(productionShots).set(patch).where(eq(productionShots.id, input.shotId));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionShot.update", metadata: { projectId: input.projectId, shotId: input.shotId, revision: patch.revision }, createdAt: now, updatedAt: now });
    return { ...row.shot, ...patch };
  });
}

function costMicro(value: string) {
  return u.billingCredits.parseCredits(value);
}

type ProductionCreativeSettings = NonNullable<(typeof productionProjects.$inferSelect)["creativeSettings"]>;
type ProductionPromptAsset = Pick<(typeof productionProjectAssets.$inferSelect), "assetType" | "name" | "description" | "visualDescription" | "episodeIds">;

function buildProductionMediaRequest(input: {
  request: MediaGenerationRequest;
  creativeSettings: ProductionCreativeSettings | null;
  scene: Pick<(typeof productionScenes.$inferSelect), "title" | "continuityNotes">;
  episodeId: string;
  assets: ProductionPromptAsset[];
}): MediaGenerationRequest {
  const { request, creativeSettings, scene, episodeId, assets } = input;
  const episodeAssets = assets.filter(asset => !asset.episodeIds?.length || asset.episodeIds.includes(episodeId));
  const prompt = [
    creativeSettings?.genre ? `题材方向：${creativeSettings.genre}${creativeSettings.fusionGenres.length ? `；融合题材：${creativeSettings.fusionGenres.join("、")}` : ""}` : "",
    creativeSettings?.style ? `统一视觉风格：${creativeSettings.style}` : "",
    creativeSettings?.stylePrompt ? `风格提示：${creativeSettings.stylePrompt}` : "",
    creativeSettings?.styleNegativePrompt ? `风格排除：${creativeSettings.styleNegativePrompt}` : "",
    creativeSettings?.aspectRatio ? `画幅比例：${creativeSettings.aspectRatio}` : "",
    `场景连续性：${scene.title}${scene.continuityNotes ? `；${scene.continuityNotes}` : ""}`,
    ...episodeAssets.map(asset => `主体资产（${asset.assetType === "character" ? "角色" : asset.assetType === "scene" ? "场景" : "道具"}：${asset.name}）：${[asset.description, asset.visualDescription].filter(Boolean).join("；")}`),
    `本镜头画面与动作：${request.prompt}`,
  ].filter(Boolean).join("\n\n");
  if (prompt.length > 100000) invalid("题材、风格和主体资产提示词合计超过模型限制，请精简设定后重试", 422);
  return { ...request, prompt, ...(creativeSettings?.aspectRatio ? { ratio: creativeSettings.aspectRatio } : {}) };
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
  const database = getDatabase();
  const [mediaContext] = await database.select({ scene: productionScenes, episode: productionEpisodes }).from(productionShots).innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId)).innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId)).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionShots.id, input.shotId), eq(productionSeasons.projectId, input.projectId))).limit(1);
  if (!mediaContext) invalid("镜头不属于当前项目", 404);
  const assets = await database.select({ assetType: productionProjectAssets.assetType, name: productionProjectAssets.name, description: productionProjectAssets.description, visualDescription: productionProjectAssets.visualDescription, episodeIds: productionProjectAssets.episodeIds }).from(productionProjectAssets).where(eq(productionProjectAssets.projectId, input.projectId));
  const request = buildProductionMediaRequest({ request: input.request, creativeSettings: project.creativeSettings, scene: mediaContext.scene, episodeId: mediaContext.episode.id, assets });
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

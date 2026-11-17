import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/database";
import { auditEvents, productionEpisodes, productionProjectAssets, productionProjects, productionScenes, productionSeasons, productionShots, productionScriptRecords, productionStoryboardDrafts } from "@/db/schema";
import { createTeamRunner } from "@/agent/teams";
import { createAgentToolContext } from "@/agent/tools";
import { createAgentModel } from "@/agent/runtime/model";
import { loadTool, validateToolConfig } from "@/utils/plugins/tools";
import { lockWorkspaceFiles } from "@/utils/workspace/files";
import { requireAccount } from "@/utils/accountContext";
import { getProductionScriptDocument, requireProjectAccess, validateShotAssetReferences, assertPreProductionEditable } from "@/services/productionProjectService";
import { readTeam } from "@/utils/teams";
import { quoteCredits } from "@/services/billingService";

export const storyboardDraftSchema = z.strictObject({
  scenes: z.array(z.strictObject({
    title: z.string().trim().min(1).max(200),
    continuityNotes: z.string().max(5000),
    shots: z.array(z.strictObject({
      durationMs: z.number().int().min(1000).max(120000),
      shotType: z.string().trim().min(1).max(80),
      camera: z.string().max(500),
      lighting: z.string().max(500),
      characterAssetNames: z.array(z.string().trim().min(1).max(200)).max(24),
      propAssetNames: z.array(z.string().trim().min(1).max(200)).max(24),
      soundEffects: z.string().max(10000),
      dialogue: z.string().max(10000),
      narration: z.string().max(10000),
      prompt: z.string().trim().min(1).max(20000),
    })).min(1).max(40),
  })).min(1).max(30),
  reviewNotes: z.string().max(12000).optional(),
}).superRefine((draft, context) => {
  const shotCount = draft.scenes.reduce((total, scene) => total + scene.shots.length, 0);
  if (shotCount > 100) context.addIssue({ code: "custom", path: ["scenes"], message: "单集分镜草稿不能超过 100 个镜头" });
  for (const [sceneIndex, scene] of draft.scenes.entries()) {
    for (const [shotIndex, shot] of scene.shots.entries()) {
      if (new Set(shot.characterAssetNames).size !== shot.characterAssetNames.length) context.addIssue({ code: "custom", path: ["scenes", sceneIndex, "shots", shotIndex, "characterAssetNames"], message: "角色资产不能重复" });
      if (new Set(shot.propAssetNames).size !== shot.propAssetNames.length) context.addIssue({ code: "custom", path: ["scenes", sceneIndex, "shots", shotIndex, "propAssetNames"], message: "道具资产不能重复" });
    }
  }
});

export type StoryboardDraft = z.infer<typeof storyboardDraftSchema>;

export const storyboardShotContextSchema = z.strictObject({
  id: z.uuid().optional(),
  sceneId: z.union([z.uuid(), z.literal(""), z.null()]).optional(),
  sceneNumber: z.number().int().positive().optional(),
  sceneTitle: z.string().max(200).optional(),
  durationMs: z.number().int().min(0).max(900000),
  shotType: z.string().max(80).nullable(),
  camera: z.string().max(500).nullable(),
  lighting: z.string().max(500).nullable(),
  characterAssetIds: z.array(z.uuid()).max(24),
  propAssetIds: z.array(z.uuid()).max(24),
  soundEffects: z.string().max(10000).nullable(),
  dialogue: z.string().max(10000).nullable(),
  narration: z.string().max(10000).nullable(),
  prompt: z.string().max(20000).nullable(),
});

export const storyboardShotAnalysisInputSchema = z.strictObject({
  projectId: z.uuid(),
  episodeId: z.uuid(),
  providerId: z.string().min(1).max(100),
  modelId: z.string().min(1).max(200),
  shot: storyboardShotContextSchema,
  previousShot: storyboardShotContextSchema.omit({ id: true }).optional(),
  nextShot: storyboardShotContextSchema.omit({ id: true }).optional(),
});

const storyboardShotAnalysisResultSchema = z.strictObject({
  durationMs: z.number().int().min(1000).max(120000),
  shotType: z.string().trim().min(1).max(80),
  camera: z.string().max(500),
  lighting: z.string().max(500),
  characterAssetNames: z.array(z.string().trim().min(1).max(200)).max(24),
  propAssetNames: z.array(z.string().trim().min(1).max(200)).max(24),
  soundEffects: z.string().max(10000),
  dialogue: z.string().max(10000),
  narration: z.string().max(10000),
  prompt: z.string().trim().min(1).max(20000),
}).superRefine((shot, context) => {
  if (new Set(shot.characterAssetNames).size !== shot.characterAssetNames.length) context.addIssue({ code: "custom", path: ["characterAssetNames"], message: "角色资产不能重复" });
  if (new Set(shot.propAssetNames).size !== shot.propAssetNames.length) context.addIssue({ code: "custom", path: ["propAssetNames"], message: "道具资产不能重复" });
});

type StoryboardShotContext = z.infer<typeof storyboardShotContextSchema>;

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function normalizeAssetName(name: string) {
  return name.replace(/\s/gu, "");
}

function resolveAssetNames(assets: { id: string; assetType: string; name: string }[], assetType: "character" | "prop", names: string[]) {
  return names.map(name => {
    const normalizedName = normalizeAssetName(name);
    const matches = assets.filter(asset => asset.assetType === assetType && normalizeAssetName(asset.name) === normalizedName);
    if (!matches.length) invalid(`分镜引用的${assetType === "character" ? "角色" : "道具"}资产不存在：${name}`, 422);
    if (matches.length > 1) invalid(`分镜引用的资产名称重复，无法确定：${name}`, 422);
    return matches[0]!.id;
  });
}

async function latestScriptRevision(projectId: string) {
  const [record] = await getDatabase().select({ revision: productionScriptRecords.revision }).from(productionScriptRecords)
    .where(eq(productionScriptRecords.projectId, projectId)).orderBy(desc(productionScriptRecords.revision)).limit(1);
  return record?.revision ?? 0;
}

async function assertEpisodeIsEmpty(projectId: string, episodeId: string) {
  const existing = await getDatabase().select({ id: productionScenes.id }).from(productionScenes)
    .where(eq(productionScenes.episodeId, episodeId)).limit(1);
  if (existing.length) invalid("此剧集已存在场景或镜头，当前 Agent 切片只处理空剧集", 409);
  const [episode] = await getDatabase().select({ id: productionEpisodes.id }).from(productionEpisodes)
    .innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(and(eq(productionEpisodes.id, episodeId), eq(productionSeasons.projectId, projectId))).limit(1);
  if (!episode) invalid("剧集不属于当前项目", 404);
}

async function readOnlyWorkspaceTools(cwd: string) {
  const { plugin } = await loadTool("workspace");
  const config = validateToolConfig(plugin, { readOnly: true });
  const tools = await plugin.createTools(createAgentToolContext(cwd, config));
  const selected = tools.filter(tool => ["read", "ls"].includes(tool.name));
  if (selected.length !== 2) invalid("分镜团队当前缺少只读工作区工具", 503);
  return selected;
}

function parseAgentDraft(value: string) {
  try { return storyboardDraftSchema.parse(JSON.parse(value)); }
  catch (error) { throw Object.assign(new Error(`分镜团队没有返回有效 JSON：${error instanceof Error ? error.message : "结果格式无效"}`), { status: 502 }); }
}

async function loadStoryboardContext(projectId: string, episodeId: string) {
  const { project } = await requireProjectAccess(projectId, "create");
  assertPreProductionEditable(project.status);
  if (project.status !== "scripted") invalid("项目必须处于剧本阶段才能生成分镜草稿", 409);
  await assertEpisodeIsEmpty(projectId, episodeId);
  const script = await getProductionScriptDocument(projectId);
  if (!script.revision) invalid("请先保存确认的剧本版本", 409);
  const [episodeRow] = await getDatabase().select({ episode: productionEpisodes, seasonNumber: productionSeasons.seasonNumber })
    .from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(and(eq(productionEpisodes.id, episodeId), eq(productionSeasons.projectId, projectId))).limit(1);
  if (!episodeRow) invalid("剧集不属于当前项目", 404);
  const episodeScript = script.document.episodes.find(item => item.episodeNumber === episodeRow.episode.episodeNumber);
  if (!episodeScript?.body.trim()) invalid("当前剧本版本没有这集的正文，无法生成分镜", 409);
  const assets = await getDatabase().select({ id: productionProjectAssets.id, assetType: productionProjectAssets.assetType, name: productionProjectAssets.name, description: productionProjectAssets.description, visualDescription: productionProjectAssets.visualDescription, episodeIds: productionProjectAssets.episodeIds })
    .from(productionProjectAssets).where(eq(productionProjectAssets.projectId, projectId));
  const scopedAssets = assets.filter(asset => !asset.episodeIds?.length || asset.episodeIds.includes(episodeId));
  if (scopedAssets.length > 200) invalid("当前剧集关联资产超过 200 项，请先整理项目资产", 413);
  return { project, script, episode: episodeRow.episode, seasonNumber: episodeRow.seasonNumber, episodeScript, assets: scopedAssets };
}

export async function getProductionStoryboardStatuses(projectId: string) {
  await requireProjectAccess(projectId, "read");
  const database = getDatabase();
  const episodes = await database.select({
    id: productionEpisodes.id,
    episodeNumber: productionEpisodes.episodeNumber,
    title: productionEpisodes.title,
    seasonNumber: productionSeasons.seasonNumber,
  }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(eq(productionSeasons.projectId, projectId));
  const episodeIds = episodes.map(episode => episode.id);
  const scenes = episodeIds.length
    ? await database.select({ id: productionScenes.id, episodeId: productionScenes.episodeId }).from(productionScenes).where(inArray(productionScenes.episodeId, episodeIds))
    : [];
  const sceneIds = scenes.map(scene => scene.id);
  const shots = sceneIds.length
    ? await database.select({ sceneId: productionShots.sceneId }).from(productionShots).where(inArray(productionShots.sceneId, sceneIds))
    : [];
  const drafts = await database.select({ episodeId: productionStoryboardDrafts.episodeId, status: productionStoryboardDrafts.status, sourceScriptRevision: productionStoryboardDrafts.sourceScriptRevision })
    .from(productionStoryboardDrafts).where(eq(productionStoryboardDrafts.projectId, projectId));
  const scriptRevision = await latestScriptRevision(projectId);
  return episodes.sort((left, right) => left.seasonNumber - right.seasonNumber || left.episodeNumber - right.episodeNumber).map(episode => {
    const episodeScenes = scenes.filter(scene => scene.episodeId === episode.id);
    const draft = drafts.find(item => item.episodeId === episode.id);
    const status = episodeScenes.length
      ? "confirmed"
      : draft?.status === "pending" && draft.sourceScriptRevision === scriptRevision
        ? "draft"
        : draft?.status === "pending"
          ? "stale"
          : "pending";
    return {
      episodeId: episode.id,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      status,
      sceneCount: episodeScenes.length,
      shotCount: shots.filter(shot => episodeScenes.some(scene => scene.id === shot.sceneId)).length,
    };
  });
}

async function loadPendingStoryboardContexts(projectId: string) {
  const { project } = await requireProjectAccess(projectId, "create");
  assertPreProductionEditable(project.status);
  if (project.status !== "scripted") invalid("项目必须处于剧本阶段才能生成分镜草稿", 409);
  const statuses = await getProductionStoryboardStatuses(projectId);
  const pendingEpisodes = statuses.filter(episode => episode.status === "pending" || episode.status === "stale");
  if (!pendingEpisodes.length) invalid("当前没有待生成的剧集", 409);
  if (pendingEpisodes.length > 50) invalid("单次最多批量生成 50 集，请分批处理", 413);
  const contexts = [] as Awaited<ReturnType<typeof loadStoryboardContext>>[];
  for (const episode of pendingEpisodes) contexts.push(await loadStoryboardContext(projectId, episode.episodeId));
  return { statuses: pendingEpisodes, contexts };
}

function storyboardTextBudget(context: Awaited<ReturnType<typeof loadStoryboardContext>>) {
  const baseInput = Math.max(1, Buffer.byteLength(JSON.stringify({ script: context.episodeScript.body, assets: context.assets })) + 512);
  return { input: baseInput * 2 + 8192, output: 16384 };
}

export async function quoteProductionStoryboardDraft(input: { projectId: string; episodeId: string; providerId: string; modelId: string }) {
  const context = await loadStoryboardContext(input.projectId, input.episodeId);
  // ACT: 报价覆盖 writer 与 reviewer 两次固定上限调用；实际请求仍按最终 payload 逐次预留。
  const textBudget = storyboardTextBudget(context);
  const inputBudget = textBudget.input;
  const outputBudget = textBudget.output;
  const quote = await quoteCredits(input.providerId, input.modelId, "text", 1, undefined, undefined, { input: inputBudget, output: outputBudget, estimation: "剧本正文与资产上下文 UTF-8 字节折算 + 固定 Agent 输出上限" });
  return { ...quote, textBudget: { input: inputBudget, output: outputBudget } };
}

export async function quoteAllProductionStoryboardDrafts(input: { projectId: string; providerId: string; modelId: string }) {
  const { statuses, contexts } = await loadPendingStoryboardContexts(input.projectId);
  const textBudget = contexts.reduce((total, context) => {
    const budget = storyboardTextBudget(context);
    return { input: total.input + budget.input, output: total.output + budget.output };
  }, { input: 0, output: 0 });
  const quote = await quoteCredits(input.providerId, input.modelId, "text", 1, undefined, undefined, {
    ...textBudget,
    estimation: `待生成 ${contexts.length} 集；逐集 writer 与 reviewer 调用上限合计`,
  });
  return {
    ...quote,
    episodeIds: statuses.map(episode => episode.episodeId),
    episodes: statuses.map(({ episodeId, episodeNumber, title }) => ({ episodeId, episodeNumber, title })),
    sourceScriptRevision: contexts[0]!.script.revision,
    textBudget,
  };
}

export async function generateAllProductionStoryboardDrafts(input: {
  projectId: string;
  cwd: string;
  providerId: string;
  modelId: string;
  episodeIds: string[];
  sourceScriptRevision: number;
}) {
  if (!input.episodeIds.length || input.episodeIds.length > 50 || new Set(input.episodeIds).size !== input.episodeIds.length) invalid("批量生成剧集列表无效", 422);
  await requireProjectAccess(input.projectId, "create");
  const currentScriptRevision = await latestScriptRevision(input.projectId);
  if (currentScriptRevision !== input.sourceScriptRevision) invalid("剧本版本已更新，请重新报价后再生成", 409);
  const statuses = await getProductionStoryboardStatuses(input.projectId);
  const statusById = new Map(statuses.map(episode => [episode.episodeId, episode]));
  if (input.episodeIds.some(episodeId => !statusById.has(episodeId))) invalid("批量生成列表包含不属于当前项目的剧集", 404);
  const results = [] as { episodeId: string; status: "generated" | "skipped" | "failed"; message?: string }[];
  for (const episodeId of input.episodeIds) {
    const current = statusById.get(episodeId)!;
    if (current.status !== "pending" && current.status !== "stale") {
      results.push({ episodeId, status: "skipped", message: "该剧集已生成或已有待审草稿" });
      continue;
    }
    try {
      await generateProductionStoryboardDraft({
        projectId: input.projectId,
        episodeId,
        cwd: input.cwd,
        providerId: input.providerId,
        modelId: input.modelId,
        expectedScriptRevision: input.sourceScriptRevision,
      });
      results.push({ episodeId, status: "generated" });
    } catch (error) {
      results.push({ episodeId, status: "failed", message: error instanceof Error ? error.message : "分镜草稿生成失败" });
    }
  }
  return {
    results,
    generatedCount: results.filter(result => result.status === "generated").length,
    skippedCount: results.filter(result => result.status === "skipped").length,
    failedCount: results.filter(result => result.status === "failed").length,
  };
}

export async function getProductionStoryboardDraft(projectId: string, episodeId: string) {
  await requireProjectAccess(projectId, "read");
  const [episode] = await getDatabase().select({ id: productionEpisodes.id }).from(productionEpisodes)
    .innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(and(eq(productionEpisodes.id, episodeId), eq(productionSeasons.projectId, projectId))).limit(1);
  if (!episode) invalid("剧集不属于当前项目", 404);
  const [draft] = await getDatabase().select().from(productionStoryboardDrafts)
    .where(and(eq(productionStoryboardDrafts.projectId, projectId), eq(productionStoryboardDrafts.episodeId, episodeId))).limit(1);
  if (!draft) return { draft: null };
  return { draft: { ...draft, isStale: draft.sourceScriptRevision !== await latestScriptRevision(projectId) } };
}

export async function generateProductionStoryboardDraft(input: { projectId: string; episodeId: string; cwd: string; providerId: string; modelId: string; expectedScriptRevision?: number }) {
  const account = requireAccount();
  const release = lockWorkspaceFiles([`${input.cwd}/.agent/productionStoryboard-${input.projectId}-${input.episodeId}`]);
  try {
    const context = await loadStoryboardContext(input.projectId, input.episodeId);
    const currentScriptRevision = context.script.revision;
    if (input.expectedScriptRevision !== undefined && currentScriptRevision !== input.expectedScriptRevision) invalid("剧本版本已更新，批量生成已停止", 409);
    const existing = await getDatabase().select().from(productionStoryboardDrafts)
      .where(and(eq(productionStoryboardDrafts.projectId, input.projectId), eq(productionStoryboardDrafts.episodeId, input.episodeId))).limit(1);
    if (existing[0]?.status === "pending" && existing[0].sourceScriptRevision === currentScriptRevision) {
      invalid("此剧集已有待审分镜草稿，请先继续编辑或确认", 409);
    }
    const payload = {
      episode: { number: context.episode.episodeNumber, title: context.episode.title, targetDurationMs: context.episode.targetDurationMs },
      script: { revision: currentScriptRevision, body: context.episodeScript.body },
      assets: context.assets.map(asset => ({ type: asset.assetType, name: asset.name, description: asset.description ?? "", visualDescription: asset.visualDescription ?? "" })),
    };
    if (Buffer.byteLength(JSON.stringify(payload)) > 120_000) invalid("本集剧本和资产上下文超过分镜生成的 120 KB 限制", 413);
    const team = await readTeam("storyboardTeam");
    const skillContent = team.files.get("skills/storyboard/SKILL.md");
    if (!skillContent) invalid("storyboardTeam 缺少 storyboard Skill", 503);
    const skillVersion = "sha256:" + createHash("sha256").update(skillContent).digest("hex");
    const teamCwd = await mkdtemp(join(tmpdir(), "omnistudio-storyboard-"));
    try {
      await writeFile(join(teamCwd, "context.json"), JSON.stringify(payload), { mode: 0o600 });
      const { runtime } = await createAgentModel(input.providerId, input.modelId, "off", input.cwd, { projectId: input.projectId, enforceProjectBudget: true });
      const baseModel = runtime.getModel(input.providerId, input.modelId);
      if (!baseModel) invalid("所选文本模型无法创建 Agent 运行时", 503);
      const model = { ...baseModel, maxTokens: Math.min(baseModel.maxTokens ?? 8192, 8192) };
      const runner = await createTeamRunner({
        name: "storyboardTeam", cwd: teamCwd, tools: await readOnlyWorkspaceTools(teamCwd),
        modelRuntime: runtime, model, thinkingLevel: "off", allowResourceWrite: false,
      });
      const writerTask = [
        "为指定剧集生成可审阅的文字分镜。只能使用输入中提供的角色和道具资产名称；缺少信息时在 continuityNotes 标注待确认，不得编造已确认设定。",
        "只返回一个 JSON 对象，不要 Markdown、代码围栏或前后说明。对象严格符合：{\"scenes\":[{\"title\":string,\"continuityNotes\":string,\"shots\":[{\"durationMs\":number,\"shotType\":string,\"camera\":string,\"lighting\":string,\"characterAssetNames\":string[],\"propAssetNames\":string[],\"soundEffects\":string,\"dialogue\":string,\"narration\":string,\"prompt\":string}]}]}。镜头时长合计应接近目标时长，镜头提示词描述可见动作、构图和必要运动。",
        JSON.stringify(payload),
      ].join("\n\n");
      const writer = await runner.run(writerTask, undefined, undefined, false, "writer");
      if (writer.result.status !== "completed") invalid(`分镜编写 Agent 未完成：${writer.result.result}`, 502);
      const generated = parseAgentDraft(writer.result.result);
      const reviewTask = [
        "只审阅以下文字分镜和剧本，不调用媒体生成。给出最重要的剧情遗漏、镜头不可执行、时长或连续性问题；没有明确问题时说明通过。使用中文，最多 3000 字。",
        JSON.stringify({ episode: payload.episode, script: payload.script, assets: payload.assets, draft: generated }),
      ].join("\n\n");
      const reviewer = await runner.run(reviewTask, undefined, undefined, false, "reviewer");
      const reviewNotes = reviewer.result.status === "completed" ? reviewer.result.result.slice(0, 12000) : `审阅 Agent 未完成：${reviewer.result.result}`;
      const draft = storyboardDraftSchema.parse({ ...generated, reviewNotes });
      if (await latestScriptRevision(input.projectId) !== currentScriptRevision) invalid("生成期间剧本版本已更新，请重新生成", 409);
      await assertEpisodeIsEmpty(input.projectId, input.episodeId);
      const now = new Date();
      const revision = (existing[0]?.revision ?? 0) + 1;
      const row = {
        id: randomUUID(), projectId: input.projectId, episodeId: input.episodeId,
        sourceScriptRevision: currentScriptRevision, revision, status: "pending" as const,
        providerId: input.providerId, modelId: input.modelId, teamVersion: runner.manifest.version,
        skillVersion, draft, createdBy: existing[0]?.createdBy ?? account.userId, updatedBy: account.userId,
        confirmedAt: null, createdAt: now, updatedAt: now,
      };
      await getDatabase().insert(productionStoryboardDrafts).values(row).onDuplicateKeyUpdate({
        set: { ...row, id: existing[0]?.id ?? row.id, createdAt: existing[0]?.createdAt ?? now },
      });
      return { draft: { ...row, id: existing[0]?.id ?? row.id } };
    } finally {
      await rm(teamCwd, { recursive: true, force: true }).catch(() => {});
    }
  } finally { release(); }
}

function assetNamesForShot(assets: { id: string; assetType: string; name: string }[], assetType: "character" | "prop", ids: string[]) {
  return ids.map(id => {
    const asset = assets.find(item => item.id === id && item.assetType === assetType);
    if (!asset) invalid(`镜头引用的${assetType === "character" ? "角色" : "道具"}资产不属于当前剧集`, 422);
    return asset.name;
  });
}

function serializeShotContext(shot: StoryboardShotContext | undefined, assets: { id: string; assetType: string; name: string }[]) {
  if (!shot) return undefined;
  return {
    sceneNumber: shot.sceneNumber,
    sceneTitle: shot.sceneTitle,
    durationMs: shot.durationMs,
    shotType: shot.shotType ?? "",
    camera: shot.camera ?? "",
    lighting: shot.lighting ?? "",
    characterAssetNames: assetNamesForShot(assets, "character", shot.characterAssetIds),
    propAssetNames: assetNamesForShot(assets, "prop", shot.propAssetIds),
    soundEffects: shot.soundEffects ?? "",
    dialogue: shot.dialogue ?? "",
    narration: shot.narration ?? "",
    prompt: shot.prompt ?? "",
  };
}

async function loadStoryboardShotAnalysisContext(input: z.infer<typeof storyboardShotAnalysisInputSchema>) {
  const { project } = await requireProjectAccess(input.projectId, "edit");
  assertPreProductionEditable(project.status);
  const script = await getProductionScriptDocument(input.projectId);
  if (!script.revision) invalid("请先保存确认的剧本版本", 409);
  const [episodeRow] = await getDatabase().select({ episode: productionEpisodes, seasonNumber: productionSeasons.seasonNumber })
    .from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(and(eq(productionEpisodes.id, input.episodeId), eq(productionSeasons.projectId, input.projectId))).limit(1);
  if (!episodeRow) invalid("剧集不属于当前项目", 404);
  const episodeScript = script.document.episodes.find(item => item.episodeNumber === episodeRow.episode.episodeNumber);
  if (!episodeScript?.body.trim()) invalid("当前剧本版本没有这集的正文，无法分析镜头", 409);
  if (input.shot.id) {
    const [savedShot] = await getDatabase().select({ shot: productionShots, scene: productionScenes }).from(productionShots)
      .innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId))
      .where(and(eq(productionShots.id, input.shot.id), eq(productionScenes.episodeId, input.episodeId))).limit(1);
    if (!savedShot) invalid("目标镜头不属于当前剧集", 404);
    if (savedShot.shot.status !== "draft" && savedShot.shot.status !== "ready") invalid("已进入生成或审片流程的镜头不能进行 AI 填充", 409);
    if (input.shot.sceneId && input.shot.sceneId !== savedShot.scene.id) invalid("目标镜头与场景不匹配", 422);
  }
  const sceneId = input.shot.sceneId && input.shot.sceneId !== "" ? input.shot.sceneId : undefined;
  const [savedScene] = sceneId
    ? await getDatabase().select().from(productionScenes).where(and(eq(productionScenes.id, sceneId), eq(productionScenes.episodeId, input.episodeId))).limit(1)
    : [];
  if (sceneId && !savedScene) invalid("目标场景不属于当前剧集", 404);
  const assets = await getDatabase().select({ id: productionProjectAssets.id, assetType: productionProjectAssets.assetType, name: productionProjectAssets.name, description: productionProjectAssets.description, visualDescription: productionProjectAssets.visualDescription, episodeIds: productionProjectAssets.episodeIds })
    .from(productionProjectAssets).where(eq(productionProjectAssets.projectId, input.projectId));
  const scopedAssets = assets.filter(asset => !asset.episodeIds?.length || asset.episodeIds.includes(input.episodeId));
  if (scopedAssets.length > 200) invalid("当前剧集关联资产超过 200 项，请先整理项目资产", 413);
  const payload = {
    episode: { number: episodeRow.episode.episodeNumber, title: episodeRow.episode.title, targetDurationMs: episodeRow.episode.targetDurationMs },
    script: { revision: script.revision, body: episodeScript.body },
    scene: savedScene
      ? { number: savedScene.sceneNumber, title: savedScene.title, continuityNotes: savedScene.continuityNotes ?? "" }
      : { number: input.shot.sceneNumber ?? 1, title: input.shot.sceneTitle ?? "", continuityNotes: "" },
    assets: scopedAssets.map(asset => ({ type: asset.assetType, name: asset.name, description: asset.description ?? "", visualDescription: asset.visualDescription ?? "" })),
    targetShot: serializeShotContext(input.shot, scopedAssets),
    previousShot: serializeShotContext(input.previousShot, scopedAssets),
    nextShot: serializeShotContext(input.nextShot, scopedAssets),
  };
  if (Buffer.byteLength(JSON.stringify(payload)) > 120_000) invalid("当前剧本和镜头上下文超过单镜头分析的 120 KB 限制", 413);
  return { script, payload, assets: scopedAssets };
}

export async function quoteProductionStoryboardShot(input: z.infer<typeof storyboardShotAnalysisInputSchema>) {
  const context = await loadStoryboardShotAnalysisContext(input);
  const textBudget = {
    input: Math.max(1, Buffer.byteLength(JSON.stringify(context.payload)) + 2048),
    output: 4096,
  };
  const quote = await quoteCredits(input.providerId, input.modelId, "text", 1, undefined, undefined, {
    ...textBudget,
    estimation: "当前剧本、目标镜头与相邻镜头 UTF-8 字节折算 + shotAnalyzer 输出上限",
  });
  return { ...quote, sourceScriptRevision: context.script.revision, textBudget };
}

export async function analyzeProductionStoryboardShot(input: z.infer<typeof storyboardShotAnalysisInputSchema> & { cwd: string; expectedScriptRevision: number }) {
  const context = await loadStoryboardShotAnalysisContext(input);
  if (context.script.revision !== input.expectedScriptRevision) invalid("剧本版本已更新，请重新报价后再分析", 409);
  const team = await readTeam("storyboardTeam");
  const skillContent = team.files.get("skills/storyboard/SKILL.md");
  if (!skillContent || !team.manifest.members.shotAnalyzer) invalid("storyboardTeam 缺少 shotAnalyzer 或 storyboard Skill", 503);
  const skillVersion = "sha256:" + createHash("sha256").update(skillContent).digest("hex");
  const teamCwd = await mkdtemp(join(tmpdir(), "omnistudio-shot-analysis-"));
  try {
    await writeFile(join(teamCwd, "context.json"), JSON.stringify(context.payload), { mode: 0o600 });
    const { runtime } = await createAgentModel(input.providerId, input.modelId, "off", input.cwd, { projectId: input.projectId, enforceProjectBudget: true });
    const baseModel = runtime.getModel(input.providerId, input.modelId);
    if (!baseModel) invalid("所选文本模型无法创建 Agent 运行时", 503);
    const model = { ...baseModel, maxTokens: Math.min(baseModel.maxTokens ?? 4096, 4096) };
    const runner = await createTeamRunner({
      name: "storyboardTeam", cwd: teamCwd, tools: await readOnlyWorkspaceTools(teamCwd),
      modelRuntime: runtime, model, thinkingLevel: "off", allowResourceWrite: false,
    });
    const result = await runner.run([
      "只分析并补全 targetShot，不修改相邻镜头。结合当前集剧本、场景和相邻镜头；保留 targetShot 已填写的值，缺少剧情依据的对白、旁白和资产保持为空。角色和道具名称只能来自 assets。只返回 JSON，不要 Markdown 或说明。",
      "JSON 字段：{\"durationMs\":number,\"shotType\":string,\"camera\":string,\"lighting\":string,\"characterAssetNames\":string[],\"propAssetNames\":string[],\"soundEffects\":string,\"dialogue\":string,\"narration\":string,\"prompt\":string}",
      JSON.stringify(context.payload),
    ].join("\n\n"), undefined, undefined, false, "shotAnalyzer");
    if (result.result.status !== "completed") invalid(`单镜头分析 Agent 未完成：${result.result.result}`, 502);
    let analyzed;
    try { analyzed = storyboardShotAnalysisResultSchema.parse(JSON.parse(result.result.result)); }
    catch (error) { throw Object.assign(new Error(`单镜头分析 Agent 没有返回有效 JSON：${error instanceof Error ? error.message : "结果格式无效"}`), { status: 502 }); }
    if (await latestScriptRevision(input.projectId) !== input.expectedScriptRevision) invalid("分析期间剧本版本已更新，请重新分析", 409);
    return {
      sourceScriptRevision: input.expectedScriptRevision,
      teamVersion: runner.manifest.version,
      skillVersion,
      shot: {
        durationMs: analyzed.durationMs,
        shotType: analyzed.shotType,
        camera: analyzed.camera,
        lighting: analyzed.lighting,
        characterAssetIds: resolveAssetNames(context.assets, "character", analyzed.characterAssetNames),
        propAssetIds: resolveAssetNames(context.assets, "prop", analyzed.propAssetNames),
        soundEffects: analyzed.soundEffects,
        dialogue: analyzed.dialogue,
        narration: analyzed.narration,
        prompt: analyzed.prompt,
      },
    };
  } finally {
    await rm(teamCwd, { recursive: true, force: true }).catch(() => {});
  }
}

export async function saveProductionStoryboardDraft(input: { projectId: string; episodeId: string; expectedDraftRevision: number; draft: StoryboardDraft }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "create");
  const draft = storyboardDraftSchema.parse(input.draft);
  const now = new Date();
  return getDatabase().transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    assertPreProductionEditable(project.status);
    const [row] = await tx.select().from(productionStoryboardDrafts).where(and(eq(productionStoryboardDrafts.projectId, input.projectId), eq(productionStoryboardDrafts.episodeId, input.episodeId))).limit(1).for("update");
    if (!row || row.status !== "pending") invalid("没有可编辑的待审分镜草稿", 404);
    const [script] = await tx.select({ revision: productionScriptRecords.revision }).from(productionScriptRecords).where(eq(productionScriptRecords.projectId, input.projectId)).orderBy(desc(productionScriptRecords.revision)).limit(1);
    if (row.sourceScriptRevision !== (script?.revision ?? 0)) invalid("剧本版本已更新，当前分镜草稿已过期", 409);
    if (row.revision !== input.expectedDraftRevision) invalid("分镜草稿已被其他会话更新，请重新加载", 409);
    await tx.update(productionStoryboardDrafts).set({ draft, revision: row.revision + 1, updatedBy: account.userId, updatedAt: now }).where(eq(productionStoryboardDrafts.id, row.id));
    return { draft: { ...row, draft, revision: row.revision + 1, updatedBy: account.userId, updatedAt: now } };
  });
}

export async function confirmProductionStoryboardDraft(input: { projectId: string; episodeId: string; expectedScriptRevision: number; expectedDraftRevision: number; draft: StoryboardDraft }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "create");
  const draft = storyboardDraftSchema.parse(input.draft);
  const now = new Date();
  return getDatabase().transaction(async tx => {
    const [project] = await tx.select().from(productionProjects).where(eq(productionProjects.id, input.projectId)).limit(1).for("update");
    if (!project) invalid("生产项目不存在", 404);
    assertPreProductionEditable(project.status);
    const [episode] = await tx.select({ episode: productionEpisodes, season: productionSeasons }).from(productionEpisodes)
      .innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
      .where(and(eq(productionEpisodes.id, input.episodeId), eq(productionSeasons.projectId, input.projectId))).limit(1).for("update");
    if (!episode) invalid("剧集不属于当前项目", 404);
    const [latestScript] = await tx.select({ revision: productionScriptRecords.revision }).from(productionScriptRecords)
      .where(eq(productionScriptRecords.projectId, input.projectId)).orderBy(desc(productionScriptRecords.revision)).limit(1).for("update");
    if (!latestScript || latestScript.revision !== input.expectedScriptRevision) invalid("剧本版本已更新，分镜草稿不能写入", 409);
    const [saved] = await tx.select().from(productionStoryboardDrafts)
      .where(and(eq(productionStoryboardDrafts.projectId, input.projectId), eq(productionStoryboardDrafts.episodeId, input.episodeId))).limit(1).for("update");
    if (!saved || saved.status !== "pending") invalid("没有可确认的待审分镜草稿", 409);
    if (saved.revision !== input.expectedDraftRevision || saved.sourceScriptRevision !== input.expectedScriptRevision) invalid("分镜草稿或剧本版本已更新，请重新加载", 409);
    const [existing] = await tx.select({ id: productionScenes.id }).from(productionScenes).where(eq(productionScenes.episodeId, input.episodeId)).limit(1);
    if (existing) invalid("此剧集已创建场景，不能再次写入分镜草稿", 409);
    const assets = await tx.select({ id: productionProjectAssets.id, assetType: productionProjectAssets.assetType, name: productionProjectAssets.name, episodeIds: productionProjectAssets.episodeIds }).from(productionProjectAssets)
      .where(eq(productionProjectAssets.projectId, input.projectId));
    const scenes = draft.scenes.map((scene, index) => ({
      id: randomUUID(), episodeId: input.episodeId, sceneNumber: index + 1, title: scene.title.trim(),
      continuityNotes: scene.continuityNotes.trim() || null, createdAt: now, updatedAt: now,
    }));
    const shots = draft.scenes.flatMap((scene, sceneIndex) => scene.shots.map((shot, shotIndex) => {
      const characterAssetIds = resolveAssetNames(assets, "character", shot.characterAssetNames);
      const propAssetIds = resolveAssetNames(assets, "prop", shot.propAssetNames);
      return {
        id: randomUUID(), sceneId: scenes[sceneIndex]!.id, shotNumber: shotIndex + 1,
        durationMs: shot.durationMs, shotType: shot.shotType.trim(), camera: shot.camera.trim() || null,
        lighting: shot.lighting.trim() || null, characterAssetIds, propAssetIds,
        soundEffects: shot.soundEffects.trim() || null, dialogue: shot.dialogue.trim() || null,
        narration: shot.narration.trim() || null, prompt: shot.prompt.trim(), status: "draft" as const,
        revision: 1, createdAt: now, updatedAt: now,
      };
    }));
    for (const shot of shots) await validateShotAssetReferences(tx, input.projectId, input.episodeId, shot.characterAssetIds, shot.propAssetIds);
    await tx.insert(productionScenes).values(scenes);
    await tx.insert(productionShots).values(shots);
    await tx.update(productionStoryboardDrafts).set({ status: "confirmed", draft, updatedBy: account.userId, confirmedAt: now, updatedAt: now })
      .where(eq(productionStoryboardDrafts.id, saved.id));
    await tx.insert(auditEvents).values({
      id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId,
      action: "productionStoryboardDraft.confirm",
      metadata: {
        projectId: input.projectId, episodeId: input.episodeId, draftId: saved.id,
        scriptRevision: input.expectedScriptRevision, draftRevision: input.expectedDraftRevision,
        teamVersion: saved.teamVersion, skillVersion: saved.skillVersion,
        providerId: saved.providerId, modelId: saved.modelId,
        sceneIds: scenes.map(scene => scene.id), shotIds: shots.map(shot => shot.id),
      },
      createdAt: now, updatedAt: now,
    });
    return { created: { scenes: scenes.length, shots: shots.length } };
  });
}

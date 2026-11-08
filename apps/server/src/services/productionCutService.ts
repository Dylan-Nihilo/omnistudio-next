import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readFile, realpath, unlink, writeFile, rmdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDatabase, hashSecret } from "@/db/database";
import { auditEvents, productionCuts, productionEpisodes, productionProjectMembers, productionProjects, productionSeasons } from "@/db/schema";
import { requireProjectAccess } from "@/services/productionProjectService";
import { authorizeProjectDirectory } from "@/services/accountService";
import { roleAllows, type ProductionProjectAction, type ProductionProjectRole } from "@/utils/productionProject/permissions";
import { requireAccount } from "@/utils/accountContext";
import { getDataDirectory } from "@/utils/conf";
import { lockWorkspaceFiles, maxUploadBytes, resolveWorkspacePath, workspaceFileRevision } from "@/utils/workspace/files";
import u from "@/utils";

type ProductionCut = typeof productionCuts.$inferSelect;
type SourceReference = { type: string; id: string; label?: string };
type ProductionTransaction = Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0];
type SourceSnapshot = NonNullable<ProductionCut["metadata"]["sourceSnapshots"]>[number];
const videoIntegrityCache = new Map<string, { size: number; mtimeMs: number; ctimeMs: number; hash: string }>();

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function cutResponse(cut: ProductionCut) {
  const params = new URLSearchParams({ projectId: cut.projectId, cutId: cut.id, accountId: requireAccount().userId });
  const url = `/api/productionProjects/cuts/read?${params}`;
  const sourceSnapshots = cut.metadata.sourceSnapshots;
  const metadata = sourceSnapshots ? cut.metadata : { ...cut.metadata, sourceReferences: [] };
  return {
    ...cut,
    metadata,
    manifestIntegrity: cut.metadata.manifestHash === undefined ? "legacy-unverified" : "sha256-recorded",
    sourceLineageVerified: Boolean(sourceSnapshots?.length && sourceSnapshots.every(snapshot => snapshot.verified)),
    videoUrl: `${url}&file=video`,
    projectUrl: `${url}&file=project`,
    manifestUrl: `${url}&file=manifest`,
  };
}

async function requireProjectAccessInTransaction(tx: ProductionTransaction, projectId: string, action: ProductionProjectAction) {
  const account = requireAccount();
  const [result] = await tx.select({ project: productionProjects, member: productionProjectMembers })
    .from(productionProjects)
    .innerJoin(productionProjectMembers, eq(productionProjectMembers.projectId, productionProjects.id))
    .where(and(eq(productionProjects.id, projectId), eq(productionProjectMembers.userId, account.userId), eq(productionProjectMembers.status, "active")))
    .limit(1)
    .for("update");
  if (!result || !roleAllows(result.member.role as ProductionProjectRole, action)) invalid("无权执行这个项目操作", 403);
  return result;
}

async function cutDirectory(projectId: string, cutId: string, create = false) {
  if (![projectId, cutId].every(value => /^[\da-f-]{36}$/i.test(value))) invalid("成片编号无效");
  const root = resolve(getDataDirectory(), "productionCuts");
  const projectDirectory = resolve(root, projectId);
  const directory = resolve(projectDirectory, cutId);
  for (const path of [root, projectDirectory, directory]) {
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (info?.isSymbolicLink()) invalid("成片归档目录不能使用符号链接", 403);
    if (!info && create) await mkdir(path, { recursive: true, mode: 0o700 });
    else if (!info) invalid("成片归档目录不存在", 409);
    const current = await lstat(path);
    if (!current.isDirectory() || await realpath(path) !== path) invalid("成片归档目录不能使用符号链接", 403);
  }
  return directory;
}

async function probeVideo(path: string, signal?: AbortSignal) {
  const { tools } = await u.ffmpeg.getStatus();
  if (!tools.ffprobe.path || tools.ffprobe.error) invalid("成片登记需要可用的 FFprobe，请先配置 FFmpeg", 424);
  const process = Bun.spawn([tools.ffprobe.path, "-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration,format_name:stream=width,height,avg_frame_rate,duration", "-of", "json", path], {
    stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true, timeout: 30000, signal,
  });
  const [stdout, stderr, code] = await Promise.all([process.stdout.text(), process.stderr.text(), process.exited]);
  signal?.throwIfAborted();
  if (code !== 0) invalid(`成片无法读取：${stderr.slice(0, 400)}`, 422);
  const data = JSON.parse(stdout) as { streams?: { width?: number; height?: number; avg_frame_rate?: string; duration?: string }[]; format?: { duration?: string; format_name?: string } };
  const video = data.streams?.[0];
  const duration = Number(data.format?.duration ?? video?.duration);
  if (!video || !Number.isSafeInteger(video.width) || !Number.isSafeInteger(video.height) || video.width! < 1 || video.height! < 1 || !Number.isFinite(duration) || duration <= 0 || duration > 86400) invalid("成片的视频流、尺寸或时长无效", 422);
  if (!data.format?.format_name?.split(",").includes("mp4")) invalid("当前成片归档仅接受 MP4 文件", 422);
  const frameRate = video.avg_frame_rate ?? "0/0";
  const [numerator, denominator = "1"] = frameRate.split("/").map(Number);
  const rate = Number(numerator) / Number(denominator);
  if (!Number.isFinite(rate) || rate <= 0 || frameRate.length > 32) invalid("成片帧率无效", 422);
  return { durationMs: Math.round(duration * 1000), width: video.width!, height: video.height!, frameRate };
}

async function fixedVideo(source: string, target: string, size: number, signal?: AbortSignal) {
  let received = 0;
  const hash = createHash("sha256");
  await pipeline(createReadStream(source), new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > size) return callback(new Error("归档期间源视频发生变化，请重新导出后提交"));
      hash.update(chunk);
      callback(null, chunk);
    },
  }), createWriteStream(target, { flags: "wx", mode: 0o600 }), { signal });
  if (received !== size) invalid("归档期间源视频发生变化，请重新导出后提交", 409);
  return hash.digest("hex");
}

async function verifyCut(cut: ProductionCut) {
  const directory = await cutDirectory(cut.projectId, cut.id);
  const video = await resolveWorkspacePath(directory, cut.videoPath);
  const project = await resolveWorkspacePath(directory, cut.projectPath);
  const manifest = await resolveWorkspacePath(directory, cut.manifestPath);
  const info = await lstat(video.path);
  if (!info.isFile() || info.size !== cut.fileSize) invalid("成片归档文件丢失或已发生变化，不能继续审片和交付", 409);
  const cached = videoIntegrityCache.get(video.path);
  const videoHash = cached?.size === info.size && cached.mtimeMs === info.mtimeMs && cached.ctimeMs === info.ctimeMs ? cached.hash : await workspaceFileRevision(video.path);
  if (videoHash !== cut.fileHash || await workspaceFileRevision(project.path) !== cut.metadata.sourceProjectRevision) invalid("成片归档文件丢失或已发生变化，不能继续审片和交付", 409);
  const manifestInfo = await lstat(manifest.path);
  if (!manifestInfo.isFile() || manifestInfo.size > 32 * 1024 ** 2) invalid("成片 manifest 丢失或格式无效", 409);
  const manifestContent = await readFile(manifest.path);
  if (cut.metadata.manifestHash !== undefined) {
    if (!/^[\da-f]{64}$/i.test(cut.metadata.manifestHash)) invalid("成片 manifest 摘要无效，不能继续审片和交付", 409);
    if (hashSecret(manifestContent.toString("utf8")) !== cut.metadata.manifestHash) invalid("成片 manifest 已发生变化，不能继续审片和交付", 409);
  } else {
    // ACT: 旧档案没有 manifest 摘要，只验证其固定身份字段；不把其来源或完整性标记为已核实。
    let legacy: { format?: unknown; cut?: { id?: unknown; projectId?: unknown; version?: unknown; fileHash?: unknown } };
    try { legacy = JSON.parse(manifestContent.toString("utf8")); }
    catch { invalid("旧成片 manifest 无法读取，请重新提交版本", 409); }
    if (legacy.format !== "omnistudio.production.cut.v1" || legacy.cut?.id !== cut.id || legacy.cut.projectId !== cut.projectId || legacy.cut.version !== cut.version || legacy.cut.fileHash !== cut.fileHash) invalid("旧成片 manifest 与归档记录不一致，请重新提交版本", 409);
  }
  videoIntegrityCache.set(video.path, { size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, hash: videoHash });
}

async function lockCutFiles(cut: ProductionCut) {
  const directory = await cutDirectory(cut.projectId, cut.id);
  const files = await Promise.all([cut.videoPath, cut.projectPath, cut.manifestPath].map(path => resolveWorkspacePath(directory, path)));
  return lockWorkspaceFiles(files.map(file => file.path));
}

async function sourceLineage(directory: string, project: { assets?: unknown; clips?: unknown }) {
  if (!Array.isArray(project.assets) || !Array.isArray(project.clips) || project.assets.length > 1000 || project.clips.length > 5000) invalid("剪辑工程素材或片段数量超过归档上限", 413);
  const usedAssetIds = new Set<string>();
  for (const clip of project.clips) {
    if (!clip || typeof clip !== "object" || Array.isArray(clip)) invalid("剪辑工程片段格式无效", 422);
    const item = clip as Record<string, unknown>;
    if (item.kind !== "text") {
      if (typeof item.assetId !== "string" || !item.assetId) invalid("剪辑工程片段缺少素材编号", 422);
      usedAssetIds.add(item.assetId);
    }
  }

  const assets = new Map<string, Record<string, unknown>>();
  for (const value of project.assets) {
    if (!value || typeof value !== "object" || Array.isArray(value)) invalid("剪辑工程素材格式无效", 422);
    const asset = value as Record<string, unknown>;
    if (typeof asset.id !== "string" || !/^[\da-f-]{36}$/i.test(asset.id) || assets.has(asset.id)) invalid("剪辑工程素材编号无效或重复", 422);
    assets.set(asset.id, asset);
  }

  const sourceReferences = new Map<string, SourceReference>();
  const sourceSnapshots: SourceSnapshot[] = [];
  const directoryHash = hashSecret(directory);
  const receipts = usedAssetIds.size ? await getDatabase().select({ id: auditEvents.id, actorUserId: auditEvents.actorUserId, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(and(inArray(auditEvents.id, [...usedAssetIds]), eq(auditEvents.action, "editorMedia.import"))) : [];
  const receiptById = new Map(receipts.map(receipt => [receipt.id, receipt]));
  for (const assetId of usedAssetIds) {
    const asset = assets.get(assetId);
    if (!asset || typeof asset.name !== "string" || asset.name.length > 500 || typeof asset.path !== "string" || asset.path.length > 4096 || typeof asset.size !== "number" || !Number.isSafeInteger(asset.size) || asset.size < 1) invalid("剪辑工程引用了无效素材", 422);
    if (!asset.path.startsWith("assets/videoEditor/media/")) invalid(`素材「${asset.name}」未保存在剪辑台固定素材目录`, 422);
    const media = await resolveWorkspacePath(directory, asset.path);
    const before = await lstat(media.path);
    if (!before.isFile() || before.size !== asset.size) invalid(`素材「${asset.name}」文件缺失或大小已变化`, 409);
    const assetHash = await workspaceFileRevision(media.path);
    const after = await lstat(media.path);
    if (!after.isFile() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) invalid(`素材「${asset.name}」在建立来源快照时发生变化`, 409);

    const candidateReceipt = receiptById.get(assetId);
    const candidateMetadata = candidateReceipt?.metadata && typeof candidateReceipt.metadata === "object" && !Array.isArray(candidateReceipt.metadata) ? candidateReceipt.metadata as Record<string, unknown> : {};
    const candidateSource = candidateMetadata.sourceSnapshot && typeof candidateMetadata.sourceSnapshot === "object" && !Array.isArray(candidateMetadata.sourceSnapshot) ? candidateMetadata.sourceSnapshot as Record<string, unknown> : {};
    const candidatePath = candidateSource.path;
    const receiptMatches = !!candidateReceipt?.actorUserId
      && candidateMetadata.format === "omnistudio.editor.media-import.v1"
      && candidateMetadata.directoryHash === directoryHash
      && candidateMetadata.assetPath === asset.path
      && candidateMetadata.assetHash === assetHash
      && (candidateSource.type === "workspace" || candidateSource.type === "production" || candidateSource.type === "library")
      && typeof candidatePath === "string" && !!candidatePath && candidatePath.length <= 4096
      && !/^[a-z][a-z\d+.-]*:/i.test(candidatePath) && !candidatePath.startsWith("/")
      && !/[\\:\u0000-\u001f]/.test(candidatePath) && !candidatePath.split("/").some(part => !part || part === "." || part === "..")
      && candidateSource.hash === assetHash
      && typeof candidateSource.importedAt === "string" && Number.isFinite(Date.parse(candidateSource.importedAt))
      && typeof candidateSource.sourceDirectoryHash === "string" && /^[\da-f]{64}$/i.test(candidateSource.sourceDirectoryHash);
    const receipt = receiptMatches ? candidateReceipt : undefined;
    let source: SourceSnapshot["source"];
    if (receipt) {
      const metadata = receipt.metadata && typeof receipt.metadata === "object" && !Array.isArray(receipt.metadata) ? receipt.metadata as Record<string, unknown> : {};
      const snapshot = metadata.sourceSnapshot && typeof metadata.sourceSnapshot === "object" && !Array.isArray(metadata.sourceSnapshot) ? metadata.sourceSnapshot as Record<string, unknown> : {};
      if (!(snapshot.type === "workspace" || snapshot.type === "production" || snapshot.type === "library") || typeof snapshot.path !== "string" || typeof snapshot.hash !== "string" || snapshot.hash !== assetHash || typeof snapshot.importedAt !== "string" || !Number.isFinite(Date.parse(snapshot.importedAt)) || typeof snapshot.sourceDirectoryHash !== "string" || !/^[\da-f]{64}$/i.test(snapshot.sourceDirectoryHash)) invalid(`素材「${asset.name}」的服务端来源快照无效`, 409);
      const sourcePath = snapshot.path;
      if (!sourcePath || sourcePath.length > 4096 || /^[a-z][a-z\d+.-]*:/i.test(sourcePath) || sourcePath.startsWith("/") || /[\\:\u0000-\u001f]/.test(sourcePath) || sourcePath.split("/").some(part => !part || part === "." || part === "..")) invalid(`素材「${asset.name}」的服务端来源路径无效`, 409);
      const optionalString = (key: string) => {
        const value = snapshot[key];
        if (value === undefined) return undefined;
        if (typeof value !== "string" || !value.trim() || value.length > 4096) invalid(`素材「${asset.name}」来源 ${key} 无效`, 409);
        return value;
      };
      const canvasPath = optionalString("canvasPath");
      const revision = optionalString("revision");
      const nodeId = optionalString("nodeId");
      const outputId = optionalString("outputId");
      const projectId = optionalString("projectId");
      const episodeId = optionalString("episodeId");
      const shotId = optionalString("shotId");
      const variantId = optionalString("variantId");
      const attemptNumber = snapshot.attemptNumber;
      const hasCanvasContext = canvasPath !== undefined || revision !== undefined || nodeId !== undefined || outputId !== undefined;
      if (hasCanvasContext && (snapshot.type !== "workspace" || !canvasPath || !revision || !/^[\da-f]{64}$/i.test(revision) || !nodeId || !outputId)) invalid(`素材「${asset.name}」的画布来源快照不完整`, 409);
      if (snapshot.type === "production" && (!projectId || !episodeId || !shotId || !variantId || typeof attemptNumber !== "number" || !Number.isSafeInteger(attemptNumber) || attemptNumber < 1)) invalid(`素材「${asset.name}」的项目候选快照不完整`, 409);
      source = {
        type: snapshot.type,
        path: sourcePath,
        hash: assetHash,
        sourceDirectoryHash: snapshot.sourceDirectoryHash.toLowerCase(),
        importedAt: snapshot.importedAt,
        ...(canvasPath ? { canvasPath } : {}),
        ...(revision ? { revision: revision.toLowerCase() } : {}),
        ...(nodeId ? { nodeId } : {}),
        ...(outputId ? { outputId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(episodeId ? { episodeId } : {}),
        ...(shotId ? { shotId } : {}),
        ...(variantId ? { variantId } : {}),
        ...(typeof attemptNumber === "number" ? { attemptNumber } : {}),
      };
      const referenceId = source.type === "production" ? source.variantId! : source.path;
      sourceReferences.set(`${source.type}:${referenceId}`, { type: source.type, id: referenceId, label: asset.name.slice(0, 500) });
    }
    sourceSnapshots.push({ assetId, assetName: asset.name.slice(0, 500), assetPath: asset.path, assetHash, verified: Boolean(receipt), ...(receipt?.actorUserId ? { importedBy: receipt.actorUserId } : {}), ...(source ? { importedAt: source.importedAt, source } : {}) });
  }
  return { sourceReferences: [...sourceReferences.values()], sourceSnapshots };
}

export async function listProductionCuts(projectId: string) {
  await requireProjectAccess(projectId, "read");
  const cuts = await getDatabase().select().from(productionCuts).where(eq(productionCuts.projectId, projectId)).orderBy(desc(productionCuts.createdAt));
  return { cuts: cuts.map(cutResponse) };
}

export async function createProductionCut(input: { projectId: string; episodeId?: string; directory: string; videoPath: string; editorProjectPath: string; editorRevision: string; title: string; sourceReferences?: SourceReference[] }) {
  const account = requireAccount();
  const { project } = await requireProjectAccess(input.projectId, "export");
  const directory = await authorizeProjectDirectory(input.directory);
  const source = await resolveWorkspacePath(directory, input.videoPath);
  const editor = await resolveWorkspacePath(directory, input.editorProjectPath);
  if (source.path === editor.path || !/\.mp4$/i.test(input.videoPath)) invalid("请选择剪辑台导出的 MP4 文件");
  const release = lockWorkspaceFiles([source.path, editor.path]);
  const id = randomUUID();
  let archive: string | undefined;
  let completed = false;
  try {
    const sourceInfo = await lstat(source.path);
    const projectInfo = await lstat(editor.path);
    if (!sourceInfo.isFile() || sourceInfo.size < 1 || sourceInfo.size > maxUploadBytes) invalid("成片文件必须为非空且不超过 8 GiB 的普通文件", 413);
    if (!projectInfo.isFile() || projectInfo.size > 32 * 1024 ** 2) invalid("剪辑工程文件不能超过 32 MiB", 413);
    const content = await readFile(editor.path);
    if (hashSecret(content.toString("utf8")) !== input.editorRevision) invalid("剪辑工程已更新，请先保存当前工程后重新提交", 409);
    const editorProject = JSON.parse(content.toString("utf8")) as { version?: number; assets?: unknown[]; clips?: unknown[] };
    if (!editorProject || editorProject.version !== 2 || !Array.isArray(editorProject.assets) || !Array.isArray(editorProject.clips) || !editorProject.clips.length) invalid("剪辑工程内容无效或时间线为空", 422);
    const lineage = await sourceLineage(directory, editorProject);
    if (input.episodeId) {
      const episodes = await getDatabase().select({ id: productionEpisodes.id }).from(productionEpisodes).innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId)).where(and(eq(productionEpisodes.id, input.episodeId), eq(productionSeasons.projectId, input.projectId))).limit(1);
      if (!episodes.length) invalid("关联剧集不属于当前项目", 422);
    }
    archive = await cutDirectory(input.projectId, id, true);
    const videoPath = "video.mp4";
    const projectPath = "project.json";
    const manifestPath = "manifest.json";
    const fileHash = await fixedVideo(source.path, resolve(archive, videoPath), sourceInfo.size, account.signal);
    const after = await lstat(source.path);
    if (sourceInfo.size !== after.size || sourceInfo.mtimeMs !== after.mtimeMs) invalid("归档期间源视频发生变化，请重新导出后提交", 409);
    await writeFile(resolve(archive, projectPath), content, { flag: "wx", mode: 0o600 });
    const media = await probeVideo(resolve(archive, videoPath), account.signal);
    if (await workspaceFileRevision(editor.path) !== input.editorRevision) invalid("剪辑工程在归档期间发生变化，请重新提交", 409);
    const metadata = { sourceDirectoryHash: hashSecret(directory), sourceVideoPath: input.videoPath, sourceProjectPath: input.editorProjectPath, sourceProjectRevision: input.editorRevision, sourceReferences: lineage.sourceReferences, sourceSnapshots: lineage.sourceSnapshots };
    const now = new Date();
    const result = await getDatabase().transaction(async tx => {
      // ACT: 锁项目行分配成片版本，避免同一项目并发登记出现重复版本。
      const [lockedProject] = await tx.select({ id: productionProjects.id }).from(productionProjects).where(eq(productionProjects.id, project.id)).limit(1).for("update");
      if (!lockedProject) invalid("制作项目不存在", 404);
      await requireProjectAccessInTransaction(tx, input.projectId, "export");
      const [previous] = await tx.select({ version: productionCuts.version }).from(productionCuts).where(and(eq(productionCuts.projectId, project.id), input.episodeId ? eq(productionCuts.episodeId, input.episodeId) : isNull(productionCuts.episodeId))).orderBy(desc(productionCuts.version)).limit(1);
      const version = (previous?.version ?? 0) + 1;
      const manifestCut = { id, projectId: project.id, episodeId: input.episodeId ?? null, version, title: input.title.trim(), status: "review" as const, videoPath, projectPath, manifestPath, fileHash, fileSize: sourceInfo.size, ...media, mimeType: "video/mp4", metadata, createdBy: account.userId, comment: null, reviewedBy: null, reviewedAt: null, deliveredBy: null, deliveredAt: null, createdAt: now, updatedAt: now };
      const manifestContent = JSON.stringify({ format: "omnistudio.production.cut.v1", cut: manifestCut }, null, 2);
      const manifestHash = hashSecret(manifestContent);
      const cut = { ...manifestCut, metadata: { ...metadata, manifestHash } };
      await writeFile(resolve(archive!, manifestPath), manifestContent, { flag: "wx", mode: 0o600 });
      await tx.insert(productionCuts).values(cut);
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionCut.create", metadata: { projectId: project.id, cutId: id, version, fileHash, fileSize: cut.fileSize, editorRevision: input.editorRevision, manifestHash, sourceReferences: lineage.sourceReferences, sourceSnapshots: lineage.sourceSnapshots }, createdAt: now, updatedAt: now });
      return cut;
    });
    completed = true;
    return cutResponse(result);
  } finally {
    try {
      if (!completed && archive) {
        // 提交结果不明时保留归档，避免已入库记录指向被删文件。
        const saved = await getDatabase().select({ id: productionCuts.id }).from(productionCuts).where(eq(productionCuts.id, id)).limit(1).catch(() => undefined);
        if (saved && saved.length === 0) {
          for (const file of ["video.mp4", "project.json", "manifest.json"]) await unlink(resolve(archive, file)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
          await rmdir(archive);
        }
      }
    } finally { release(); }
  }
}

export async function readProductionCut(input: { projectId: string; cutId: string; file: "video" | "project" | "manifest" }) {
  await requireProjectAccess(input.projectId, "read");
  const [cut] = await getDatabase().select().from(productionCuts).where(and(eq(productionCuts.id, input.cutId), eq(productionCuts.projectId, input.projectId))).limit(1);
  if (!cut) invalid("成片版本不存在", 404);
  await verifyCut(cut);
  if (input.file === "manifest" && !cut.metadata.manifestHash) invalid("旧成片 manifest 没有完整性摘要，不能作为已核验凭证；请重新提交版本", 409);
  const directory = await cutDirectory(cut.projectId, cut.id);
  const name = input.file === "video" ? cut.videoPath : input.file === "project" ? cut.projectPath : cut.manifestPath;
  const { path } = await resolveWorkspacePath(directory, name);
  const info = await lstat(path);
  if (!info.isFile() || input.file === "video" && info.size !== cut.fileSize) invalid("成片归档文件不存在或已变化", 409);
  return { path, mimeType: input.file === "video" ? cut.mimeType : "application/json", name: input.file === "video" ? `cutV${cut.version}.mp4` : name };
}

export async function decideProductionCut(input: { projectId: string; cutId: string; decision: "approved" | "changesRequested"; comment?: string }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, input.decision === "approved" ? "approve" : "review");
  const comment = input.comment?.trim() || null;
  if (input.decision === "changesRequested" && !comment) invalid("退回修改时请填写审片意见", 422);
  const [current] = await getDatabase().select().from(productionCuts).where(and(eq(productionCuts.id, input.cutId), eq(productionCuts.projectId, input.projectId))).limit(1);
  if (!current) invalid("成片版本不存在", 404);
  const release = await lockCutFiles(current);
  try {
    const result = await getDatabase().transaction(async tx => {
      const [cut] = await tx.select().from(productionCuts).where(and(eq(productionCuts.id, input.cutId), eq(productionCuts.projectId, input.projectId))).limit(1).for("update");
      if (!cut || cut.status !== "review") invalid("这个成片版本已处理，修改后请提交新版本", 409);
      const { project } = await requireProjectAccessInTransaction(tx, input.projectId, input.decision === "approved" ? "approve" : "review");
      await verifyCut(cut);
      if (input.decision === "approved" && !cut.metadata.manifestHash) invalid("旧成片缺少 manifest 完整性凭据，请重新提交版本后再批准", 409);
      const now = new Date();
      const patch = { status: input.decision, comment, reviewedBy: account.userId, reviewedAt: now, updatedAt: now };
      await tx.update(productionCuts).set(patch).where(eq(productionCuts.id, cut.id));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: `productionCut.${input.decision}`, metadata: { projectId: project.id, cutId: cut.id, fileHash: cut.fileHash, comment }, createdAt: now, updatedAt: now });
      return { ...cut, ...patch };
    });
    return cutResponse(result);
  } finally { release(); }
}

export async function deliverProductionCut(input: { projectId: string; cutId: string }) {
  const account = requireAccount();
  await requireProjectAccess(input.projectId, "export");
  const [current] = await getDatabase().select().from(productionCuts).where(and(eq(productionCuts.id, input.cutId), eq(productionCuts.projectId, input.projectId))).limit(1);
  if (!current) invalid("成片版本不存在", 404);
  const release = await lockCutFiles(current);
  try {
    const result = await getDatabase().transaction(async tx => {
      const [cut] = await tx.select().from(productionCuts).where(and(eq(productionCuts.id, input.cutId), eq(productionCuts.projectId, input.projectId))).limit(1).for("update");
      if (!cut || cut.status !== "approved") invalid("只有已批准的成片版本可以登记交付", 409);
      const { project } = await requireProjectAccessInTransaction(tx, input.projectId, "export");
      await verifyCut(cut);
      if (!cut.metadata.manifestHash) invalid("旧成片缺少 manifest 完整性凭据，请重新提交版本后再登记交付", 409);
      const now = new Date();
      const patch = { status: "delivered" as const, deliveredBy: account.userId, deliveredAt: now, updatedAt: now };
      await tx.update(productionCuts).set(patch).where(eq(productionCuts.id, cut.id));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: project.workspaceId, action: "productionCut.deliver", metadata: { projectId: project.id, cutId: cut.id, fileHash: cut.fileHash, reviewedBy: cut.reviewedBy, reviewedAt: cut.reviewedAt }, createdAt: now, updatedAt: now });
      return { ...cut, ...patch };
    });
    return cutResponse(result);
  } finally { release(); }
}

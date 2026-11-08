import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, stat, unlink } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/database";
import { generationJobs, personalProjects, productionClipVariants, productionEpisodes, productionScenes, productionSeasons, productionShots } from "@/db/schema";
import { requireProjectAccess } from "@/services/productionProjectService";
import { authorizeProjectDirectory, getPersonalProjectRoot } from "@/services/accountService";
import { requireAccount } from "@/utils/accountContext";
import { getAssetsDirectory } from "@/utils/assets";
import { isWithin, lockWorkspaceFiles, maxUploadBytes, resolveWorkspacePath, workspaceFileRevision } from "@/utils/workspace/files";
import u from "@/utils";

type SourceInput =
  | { type: "workspace"; path: string; canvasPath?: string; nodeId?: string; outputId?: string }
  | { type: "production"; projectId: string; variantId: string }
  | { type: "library"; path: string };

type SourceSnapshot = { type: SourceInput["type"]; path: string; hash: string; importedAt: string; canvasPath?: string; nodeId?: string; outputId?: string; projectId?: string; episodeId?: string; shotId?: string; variantId?: string; attemptNumber?: number; revision?: string };

const mediaExtensions: Record<string, { kind: "video" | "audio" | "image"; mimeType: string }> = {
  mp4: { kind: "video", mimeType: "video/mp4" }, mov: { kind: "video", mimeType: "video/quicktime" }, webm: { kind: "video", mimeType: "video/webm" }, m4v: { kind: "video", mimeType: "video/mp4" }, mkv: { kind: "video", mimeType: "video/x-matroska" }, avi: { kind: "video", mimeType: "video/x-msvideo" }, mpeg: { kind: "video", mimeType: "video/mpeg" }, mpg: { kind: "video", mimeType: "video/mpeg" },
  mp3: { kind: "audio", mimeType: "audio/mpeg" }, wav: { kind: "audio", mimeType: "audio/wav" }, m4a: { kind: "audio", mimeType: "audio/mp4" }, aac: { kind: "audio", mimeType: "audio/aac" }, flac: { kind: "audio", mimeType: "audio/flac" }, ogg: { kind: "audio", mimeType: "audio/ogg" }, oga: { kind: "audio", mimeType: "audio/ogg" }, opus: { kind: "audio", mimeType: "audio/opus" },
  jpg: { kind: "image", mimeType: "image/jpeg" }, jpeg: { kind: "image", mimeType: "image/jpeg" }, png: { kind: "image", mimeType: "image/png" }, webp: { kind: "image", mimeType: "image/webp" }, gif: { kind: "image", mimeType: "image/gif" }, bmp: { kind: "image", mimeType: "image/bmp" }, tif: { kind: "image", mimeType: "image/tiff" }, tiff: { kind: "image", mimeType: "image/tiff" }, heic: { kind: "image", mimeType: "image/heic" }, heif: { kind: "image", mimeType: "image/heif" }, avif: { kind: "image", mimeType: "image/avif" },
};

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

async function sourceHash(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function verifyImageSignature(path: string, extension: string) {
  const handle = await open(path, "r");
  const header = Buffer.alloc(16);
  let length: number;
  try { ({ bytesRead: length } = await handle.read(header, 0, header.length, 0)); }
  finally { await handle.close(); }
  const bytes = header.subarray(0, length!);
  const signatures: Record<string, (value: Buffer) => boolean> = {
    jpg: value => value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff,
    jpeg: value => value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff,
    png: value => value.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    gif: value => value.subarray(0, 6).toString("ascii").startsWith("GIF8"),
    webp: value => value.subarray(0, 4).toString("ascii") === "RIFF" && value.subarray(8, 12).toString("ascii") === "WEBP",
    bmp: value => value.subarray(0, 2).toString("ascii") === "BM",
    tif: value => value.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || value.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])),
    tiff: value => value.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) || value.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])),
    heic: value => value.subarray(4, 8).toString("ascii") === "ftyp" && /^(heic|heix|hevc|mif1)$/.test(value.subarray(8, 12).toString("ascii")),
    heif: value => value.subarray(4, 8).toString("ascii") === "ftyp" && /^(heic|heix|hevc|mif1)$/.test(value.subarray(8, 12).toString("ascii")),
    avif: value => value.subarray(4, 8).toString("ascii") === "ftyp" && /^(avif|avis)$/.test(value.subarray(8, 12).toString("ascii")),
  };
  if (!signatures[extension]?.(bytes)) invalid("素材内容与图片扩展名不一致", 422);
}

async function ensureMediaDirectory(directory: string) {
  const root = await authorizeProjectDirectory(directory);
  let current = root;
  for (const segment of ["assets", "videoEditor", "media"]) {
    current = resolve(current, segment);
    const existing = await lstat(current).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (existing?.isSymbolicLink()) invalid("剪辑素材目录不能使用符号链接", 403);
    if (!existing) await mkdir(current, { mode: 0o700 });
    const info = await lstat(current);
    if (!info.isDirectory() || await realpath(current) !== current) invalid("剪辑素材目录不能使用符号链接", 403);
  }
  return current;
}

async function verifyWorkspaceCanvas(directory: string, input: Extract<SourceInput, { type: "workspace" }>) {
  const hasContext = input.canvasPath !== undefined || input.nodeId !== undefined || input.outputId !== undefined;
  if (!hasContext) return undefined;
  if (!input.canvasPath || !input.nodeId || !input.outputId) invalid("画布来源需要完整的画布、节点和输出编号");
  const canvas = await resolveWorkspacePath(directory, input.canvasPath);
  const info = await lstat(canvas.path);
  if (!info.isFile()) invalid("画布文件不存在", 404);
  if (info.size > 32 * 1024 ** 2) invalid("画布文件超过 32 MiB，不能验证素材来源", 413);
  const revision = await workspaceFileRevision(canvas.path);
  const parsed = JSON.parse(await readFile(canvas.path, "utf8")) as { toonflowCanvas?: boolean; nodes?: { id?: string; data?: { outputs?: Record<string, { value?: { url?: unknown; mimeType?: unknown } }> } }[] };
  if (await workspaceFileRevision(canvas.path) !== revision) invalid("画布在验证期间发生变化，请重新导入", 409);
  if (parsed.toonflowCanvas !== true || !Array.isArray(parsed.nodes)) invalid("画布文件格式无效", 422);
  const node = parsed.nodes?.find(item => item.id === input.nodeId);
  const output = node?.data?.outputs?.[input.outputId];
  if (output?.value?.url !== input.path) invalid("保存的画布节点输出与所选素材不一致", 409);
  if (typeof output.value.mimeType !== "string") invalid("画布输出缺少素材 MIME 类型", 422);
  return { revision, mimeType: output.value.mimeType };
}

async function authorizeJobDirectory(userId: string, directory: string) {
  const actual = await realpath(directory);
  const roots = [await getPersonalProjectRoot(userId)];
  const projects = await getDatabase().select({ directory: personalProjects.directory }).from(personalProjects).where(eq(personalProjects.userId, userId));
  for (const project of projects) {
    const root = await realpath(project.directory).catch(() => undefined);
    if (root) roots.push(root);
  }
  if (!roots.some(root => isWithin(root, actual))) invalid("原生成工作区不再属于生成该素材的账户，不能导入", 403);
  if (!(await stat(actual)).isDirectory()) invalid("原生成工作区不可用", 404);
  return actual;
}

async function resolveMediaSource(directory: string, source: SourceInput, projectAction: "read" | "export") {
  if (source.type === "workspace") {
    const canvas = await verifyWorkspaceCanvas(directory, source);
    const { path } = await resolveWorkspacePath(directory, source.path);
    return { path, relativePath: source.path, mimeType: canvas?.mimeType, snapshot: { type: source.type, path: source.path, ...(canvas ? { canvasPath: source.canvasPath, nodeId: source.nodeId, outputId: source.outputId, revision: canvas.revision } : {}) } };
  }
  if (source.type === "library") {
    const record = await u.assets.getAsset(source.path);
    const assetsDirectory = await getAssetsDirectory();
    const { path } = await resolveWorkspacePath(assetsDirectory, source.path);
    if (await sourceHash(path) !== record.hash) invalid("素材库文件与已登记版本不一致", 409);
    return { path, relativePath: source.path, mimeType: record.mimeType, expectedHash: record.hash, snapshot: { type: source.type, path: source.path } };
  }

  await requireProjectAccess(source.projectId, projectAction);
  const [row] = await getDatabase().select({ variant: productionClipVariants, job: generationJobs, shot: productionShots, episode: productionEpisodes }).from(productionClipVariants)
    .innerJoin(generationJobs, eq(generationJobs.id, productionClipVariants.generationJobId))
    .innerJoin(productionShots, eq(productionShots.id, productionClipVariants.shotId))
    .innerJoin(productionScenes, eq(productionScenes.id, productionShots.sceneId))
    .innerJoin(productionEpisodes, eq(productionEpisodes.id, productionScenes.episodeId))
    .innerJoin(productionSeasons, eq(productionSeasons.id, productionEpisodes.seasonId))
    .where(and(
      eq(productionClipVariants.id, source.variantId),
      eq(productionClipVariants.projectId, source.projectId),
      eq(productionSeasons.projectId, source.projectId),
      eq(generationJobs.projectId, source.projectId),
      eq(generationJobs.episodeId, productionEpisodes.id),
      eq(generationJobs.sceneId, productionScenes.id),
    )).limit(1);
  if (!row) invalid("项目候选素材不存在", 404);
  if (row.job.status !== "succeeded" || row.job.projectId !== source.projectId || row.job.shotId !== row.variant.shotId || row.job.userId !== row.variant.createdBy) invalid("候选素材与成功生成任务的项目、镜头或作者信息不一致", 409);
  const result = row.job.resultSnapshot && typeof row.job.resultSnapshot === "object" && !Array.isArray(row.job.resultSnapshot) ? row.job.resultSnapshot as Record<string, unknown> : {};
  const files = Array.isArray(result.files) ? result.files as { path?: unknown; mimeType?: unknown; mediaType?: unknown }[] : [];
  if (!files.some(file => file.path === row.variant.filePath && file.mimeType === row.variant.mimeType && file.mediaType === row.variant.mediaType)) invalid("候选素材不在已结算生成任务的文件快照中", 409);
  if (typeof result.directory !== "string" || !result.directory) invalid("生成任务未记录原工作区，不能导入候选素材", 409);
  const sourceDirectory = await authorizeJobDirectory(row.job.userId, result.directory);
  const { path } = await resolveWorkspacePath(sourceDirectory, row.variant.filePath);
  return { path, relativePath: row.variant.filePath, mimeType: row.variant.mimeType, snapshot: { type: source.type, path: row.variant.filePath, projectId: source.projectId, episodeId: row.episode.id, shotId: row.shot.id, variantId: source.variantId, attemptNumber: row.variant.attemptNumber } };
}

async function probeMedia(path: string, kind: "video" | "audio" | "image", signal?: AbortSignal) {
  const { tools } = await u.ffmpeg.getStatus();
  if (!tools.ffprobe.path || tools.ffprobe.error) {
    if (kind === "image") return { duration: 5, hasAudio: false };
    invalid("导入音视频素材需要可用的 FFprobe，请先配置 FFmpeg", 424);
  }
  const args = kind === "image"
    ? ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", path]
    : ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", path];
  const child = Bun.spawn([tools.ffprobe.path, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true, timeout: 30000, signal });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  signal?.throwIfAborted();
  if (code !== 0) {
    if (kind === "image") invalid("无法读取图片尺寸，请使用受支持的常规图片文件", 422);
    invalid("无法读取素材媒体信息：" + stderr.slice(0, 400), 422);
  }
  const data = JSON.parse(stdout) as { streams?: { codec_type?: string; width?: number; height?: number }[]; format?: { duration?: string } };
  if (kind === "image") {
    const stream = data.streams?.[0];
    return { duration: 5, hasAudio: false, ...(Number.isSafeInteger(stream?.width) && Number.isSafeInteger(stream?.height) ? { width: stream!.width, height: stream!.height } : {}) };
  }
  const duration = Number(data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400) invalid("素材时长无效或超过 24 小时", 422);
  const video = data.streams?.find(stream => stream.codec_type === "video");
  const hasAudio = data.streams?.some(stream => stream.codec_type === "audio") ?? false;
  if (kind === "video" && !video || kind === "audio" && !hasAudio) invalid("素材扩展名与实际音视频流不一致", 422);
  return { duration, hasAudio, ...(video && Number.isSafeInteger(video.width) && Number.isSafeInteger(video.height) ? { width: video.width, height: video.height } : {}) };
}

async function importMedia(input: { directory: string; source: SourceInput }, projectAction: "read" | "export") {
  const account = requireAccount();
  const directory = await authorizeProjectDirectory(input.directory);
  const source = await resolveMediaSource(directory, input.source, projectAction);
  const extension = extname(source.relativePath).slice(1).toLowerCase();
  const format = mediaExtensions[extension];
  if (!format) invalid("剪辑台不支持此素材格式");
  if (source.mimeType && source.mimeType.toLowerCase() !== format.mimeType) invalid("素材扩展名与来源记录的 MIME 类型不一致", 409);
  const before = await lstat(source.path);
  if (!before.isFile() || before.size < 1 || before.size > maxUploadBytes) invalid("素材必须为非空且不超过 8 GiB 的普通文件", 413);
  const targetDirectory = await ensureMediaDirectory(directory);
  const targetName = randomUUID() + "." + extension;
  const relativePath = "assets/videoEditor/media/" + targetName;
  const target = await resolveWorkspacePath(directory, relativePath, true);
  const release = lockWorkspaceFiles([source.path, target.path]);
  try {
    if (format.kind === "image") await verifyImageSignature(source.path, extension);
    const digest = createHash("sha256");
    let bytes = 0;
    const output = createWriteStream(target.path, { flags: "wx", mode: 0o600 });
    await pipeline(createReadStream(source.path), new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > before.size || bytes > maxUploadBytes) return callback(new Error("素材在导入期间发生变化，请重试"));
        digest.update(chunk);
        callback(null, chunk);
      },
    }), output, { signal: account.signal });
    if (bytes !== before.size) invalid("素材在导入期间发生变化，请重试", 409);
    const after = await lstat(source.path);
    if (!after.isFile() || before.size !== after.size || before.mtimeMs !== after.mtimeMs) invalid("素材在导入期间发生变化，请重试", 409);
    const hash = digest.digest("hex");
    if (await sourceHash(source.path) !== hash) invalid("素材在导入期间发生变化，请重试", 409);
    if (source.expectedHash && source.expectedHash !== hash) invalid("素材库文件与已登记版本不一致", 409);
    const canvasPath = (source.snapshot as Partial<SourceSnapshot>).canvasPath;
    const canvasRevision = (source.snapshot as Partial<SourceSnapshot>).revision;
    if (canvasPath && canvasRevision) {
      const canvas = await resolveWorkspacePath(directory, canvasPath);
      if (await workspaceFileRevision(canvas.path) !== canvasRevision) invalid("素材来源画布在导入期间发生变化，请重新导入", 409);
    }
    const media = await probeMedia(target.path, format.kind, account.signal);
    const sourceSnapshot = { ...source.snapshot, hash, importedAt: new Date().toISOString() } as SourceSnapshot;
    return { asset: { id: randomUUID(), name: basename(source.relativePath), path: relativePath, kind: format.kind, duration: media.duration, size: bytes, ...(media.width ? { width: media.width } : {}), ...(media.height ? { height: media.height } : {}), ...(format.kind === "video" ? { hasAudio: media.hasAudio } : {}), source: sourceSnapshot } };
  } catch (error) {
    await unlink(target.path).catch((cleanupError: NodeJS.ErrnoException) => { if (cleanupError.code !== "ENOENT") throw cleanupError; });
    throw error;
  } finally {
    try {
      if (await realpath(targetDirectory) !== targetDirectory) invalid("剪辑素材目录在导入期间发生变化", 409);
    } finally { release(); }
  }
}

export function importEditorMedia(input: { directory: string; source: SourceInput }) {
  return importMedia(input, "export");
}

export function importProductionSource(input: { directory: string; projectId: string; variantId: string }) {
  return importMedia({ directory: input.directory, source: { type: "production", projectId: input.projectId, variantId: input.variantId } }, "read");
}

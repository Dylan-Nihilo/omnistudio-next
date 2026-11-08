import { randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDatabase, hashSecret } from "@/db/database";
import { auditEvents } from "@/db/schema";
import { authorizeProjectDirectory } from "@/services/accountService";
import { requireActiveAccount } from "@/utils/accountContext";
import { lockWorkspaceFiles, maxUploadBytes, resolveWorkspacePath, workspaceFileRevision } from "@/utils/workspace/files";
import u from "@/utils";

type ExportQuery = { directory: string; projectPath: string; revision: string };
type ExportInput = ExportQuery & { exportPath: string };
type ExportMetadata = { format: "omnistudio.editor.export.v1"; directoryHash: string; projectPath: string; revision: string; exportPath: string; fileHash: string; fileSize: number; completedAt?: string };
const projectPathPattern = /^assets\/videoEditor\/(?:timeline\.json|projects\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.json)$/;
const exportPathPattern = /^assets\/videoEditor\/exports\/edited\d{13}[\da-f]{8}\.mp4$/;

function invalid(message: string, status = 409): never {
  throw Object.assign(new Error(message), { status });
}

function validateQuery(input: ExportQuery) {
  if (!projectPathPattern.test(input.projectPath) || !/^[\da-f]{64}$/.test(input.revision)) invalid("剪辑工程路径或版本无效", 400);
}

async function verifyExport(input: ExportInput, directory: string, expected?: ExportMetadata) {
  if (!exportPathPattern.test(input.exportPath)) invalid("成片必须是剪辑台固定导出目录内的 MP4", 400);
  const project = await resolveWorkspacePath(directory, input.projectPath);
  const video = await resolveWorkspacePath(directory, input.exportPath);
  const release = lockWorkspaceFiles([project.path, video.path]);
  try {
    const projectInfo = await lstat(project.path);
    if (!projectInfo.isFile() || projectInfo.size < 1 || projectInfo.size > 32 * 1024 ** 2) invalid("剪辑工程不存在或超过大小限制");
    const content = await readFile(project.path, "utf8");
    if (hashSecret(content) !== input.revision) invalid("剪辑工程已发生变化，不能恢复此成片的登记入口");
    let parsed: { version?: unknown; clips?: unknown };
    try { parsed = JSON.parse(content); }
    catch { invalid("剪辑工程内容无法读取"); }
    if (!parsed || parsed.version !== 2 || !Array.isArray(parsed.clips) || !parsed.clips.length) invalid("剪辑工程内容无效或时间线为空");
    const before = await lstat(video.path);
    if (!before.isFile() || before.size < 1 || before.size > maxUploadBytes) invalid("导出文件不存在或超过大小限制");
    if (expected && before.size !== expected.fileSize) invalid("导出文件大小已变化，不能恢复登记入口");
    const fileHash = await workspaceFileRevision(video.path);
    if (expected && fileHash !== expected.fileHash) invalid("导出文件摘要已变化，不能恢复登记入口");
    const account = requireActiveAccount();
    const { tools } = await u.ffmpeg.getStatus();
    if (!tools.ffprobe.path || tools.ffprobe.error) invalid("恢复导出记录需要可用的 FFprobe，请先配置 FFmpeg", 424);
    const child = Bun.spawn([tools.ffprobe.path, "-v", "error", "-select_streams", "v:0", "-show_entries", "format=duration,format_name:stream=width,height", "-of", "json", video.path], {
      stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true, timeout: 30000, signal: account.signal,
    });
    const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
    account.signal?.throwIfAborted();
    if (code !== 0) invalid(`导出文件无法读取：${stderr.slice(0, 300)}`, 422);
    const media = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string; format_name?: string } };
    const stream = media.streams?.[0];
    const duration = Number(media.format?.duration);
    if (!stream || !Number.isSafeInteger(stream.width) || !Number.isSafeInteger(stream.height) || stream.width! < 1 || stream.height! < 1 || !Number.isFinite(duration) || duration <= 0 || duration > 86400 || !media.format?.format_name?.split(",").includes("mp4")) invalid("导出文件不是有效的 MP4 视频", 422);
    const after = await lstat(video.path);
    if (!after.isFile() || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || await workspaceFileRevision(video.path) !== fileHash || await workspaceFileRevision(project.path) !== input.revision) invalid("核验期间成片或工程发生变化，请重试");
    requireActiveAccount();
    return { fileHash, fileSize: after.size, release };
  } catch (error) {
    release();
    if ((error as NodeJS.ErrnoException).code === "ENOENT") invalid("导出文件或剪辑工程已缺失，不能恢复登记入口");
    throw error;
  }
}

export async function recordEditorExport(input: ExportInput) {
  validateQuery(input);
  const account = requireActiveAccount();
  const directory = await authorizeProjectDirectory(input.directory);
  const verified = await verifyExport(input, directory);
  try {
    const id = randomUUID();
    const now = new Date();
    const metadata: ExportMetadata = { format: "omnistudio.editor.export.v1", directoryHash: hashSecret(directory), projectPath: input.projectPath, revision: input.revision, exportPath: input.exportPath, fileHash: verified.fileHash, fileSize: verified.fileSize, completedAt: now.toISOString() };
    await getDatabase().insert(auditEvents).values({ id, actorUserId: account.userId, action: "editorExport.complete", metadata, createdAt: now, updatedAt: now });
    return { id, projectPath: input.projectPath, revision: input.revision, exportPath: input.exportPath };
  } finally { verified.release(); }
}

export async function latestEditorExport(input: ExportQuery) {
  validateQuery(input);
  const account = requireActiveAccount();
  const directory = await authorizeProjectDirectory(input.directory);
  const [record] = await getDatabase().select({ id: auditEvents.id, metadata: auditEvents.metadata }).from(auditEvents).where(and(
    eq(auditEvents.actorUserId, account.userId),
    eq(auditEvents.action, "editorExport.complete"),
    sql`JSON_UNQUOTE(JSON_EXTRACT(${auditEvents.metadata}, '$.directoryHash')) = ${hashSecret(directory)}`,
    sql`JSON_UNQUOTE(JSON_EXTRACT(${auditEvents.metadata}, '$.projectPath')) = ${input.projectPath}`,
    sql`JSON_UNQUOTE(JSON_EXTRACT(${auditEvents.metadata}, '$.revision')) = ${input.revision}`,
  )).orderBy(desc(sql`COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${auditEvents.metadata}, '$.completedAt')), DATE_FORMAT(${auditEvents.createdAt}, '%Y-%m-%dT%H:%i:%s.000Z'))`), desc(auditEvents.createdAt), desc(auditEvents.id)).limit(1);
  if (!record) return null;
  const metadata = record.metadata as Partial<ExportMetadata> | null;
  if (!metadata || metadata.format !== "omnistudio.editor.export.v1" || metadata.directoryHash !== hashSecret(directory) || metadata.projectPath !== input.projectPath || metadata.revision !== input.revision || typeof metadata.exportPath !== "string" || !exportPathPattern.test(metadata.exportPath) || typeof metadata.fileHash !== "string" || !/^[\da-f]{64}$/.test(metadata.fileHash) || !Number.isSafeInteger(metadata.fileSize) || metadata.fileSize! < 1 || metadata.fileSize! > maxUploadBytes || metadata.completedAt !== undefined && (typeof metadata.completedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(metadata.completedAt) || !Number.isFinite(Date.parse(metadata.completedAt)))) invalid("导出记录内容无效，不能恢复登记入口");
  const verified = await verifyExport({ ...input, exportPath: metadata.exportPath }, directory, metadata as ExportMetadata);
  try {
    return { id: record.id, projectPath: metadata.projectPath, revision: metadata.revision, exportPath: metadata.exportPath };
  } finally { verified.release(); }
}

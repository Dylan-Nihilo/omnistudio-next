import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rm, rmdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { validateRemoteExportRequest } from "@omnistudio-next/ffmpeg";
import type { BrowserFfmpegRequest } from "@omnistudio-next/ffmpeg";
import { getDatabase, hashSecret, hasServerLease, serverInstanceId, serverSignal } from "@/db/database";
import { editorRenderJobs, users } from "@/db/schema";
import { authorizeProjectDirectory } from "@/services/accountService";
import { isPlatformAdmin } from "@/services/authService";
import { recordEditorExport } from "@/services/editorExportService";
import { accountContext, requireActiveAccount } from "@/utils/accountContext";
import { getDataDirectory } from "@/utils/conf";
import { lockWorkspaceFiles, maxUploadBytes, resolveWorkspacePath, workspaceFileRevision } from "@/utils/workspace/files";
import { formatAgentError } from "@/agent/runtime/errors";
import u from "@/utils";

type RenderRow = typeof editorRenderJobs.$inferSelect;
type RenderFile = RenderRow["payload"]["files"][number];
type CreateInput = { directory: string; projectPath: string; revision: string; projectName: string; request: BrowserFfmpegRequest };
type JobInput = { directory: string; id: string };
export type RenderJob = Pick<RenderRow, "id" | "projectPath" | "revision" | "projectName" | "status" | "progress" | "outputPath" | "error"> & { createdAt: string; updatedAt: string };
const projectPattern = /^assets\/videoEditor\/(?:timeline\.json|projects\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\.json)$/;
const outputPattern = /^assets\/videoEditor\/exports\/edited\d{13}[\da-f]{8}\.mp4$/;
const activeStatuses = ["queued", "running"] as const;
const terminalStatuses = ["succeeded", "failed", "cancelled", "interrupted"] as const;
let initialized = false;
let draining = false;
let activeJob: { id: string; controller: AbortController; done: Promise<void> } | undefined;
const submissions = new Map<string, { signature: string; promise: Promise<RenderJob> }>();

function invalid(message: string, status = 409): never {
  throw Object.assign(new Error(message), { status, renderSafe: true });
}

function publicJob(row: RenderRow): RenderJob {
  return { id: row.id, projectPath: row.projectPath, revision: row.revision, projectName: row.projectName, status: row.status, progress: row.progress, outputPath: row.outputPath, error: row.error, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function failureMessage(error: unknown) {
  return error instanceof Error && "renderSafe" in error ? error.message.slice(0, 1000) : "渲染失败，请检查素材和导出设置后重试";
}

function checkProjectPath(path: string) {
  if (!projectPattern.test(path)) invalid("剪辑工程路径无效", 400);
}

function helperPaths(request: BrowserFfmpegRequest) {
  let details: ReturnType<typeof validateRemoteExportRequest>;
  try { details = validateRemoteExportRequest(request); }
  catch (error) { invalid(error instanceof Error ? error.message : "渲染请求无效", 400); }
  const match = /^assets\/videoEditor\/exports\/exportGraph([\da-f]{32})\.txt$/.exec(details.graphPath);
  if (!match || !outputPattern.test(details.outputPath) || !details.outputPath.endsWith(`${match[1]!.slice(0, 8)}.mp4`)) invalid("渲染脚本与输出编号不一致", 400);
  const paths = [details.graphPath];
  for (const path of details.inputPaths) {
    if (path.startsWith("assets/videoEditor/media/")) continue;
    if (!new RegExp(`^assets/videoEditor/exports/exportText${match[1]}\\d+\\.png$`).test(path)) invalid("渲染任务只能使用剪辑台固定素材及同次导出的文字图", 400);
    paths.push(path);
  }
  return { details, paths: [...new Set(paths)] };
}

async function fileFingerprint(directory: string, path: string, kind: RenderFile["kind"]): Promise<RenderFile> {
  const file = await resolveWorkspacePath(directory, path);
  const before = await lstat(file.path);
  const limit = kind === "media" ? maxUploadBytes : kind === "project" ? 32 * 1024 ** 2 : path.endsWith(".txt") ? 512 * 1024 : 64 * 1024 ** 2;
  if (!before.isFile() || before.size < 1 || before.size > limit) invalid("渲染素材、工程或辅助文件不存在或超过大小限制", 413);
  const hash = await workspaceFileRevision(file.path);
  const after = await lstat(file.path);
  if (hash === "missing" || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) invalid("渲染文件在核验期间发生变化，请重新提交");
  return { path, size: after.size, hash, kind };
}

async function verifyFingerprints(row: RenderRow) {
  const expectedHelpers = helperPaths(row.payload.request).paths;
  const paths = new Set(row.payload.files.map(file => file.path));
  const inputs = validateRemoteExportRequest(row.payload.request).inputPaths;
  if (paths.size !== row.payload.files.length || !paths.has(row.projectPath) || inputs.some(path => !paths.has(path)) || expectedHelpers.some(path => !paths.has(path))) invalid("持久渲染文件快照不完整");
  if (hashSecret(row.payload.projectContent) !== row.revision) invalid("持久化工程快照无效，请重新提交");
  for (const expected of row.payload.files) {
    if (expected.kind === "project") continue;
    const actual = await fileFingerprint(row.directory, expected.path, expected.kind);
    if (actual.size !== expected.size || actual.hash !== expected.hash) invalid("工程、素材或渲染辅助文件已变化，请重新导出");
  }
}

async function checkLiveProject(directory: string, projectPath: string, revision: string) {
  checkProjectPath(projectPath);
  const file = await fileFingerprint(directory, projectPath, "project");
  if (file.hash !== revision) invalid("剪辑工程已发生变化，请保存后重新导出");
  const { path } = await resolveWorkspacePath(directory, projectPath);
  const content = await readFile(path, "utf8");
  if (hashSecret(content) !== revision) invalid("剪辑工程在提交期间发生变化，请重新导出");
  let project: { version?: unknown; clips?: unknown };
  try { project = JSON.parse(content); }
  catch { invalid("剪辑工程内容无法读取", 422); }
  if (!project || project.version !== 2 || !Array.isArray(project.clips) || !project.clips.length) invalid("剪辑工程内容无效或时间线为空", 422);
  return { file, content };
}

async function checkActiveLimit(tx: Parameters<Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]>[0], userId: string) {
  // ACT: 同用户行锁只覆盖入队/重试事务，不在渲染期间持有数据库事务。
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1).for("update");
  const active = await tx.select({ id: editorRenderJobs.id }).from(editorRenderJobs).where(and(eq(editorRenderJobs.userId, userId), inArray(editorRenderJobs.status, [...activeStatuses])));
  if (active.length >= 10) invalid("每个账户最多同时保留 10 个排队或渲染中的任务", 429);
}

function sameSubmission(row: RenderRow, input: CreateInput, directory: string, requestHash: string) {
  if (row.directory !== directory || row.projectPath !== input.projectPath || row.revision !== input.revision || row.projectName !== input.projectName.trim() || row.requestHash !== requestHash) invalid("同一渲染请求编号已被其他工程或导出设置使用");
  return publicJob(row);
}

export async function createEditorRender(input: CreateInput): Promise<RenderJob> {
  const account = requireActiveAccount();
  helperPaths(input.request);
  const key = `${account.userId}:${input.request.requestId}`;
  const signature = hashSecret(JSON.stringify(input));
  const pending = submissions.get(key);
  if (pending) {
    if (pending.signature !== signature) invalid("同一渲染请求编号已被其他导出内容使用");
    return pending.promise;
  }
  const promise = createRender(input);
  submissions.set(key, { signature, promise });
  try { return await promise; }
  finally { if (submissions.get(key)?.promise === promise) submissions.delete(key); }
}

async function createRender(input: CreateInput): Promise<RenderJob> {
  const account = requireActiveAccount();
  const directory = await authorizeProjectDirectory(input.directory);
  checkProjectPath(input.projectPath);
  if (!/^[\da-f]{64}$/.test(input.revision) || !input.projectName.trim() || input.projectName.length > 120 || /[\u0000-\u001f]/.test(input.projectName)) invalid("剪辑工程名称或版本无效", 400);
  helperPaths(input.request);
  if (input.request.directory !== directory && input.request.directory !== input.directory) invalid("渲染请求工作区与工程不一致", 400);
  const request = JSON.parse(JSON.stringify(input.request)) as BrowserFfmpegRequest;
  request.directory = directory;
  const { details, paths: helpers } = helperPaths(request);
  const requestHash = hashSecret(JSON.stringify(request));
  const [existing] = await getDatabase().select().from(editorRenderJobs).where(and(eq(editorRenderJobs.userId, account.userId), eq(editorRenderJobs.requestId, request.requestId))).limit(1);
  if (existing) return sameSubmission(existing, input, directory, requestHash);
  const allPaths = [...new Set([input.projectPath, ...details.inputPaths, details.graphPath, details.outputPath])];
  const resolved = await Promise.all(allPaths.map(path => resolveWorkspacePath(directory, path)));
  const release = lockWorkspaceFiles(resolved.map(file => file.path));
  try {
    const project = await checkLiveProject(directory, input.projectPath, input.revision);
    const files: RenderFile[] = [project.file];
    for (const path of allPaths.filter(path => path !== input.projectPath && path !== details.outputPath)) files.push(await fileFingerprint(directory, path, helpers.includes(path) ? "helper" : "media"));
    const graph = await resolveWorkspacePath(directory, details.graphPath);
    try { validateRemoteExportRequest(request, await readFile(graph.path, "utf8")); }
    catch (error) { invalid(error instanceof Error ? error.message : "渲染滤镜脚本无效", 400); }
    const output = await resolveWorkspacePath(directory, details.outputPath);
    if (await lstat(output.path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; })) invalid("渲染输出文件已经存在，请重新导出");
    requireActiveAccount();
    const row = await getDatabase().transaction(async tx => {
      await checkActiveLimit(tx, account.userId);
      const [previous] = await tx.select().from(editorRenderJobs).where(and(eq(editorRenderJobs.userId, account.userId), eq(editorRenderJobs.requestId, request.requestId))).limit(1);
      if (previous) { sameSubmission(previous, input, directory, requestHash); return previous; }
      const now = new Date();
      const next: RenderRow = { id: randomUUID(), userId: account.userId, directory, directoryHash: hashSecret(directory), projectPath: input.projectPath, revision: input.revision, projectName: input.projectName.trim(), requestId: request.requestId, requestHash, status: "queued", progress: 0, graphPath: details.graphPath, outputPath: details.outputPath, payload: { request, projectContent: project.content, files }, runtimeId: null, error: null, createdAt: now, updatedAt: now };
      await tx.insert(editorRenderJobs).values(next);
      return next;
    });
    // 提交成功后唤醒不影响 HTTP 结果；响应丢失可使用 requestId 找回同一任务。
    queueMicrotask(wakeWorker);
    return publicJob(row);
  } finally { release(); }
}

export async function listEditorRenders(input: { directory: string; projectPath: string }): Promise<RenderJob[]> {
  const account = requireActiveAccount();
  checkProjectPath(input.projectPath);
  const directory = await authorizeProjectDirectory(input.directory);
  const rows = await getDatabase().select().from(editorRenderJobs).where(and(eq(editorRenderJobs.userId, account.userId), eq(editorRenderJobs.directoryHash, hashSecret(directory)), eq(editorRenderJobs.directory, directory), eq(editorRenderJobs.projectPath, input.projectPath))).orderBy(desc(editorRenderJobs.createdAt), desc(editorRenderJobs.id)).limit(50);
  return rows.map(publicJob);
}

async function ownedJob(input: JobInput) {
  const account = requireActiveAccount();
  const directory = await authorizeProjectDirectory(input.directory);
  const [row] = await getDatabase().select().from(editorRenderJobs).where(and(eq(editorRenderJobs.id, input.id), eq(editorRenderJobs.userId, account.userId), eq(editorRenderJobs.directoryHash, hashSecret(directory)), eq(editorRenderJobs.directory, directory))).limit(1);
  if (!row) invalid("渲染任务不存在或不属于当前工作区", 404);
  return row;
}

export async function cancelEditorRender(input: JobInput): Promise<RenderJob> {
  const row = await ownedJob(input);
  const result = await getDatabase().transaction(async tx => {
    const [current] = await tx.select().from(editorRenderJobs).where(eq(editorRenderJobs.id, row.id)).limit(1).for("update");
    if (!current) invalid("渲染任务不存在", 404);
    if (!activeStatuses.includes(current.status as typeof activeStatuses[number])) return current;
    const next = { ...current, status: "cancelled" as const, error: "已取消渲染", updatedAt: new Date() };
    await tx.update(editorRenderJobs).set({ status: next.status, error: next.error, updatedAt: next.updatedAt }).where(eq(editorRenderJobs.id, row.id));
    return next;
  });
  const running = activeJob;
  if (running?.id === row.id) { running.controller.abort(new DOMException("已取消渲染", "AbortError")); await running.done; }
  return publicJob(result);
}

export async function retryEditorRender(input: JobInput): Promise<RenderJob> {
  const row = await ownedJob(input);
  if (!terminalStatuses.includes(row.status as typeof terminalStatuses[number])) invalid("任务正在排队或渲染，不能重复重试");
  const resolved = await Promise.all([...row.payload.files.filter(file => file.kind !== "project").map(file => file.path), row.outputPath].map(path => resolveWorkspacePath(row.directory, path)));
  const release = lockWorkspaceFiles(resolved.map(file => file.path));
  try {
    try { await clearTaskTemporary(row.id); }
    catch (error) {
      console.error("重试前清理渲染临时文件失败", { jobId: row.id, error: formatAgentError(error instanceof Error ? error.message : String(error)) });
      invalid("旧渲染临时文件仍被占用或无法清理，已保留文件；释放占用后再重试");
    }
    await verifyFingerprints(row);
    const request = JSON.parse(JSON.stringify(row.payload.request)) as BrowserFfmpegRequest;
    const graphId = /^assets\/videoEditor\/exports\/exportGraph([\da-f]{32})\.txt$/.exec(row.graphPath)?.[1];
    if (!graphId) invalid("任务渲染脚本编号无效");
    let outputPath = "";
    for (let offset = 0; offset < 10; offset++) {
      const candidate = `assets/videoEditor/exports/edited${Date.now() + offset}${graphId.slice(0, 8)}.mp4`;
      if (candidate === row.outputPath) continue;
      const target = await resolveWorkspacePath(row.directory, candidate);
      const existing = await lstat(target.path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
      if (!existing) { outputPath = candidate; break; }
    }
    if (!outputPath) invalid("无法分配新的渲染输出文件名，请稍后重试");
    const output = request.calls.find(call => call.method === "output")!;
    output.args = [outputPath];
    // ACT: 重试复用原脚本和素材快照，但采用全新输出；编码从头开始，不覆盖未知产物。
    const next = await getDatabase().transaction(async tx => {
      await checkActiveLimit(tx, row.userId);
      const [current] = await tx.select().from(editorRenderJobs).where(eq(editorRenderJobs.id, row.id)).limit(1).for("update");
      if (!current || current.updatedAt.getTime() !== row.updatedAt.getTime() || !terminalStatuses.includes(current.status as typeof terminalStatuses[number])) invalid("任务状态已变化，请刷新后重试");
      const patch = { status: "queued" as const, progress: 0, outputPath, payload: { ...row.payload, request }, runtimeId: null, error: null, updatedAt: new Date() };
      await tx.update(editorRenderJobs).set(patch).where(eq(editorRenderJobs.id, row.id));
      return { ...current, ...patch };
    });
    queueMicrotask(wakeWorker);
    return publicJob(next);
  } finally { release(); }
}

async function taskDirectory(id: string, create = false) {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id)) invalid("渲染任务编号无效", 400);
  const root = resolve(getDataDirectory(), "editorRenderJobs");
  const directory = resolve(root, id);
  for (const path of [root, directory]) {
    let info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
    if (!info && create) { await mkdir(path, { mode: 0o700 }); info = await lstat(path); }
    if (!info) return null;
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path) invalid("渲染任务目录不能使用符号链接", 403);
  }
  return directory;
}

async function clearTaskTemporary(id: string, removeDirectory = false) {
  const directory = await taskDirectory(id);
  if (!directory) return;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!/^attempt[\w]+$/.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) invalid("任务临时目录包含未知内容，已保留文件");
    const path = resolve(directory, entry.name);
    if (await realpath(path) !== path) invalid("任务临时目录已变化，已保留文件");
    // ACT: 只清理已登记任务 UUID 下的 attempt 目录；不猜测或终止旧进程 PID。
    await rm(path, { recursive: true });
  }
  if (removeDirectory) await rmdir(directory);
}

export async function removeEditorRender(input: JobInput): Promise<void> {
  const row = await ownedJob(input);
  if (!terminalStatuses.includes(row.status as typeof terminalStatuses[number])) invalid("请先取消任务，再删除任务记录");
  if (activeJob?.id === row.id) invalid("渲染进程正在结束，请稍后删除");
  const helperSet = new Set(helperPaths(row.payload.request).paths);
  const helpers = row.payload.files.filter(file => file.kind === "helper");
  if (helpers.some(file => !helperSet.has(file.path)) || helpers.length !== helperSet.size) invalid("任务辅助文件快照无效，已保留记录");
  const resolved = await Promise.all(helpers.map(file => resolveWorkspacePath(row.directory, file.path)));
  const release = lockWorkspaceFiles(resolved.map(file => file.path));
  try {
    const removable: string[] = [];
    for (const helper of helpers) {
      const path = await resolveWorkspacePath(row.directory, helper.path);
      const exists = await lstat(path.path).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
      if (!exists) continue;
      const actual = await fileFingerprint(row.directory, helper.path, "helper");
      if (actual.hash !== helper.hash || actual.size !== helper.size) invalid("任务辅助文件已变化，未删除文件和任务记录");
      removable.push(path.path);
    }
    await getDatabase().transaction(async tx => {
      const [current] = await tx.select().from(editorRenderJobs).where(eq(editorRenderJobs.id, row.id)).limit(1).for("update");
      if (!current || !terminalStatuses.includes(current.status as typeof terminalStatuses[number]) || current.updatedAt.getTime() !== row.updatedAt.getTime()) invalid("任务状态已变化，请刷新后删除");
      for (const path of removable) await unlink(path);
      await clearTaskTemporary(row.id, true);
      await tx.delete(editorRenderJobs).where(eq(editorRenderJobs.id, row.id));
    });
  } finally { release(); }
}

async function backgroundAccount(row: RenderRow, signal: AbortSignal) {
  signal.throwIfAborted();
  const [user] = await getDatabase().select({ status: users.status }).from(users).where(eq(users.id, row.userId)).limit(1);
  if (user?.status !== "active") invalid("任务账户已停用，渲染已停止", 403);
  return { userId: row.userId, isRoot: await isPlatformAdmin(row.userId), signal };
}

async function verifyRenderedVideo(path: string, row: RenderRow, signal: AbortSignal) {
  const graphFile = await resolveWorkspacePath(row.directory, row.graphPath);
  const details = validateRemoteExportRequest(row.payload.request, await readFile(graphFile.path, "utf8"));
  const { tools } = await u.ffmpeg.getStatus();
  if (!tools.ffprobe.path || tools.ffprobe.error) invalid("导出校验需要可用的 FFprobe", 424);
  const before = await lstat(path);
  if (!before.isFile() || before.size < 1 || before.size > maxUploadBytes) invalid("渲染结果不存在或超过 8 GiB，未发布成片", 413);
  const child = Bun.spawn([tools.ffprobe.path, "-v", "error", "-show_streams", "-show_format", "-of", "json", path], { stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true, timeout: 30000, signal, env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "FFREPORT")) });
  const [stdout, stderr, code] = await Promise.all([child.stdout.text(), child.stderr.text(), child.exited]);
  signal.throwIfAborted();
  if (code !== 0) { console.error("渲染输出探测失败", formatAgentError(stderr.slice(0, 500))); invalid("渲染结果无法读取，未发布成片", 422); }
  const media = JSON.parse(stdout) as { streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string }[]; format?: { duration?: string; format_name?: string } };
  const video = media.streams?.find(stream => stream.codec_type === "video");
  const audio = media.streams?.find(stream => stream.codec_type === "audio");
  const [numerator, denominator = 1] = String(video?.avg_frame_rate).split("/").map(Number);
  const rate = Number(numerator) / Number(denominator);
  const duration = Number(media.format?.duration);
  if (!video || !audio || video.codec_name !== "h264" || audio.codec_name !== "aac" || video.width !== details.width || video.height !== details.height || !Number.isFinite(rate) || Math.abs(rate - details.frameRate) > .01 || !Number.isFinite(duration) || Math.abs(duration - details.duration) > Math.max(.15, 2 / details.frameRate) || !media.format?.format_name?.split(",").includes("mp4")) invalid("渲染结果的编码、画幅、帧率或时长不符合工程设置，未发布成片", 422);
}

async function runJob(row: RenderRow, controller: AbortController) {
  const signal = AbortSignal.any([controller.signal, serverSignal]);
  let release: (() => void) | undefined;
  let published = false;
  let progressQueue = Promise.resolve();
  let progressFailure: unknown;
  let lastProgress = 0;
  try {
    const account = await backgroundAccount(row, signal);
    await accountContext.run(account, async () => {
      await authorizeProjectDirectory(row.directory);
      const paths = await Promise.all([...row.payload.files.filter(file => file.kind !== "project").map(file => file.path), row.outputPath].map(path => resolveWorkspacePath(row.directory, path)));
      release = lockWorkspaceFiles(paths.map(file => file.path));
      await verifyFingerprints(row);
      const directory = await taskDirectory(row.id, true);
      if (!directory) invalid("无法创建渲染临时目录");
      const factory = await u.ffmpeg.createWorkspaceFfmpeg(row.directory, signal);
      let terminal = "";
      let terminalError: unknown;
      await u.ffmpeg.executeRemoteFfmpeg(factory, row.payload.request, event => {
        if (event.event === "end") { terminal = "end"; published = true; }
        if (event.event === "error") { terminal = "error"; terminalError = event.args[0]; }
        if (event.event !== "progress") return;
        const progress = event.args[0] as { timemark?: string };
        const seconds = String(progress?.timemark).split(":").map(Number).reduce((total, part) => total * 60 + part, 0);
        const duration = validateRemoteExportRequest(row.payload.request).duration;
        const value = Math.min(97, Math.max(0, Math.round(seconds / duration * 97)));
        if (!Number.isFinite(value) || value <= lastProgress) return;
        lastProgress = value;
        progressQueue = progressQueue.then(async () => {
          await getDatabase().update(editorRenderJobs).set({ progress: value, updatedAt: new Date() }).where(and(eq(editorRenderJobs.id, row.id), eq(editorRenderJobs.status, "running")));
        }).catch(error => { progressFailure = error; controller.abort(new Error("渲染进度无法持久化")); });
      }, signal, { temporaryDirectory: directory, beforePublish: async renderedPath => {
        await verifyRenderedVideo(renderedPath, row, signal);
        const currentAccount = await backgroundAccount(row, signal);
        await accountContext.run(currentAccount, async () => {
          await authorizeProjectDirectory(row.directory);
          await verifyFingerprints(row);
          const [current] = await getDatabase().select({ status: editorRenderJobs.status }).from(editorRenderJobs).where(eq(editorRenderJobs.id, row.id)).limit(1);
          if (current?.status !== "running") invalid("任务已取消，未发布成片");
        });
      } });
      await progressQueue;
      if (progressFailure) throw progressFailure;
      signal.throwIfAborted();
      if (terminal !== "end") {
        console.error("后台渲染命令失败", { jobId: row.id, error: formatAgentError(JSON.stringify(terminalError ?? "缺少完成事件")) });
        invalid("渲染失败，请检查素材和导出设置后重试");
      }
    });
  } catch (error) {
    await progressQueue;
    const [current] = await getDatabase().select({ status: editorRenderJobs.status }).from(editorRenderJobs).where(eq(editorRenderJobs.id, row.id)).limit(1);
    const status = current?.status === "cancelled" ? "cancelled" : serverSignal.aborted || published ? "interrupted" : "failed";
    const message = status === "cancelled" ? "已取消渲染" : published ? "成片可能已生成，但完成状态未确认；重试将创建新的输出文件" : serverSignal.aborted ? "服务连接中断，任务可从头重试" : failureMessage(error);
    if (current?.status === "running" || current?.status === "cancelled") await getDatabase().update(editorRenderJobs).set({ status, error: message, updatedAt: new Date() }).where(eq(editorRenderJobs.id, row.id));
    console.error("持久渲染任务结束", { jobId: row.id, status, message, error: formatAgentError(error instanceof Error ? error.message : String(error)) });
  } finally { release?.(); }
  // 保持 running 直到登记尝试结束，避免前端看到 succeeded 后与此处同时锁定工程和成片。
  const [ready] = await getDatabase().select({ status: editorRenderJobs.status }).from(editorRenderJobs).where(eq(editorRenderJobs.id, row.id)).limit(1);
  if (ready?.status !== "running") return;
  let recordError: string | undefined;
  if (!serverSignal.aborted) {
    try {
      const account = await backgroundAccount(row, signal);
      await accountContext.run(account, async () => {
        const project = await resolveWorkspacePath(row.directory, row.projectPath);
        // 工程已变更时仍保留有效成片，由前端在当前版本匹配时手动登记。
        if (await workspaceFileRevision(project.path) !== row.revision) return;
        await recordEditorExport({ directory: row.directory, projectPath: row.projectPath, revision: row.revision, exportPath: row.outputPath });
      });
    } catch (error) {
      recordError = "成片已生成，但导出记录未自动保存；可在当前工程中手动登记";
      console.error("渲染完成但登记记录未保存", { jobId: row.id, error: formatAgentError(error instanceof Error ? error.message : String(error)) });
    }
  }
  const [current] = await getDatabase().select({ status: editorRenderJobs.status }).from(editorRenderJobs).where(eq(editorRenderJobs.id, row.id)).limit(1);
  if (current?.status === "running") {
    await getDatabase().update(editorRenderJobs).set({ status: serverSignal.aborted ? "interrupted" : "succeeded", progress: serverSignal.aborted ? row.progress : 100, error: serverSignal.aborted ? "服务连接中断，任务可从头重试" : recordError ?? null, updatedAt: new Date() }).where(and(eq(editorRenderJobs.id, row.id), eq(editorRenderJobs.status, "running")));
  }
}

async function drainQueue() {
  if (!initialized || draining || serverSignal.aborted || !hasServerLease()) return;
  draining = true;
  try {
    while (!serverSignal.aborted && hasServerLease()) {
      const row = await getDatabase().transaction(async tx => {
        const [next] = await tx.select().from(editorRenderJobs).where(eq(editorRenderJobs.status, "queued")).orderBy(asc(editorRenderJobs.createdAt), asc(editorRenderJobs.id)).limit(1).for("update");
        if (!next) return;
        const patch = { status: "running" as const, runtimeId: serverInstanceId, error: null, updatedAt: new Date() };
        await tx.update(editorRenderJobs).set(patch).where(eq(editorRenderJobs.id, next.id));
        return { ...next, ...patch };
      });
      if (!row) return;
      const controller = new AbortController();
      const done = runJob(row, controller);
      activeJob = { id: row.id, controller, done };
      try { await done; }
      finally { if (activeJob?.id === row.id) activeJob = undefined; }
    }
  } finally { draining = false; }
}

function wakeWorker() {
  void drainQueue().catch(error => console.error("后台渲染调度失败", formatAgentError(error instanceof Error ? error.message : String(error))));
}

export async function initializeEditorRenderRuntime() {
  if (initialized) return;
  await getDatabase().update(editorRenderJobs).set({ status: "interrupted", error: "服务已重启，任务可从头重试；原输出文件会保留", updatedAt: new Date() }).where(eq(editorRenderJobs.status, "running"));
  const jobs = await getDatabase().select().from(editorRenderJobs);
  for (const row of jobs) {
    try { await clearTaskTemporary(row.id); }
    catch (error) {
      const message = "旧渲染临时文件仍被占用或无法清理，已保留文件；释放占用后可重试或删除任务";
      await getDatabase().update(editorRenderJobs).set({ status: row.status === "queued" ? "interrupted" : row.status, error: message, updatedAt: new Date() }).where(eq(editorRenderJobs.id, row.id));
      console.error("渲染临时文件保留", { jobId: row.id, error: formatAgentError(error instanceof Error ? error.message : String(error)) });
    }
  }
  initialized = true;
  const timer = setInterval(wakeWorker, 2000);
  timer.unref();
  serverSignal.addEventListener("abort", () => { clearInterval(timer); activeJob?.controller.abort(serverSignal.reason); }, { once: true });
  wakeWorker();
}

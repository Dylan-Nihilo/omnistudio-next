import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, lstat, readFile, readdir, realpath, rename, rm, statfs, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { authorizeProjectDirectory } from "@/services/accountService";
import { requireAccount } from "@/utils/accountContext";
import { getStatus } from "@/utils/ffmpeg";
import { lockWorkspaceFiles, resolveWorkspacePath } from "@/utils/workspace/files";
import { acquireConcurrency } from "@/lib/concurrency";

type FileStamp = { size: number; mtimeMs: number; ctimeMs: number };
type CacheFile = FileStamp & { sha256: string };
type CacheManifest = {
  version: 1;
  sourcePathHash: string;
  sourceHash: string;
  sourceStamp: FileStamp;
  kind: "video" | "audio";
  duration: number;
  hasAudio: boolean;
  proxy?: CacheFile;
  thumbnails?: CacheFile;
  waveform?: CacheFile;
  thumbnailStep?: number;
  thumbnailCount?: number;
  samplesPerPeak?: number;
  peaks?: number[];
};
type CacheIndex = { version: 1; sourcePathHash: string; sourceStamp: FileStamp; sourceHash: string; key: string };

const cacheVersion = "proxy-720p-v1";
const proxyMaxBytes = 2 * 1024 ** 3;
const thumbnailMaxBytes = 16 * 1024 ** 2;
const inFlight = new Map<string, { controller: AbortController; promise: Promise<unknown> }>();

function mediaSpaceEstimate(size: number, kind: "video" | "audio") {
  if (kind === "audio") return 4 * 1024 ** 2;
  return Math.min(proxyMaxBytes, Math.max(64 * 1024 ** 2, size * 2)) + thumbnailMaxBytes + 1024 ** 2;
}

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function fileStamp(info: Awaited<ReturnType<typeof lstat>>): FileStamp {
  return { size: Number(info.size), mtimeMs: Number(info.mtimeMs), ctimeMs: Number(info.ctimeMs) };
}

function sameStamp(left: FileStamp, right: FileStamp) {
  return left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function cacheKey(sourceHash: string, sourcePathHash: string, stamp: FileStamp) {
  return sha256(`${sourceHash}:${sourcePathHash}:${stamp.size}:${stamp.mtimeMs}:${stamp.ctimeMs}:${cacheVersion}`);
}

function waitForCaller<T>(promise: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException("缓存请求已取消", "AbortError"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException("缓存请求已取消", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}

function relativeCachePaths(key: string, manifest: CacheManifest) {
  const base = `assets/videoEditor/cache/${key}`;
  return {
    key,
    ...(manifest.proxy ? { proxyPath: `${base}/proxy.mp4`, proxyHash: manifest.proxy.sha256 } : {}),
    ...(manifest.thumbnails ? {
      thumbnails: {
        path: `${base}/thumbnails.jpg`, hash: manifest.thumbnails.sha256, width: 160, height: 90,
        columns: 8, rows: 16, count: manifest.thumbnailCount, step: manifest.thumbnailStep, padding: 2, margin: 2,
      },
    } : {}),
    ...(manifest.waveform ? {
      waveform: { path: `${base}/waveform.json`, hash: manifest.waveform.sha256, sampleRate: 8000, samplesPerPeak: manifest.samplesPerPeak, peaks: manifest.peaks },
    } : {}),
    duration: manifest.duration,
    hasAudio: manifest.hasAudio,
    kind: manifest.kind,
  };
}

async function ensureDirectory(directory: string, relativePath: string) {
  let current = directory;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (info?.isSymbolicLink()) invalid("剪辑缓存目录不能包含符号链接", 403);
    if (!info) await mkdir(current, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const after = await lstat(current);
    if (!after.isDirectory() || await realpath(current) !== current) invalid("剪辑缓存目录不能包含符号链接", 403);
  }
  return current;
}

async function hasSafeDirectory(directory: string, relativePath: string) {
  let current = directory;
  for (const segment of relativePath.split("/")) {
    current = resolve(current, segment);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!info) return false;
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(current) !== current) invalid("剪辑缓存目录不能包含符号链接", 403);
  }
  return true;
}

function assertMediaSourcePath(path: string) {
  const prefix = "assets/videoEditor/media/";
  if (!path.startsWith(prefix) || !path.slice(prefix.length) || path.slice(prefix.length).includes("/")) invalid("缓存只支持剪辑台固定素材目录中的文件", 403);
}

async function resolveSource(directory: string, path: string) {
  assertMediaSourcePath(path);
  if (!await hasSafeDirectory(directory, "assets/videoEditor/media")) invalid("剪辑台固定素材目录不存在", 404);
  const source = await resolveWorkspacePath(directory, path);
  const info = await lstat(source.path);
  if (!info.isFile() || info.size < 1 || info.size > 8 * 1024 ** 3) invalid("缓存源素材必须为 8 GiB 以内的普通文件", 413);
  return { path: source.path, stamp: fileStamp(info), sourcePathHash: sha256(path) };
}

async function readJson<T>(path: string, maxBytes = 2 * 1024 * 1024): Promise<T | undefined> {
  try {
    const info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) return undefined;
    return JSON.parse(await readFile(path, "utf8")) as T;
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

async function readBytes(stream: ReadableStream<Uint8Array> | null, limit: number, child: ReturnType<typeof Bun.spawn>) {
  if (!stream) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > limit) {
      child.kill("SIGKILL");
      throw new Error("媒体探测结果超过大小限制");
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size);
}

async function readTextLimited(stream: ReadableStream<Uint8Array> | null, limit: number) {
  if (!stream) return "";
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    if (size >= limit) continue;
    const value = Buffer.from(chunk).subarray(0, limit - size);
    chunks.push(value);
    size += value.byteLength;
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

async function hashFile(path: string, signal: AbortSignal) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal })) {
    signal.throwIfAborted();
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function runTool(path: string, args: string[], signal: AbortSignal, maxOutputBytes = 1024 * 1024) {
  const child = Bun.spawn([path, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true, signal });
  try {
    const [stdout, stderr, exitCode] = await Promise.all([readBytes(child.stdout, maxOutputBytes, child), readTextLimited(child.stderr, 32 * 1024), child.exited]);
    signal.throwIfAborted();
    if (exitCode !== 0) throw Object.assign(new Error(stderr.slice(0, 500) || "FFmpeg 媒体处理失败"), { status: 422 });
    return stdout;
  } catch (error) {
    try { child.kill("SIGKILL"); } catch { /* 子进程可能已退出 */ }
    await child.exited.catch(() => {});
    throw error;
  }
}

async function inspectMedia(ffprobePath: string, path: string, signal: AbortSignal) {
  const output = await runTool(ffprobePath, ["-v", "error", "-protocol_whitelist", "file", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path], signal);
  let result: { format?: { duration?: string }; streams?: { codec_type?: string }[] };
  try { result = JSON.parse(output.toString("utf8")); }
  catch { invalid("无法读取素材媒体信息", 422); }
  const duration = Number(result.format?.duration);
  const hasVideo = result.streams?.some(stream => stream.codec_type === "video") ?? false;
  const hasAudio = result.streams?.some(stream => stream.codec_type === "audio") ?? false;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400 || !hasVideo && !hasAudio) invalid("缓存素材的音视频流或时长无效", 422);
  return { duration, kind: hasVideo ? "video" as const : "audio" as const, hasAudio };
}

async function makeWaveform(ffmpegPath: string, sourcePath: string, outputPath: string, duration: number, signal: AbortSignal) {
  const sampleRate = 8000;
  const samplesPerPeak = Math.max(1, Math.ceil(duration * sampleRate / 10000));
  const peaks: number[] = [];
  let peak = 0;
  let samplesInPeak = 0;
  let lowByte: number | undefined;
  const child = Bun.spawn([ffmpegPath, "-nostdin", "-v", "error", "-protocol_whitelist", "file", "-i", sourcePath, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "s16le", "pipe:1"], {
    stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true, signal,
  });
  const stderrPromise = readTextLimited(child.stderr, 32 * 1024);
  try {
    for await (const chunk of child.stdout!) {
      signal.throwIfAborted();
      const bytes = Buffer.from(chunk);
      let index = 0;
      if (lowByte !== undefined && bytes.length) {
        const sample = (lowByte | bytes[0]! << 8) << 16 >> 16;
        peak = Math.max(peak, Math.abs(sample) / 32768);
        samplesInPeak++;
        lowByte = undefined;
        index = 1;
      }
      for (; index + 1 < bytes.length; index += 2) {
        const sample = bytes.readInt16LE(index);
        peak = Math.max(peak, Math.abs(sample) / 32768);
        if (++samplesInPeak >= samplesPerPeak) {
          peaks.push(Number(peak.toFixed(5)));
          if (peaks.length > 10000) invalid("音频波形样本数量无效", 422);
          peak = 0;
          samplesInPeak = 0;
        }
      }
      if (index < bytes.length) lowByte = bytes[index];
    }
    if (samplesInPeak) peaks.push(Number(peak.toFixed(5)));
    const [stderr, exitCode] = await Promise.all([stderrPromise, child.exited]);
    signal.throwIfAborted();
    if (exitCode !== 0) throw Object.assign(new Error(stderr.slice(0, 500) || "音频波形生成失败"), { status: 422 });
    if (!peaks.length) invalid("音频波形样本数量无效", 422);
    await writeFile(outputPath, JSON.stringify({ duration, sampleRate, samplesPerPeak, peaks }), { flag: "wx", mode: 0o600, signal });
    return { samplesPerPeak, peaks };
  } catch (error) {
    child.kill("SIGKILL");
    await child.exited.catch(() => {});
    throw error;
  }
}

async function stampOutput(path: string, limit: number, signal: AbortSignal): Promise<CacheFile> {
  const info = await lstat(path);
  if (!info.isFile() || info.size < 1 || info.size > limit) invalid("缓存产物为空或超过大小限制", 413);
  return { ...fileStamp(info), sha256: await hashFile(path, signal) };
}

async function saveJsonAtomic(path: string, value: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value), { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  }
}

function isCacheIndex(value: unknown): value is CacheIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const index = value as Partial<CacheIndex>;
  return index.version === 1 && typeof index.sourcePathHash === "string" && /^[\da-f]{64}$/.test(index.sourcePathHash)
    && typeof index.sourceHash === "string" && /^[\da-f]{64}$/.test(index.sourceHash)
    && typeof index.key === "string" && /^[\da-f]{64}$/.test(index.key)
    && !!index.sourceStamp && Number.isSafeInteger(index.sourceStamp.size)
    && Number.isFinite(index.sourceStamp.mtimeMs) && Number.isFinite(index.sourceStamp.ctimeMs);
}

function isCacheManifest(value: unknown): value is CacheManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Partial<CacheManifest>;
  return manifest.version === 1 && typeof manifest.sourcePathHash === "string" && /^[\da-f]{64}$/.test(manifest.sourcePathHash)
    && typeof manifest.sourceHash === "string" && /^[\da-f]{64}$/.test(manifest.sourceHash)
    && !!manifest.sourceStamp && Number.isSafeInteger(manifest.sourceStamp.size)
    && Number.isFinite(manifest.sourceStamp.mtimeMs) && Number.isFinite(manifest.sourceStamp.ctimeMs)
    && (manifest.kind === "video" || manifest.kind === "audio") && typeof manifest.duration === "number" && Number.isFinite(manifest.duration) && manifest.duration > 0 && manifest.duration <= 86400
    && typeof manifest.hasAudio === "boolean"
    && (manifest.kind !== "video" || isCacheFile(manifest.proxy) && isCacheFile(manifest.thumbnails)
      && typeof manifest.thumbnailCount === "number" && Number.isSafeInteger(manifest.thumbnailCount) && manifest.thumbnailCount >= 1 && manifest.thumbnailCount <= 128
      && typeof manifest.thumbnailStep === "number" && Number.isFinite(manifest.thumbnailStep) && manifest.thumbnailStep > 0)
    && (!manifest.hasAudio || isCacheFile(manifest.waveform) && typeof manifest.samplesPerPeak === "number" && Number.isSafeInteger(manifest.samplesPerPeak) && manifest.samplesPerPeak >= 1
      && Array.isArray(manifest.peaks) && manifest.peaks.length > 0 && manifest.peaks.length <= 10000 && manifest.peaks.every(peak => typeof peak === "number" && Number.isFinite(peak) && peak >= 0 && peak <= 1));
}

function isCacheFile(value: unknown): value is CacheFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const file = value as Partial<CacheFile>;
  return typeof file.size === "number" && Number.isSafeInteger(file.size) && file.size > 0
    && typeof file.mtimeMs === "number" && Number.isFinite(file.mtimeMs) && typeof file.ctimeMs === "number" && Number.isFinite(file.ctimeMs)
    && typeof file.sha256 === "string" && /^[\da-f]{64}$/.test(file.sha256);
}

async function readCurrent(directory: string, path: string, stamp: FileStamp) {
  const cacheRoot = resolve(directory, "assets/videoEditor/cache");
  const sourcePathHash = sha256(path);
  const indexDirectory = resolve(cacheRoot, "index");
  if (!await hasSafeDirectory(directory, "assets/videoEditor/cache/index")) return { state: "missing" as const, sourcePathHash, indexPath: resolve(indexDirectory, `${sourcePathHash}.json`), cacheRoot };
  const indexInfo = await lstat(indexDirectory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
  if (!indexInfo) return { state: "missing" as const, sourcePathHash, indexPath: resolve(indexDirectory, `${sourcePathHash}.json`), cacheRoot };
  if (!indexInfo.isDirectory() || indexInfo.isSymbolicLink() || await realpath(indexDirectory) !== indexDirectory) invalid("剪辑缓存索引目录无效", 403);
  const indexPath = resolve(indexDirectory, `${sourcePathHash}.json`);
  const rawIndex = await readJson<unknown>(indexPath);
  if (!isCacheIndex(rawIndex) || rawIndex.sourcePathHash !== sourcePathHash) return { state: "missing" as const, sourcePathHash, indexPath, cacheRoot };
  const key = rawIndex.key;
  if (key !== cacheKey(rawIndex.sourceHash, sourcePathHash, rawIndex.sourceStamp)) return { state: "stale" as const, sourcePathHash, indexPath, cacheRoot, key };
  if (!sameStamp(stamp, rawIndex.sourceStamp)) return { state: "stale" as const, sourcePathHash, indexPath, cacheRoot, key, sourceHash: rawIndex.sourceHash };
  const cacheDirectory = resolve(cacheRoot, key);
  const rawManifest = await readCacheDirectory(cacheDirectory, sourcePathHash, rawIndex.sourceHash, stamp);
  if (!rawManifest) return { state: "stale" as const, sourcePathHash, indexPath, cacheRoot, key, sourceHash: rawIndex.sourceHash };
  return { state: "ready" as const, sourcePathHash, indexPath, cacheRoot, key, sourceHash: rawIndex.sourceHash, manifest: rawManifest };
}

async function readCacheDirectory(cacheDirectory: string, sourcePathHash: string, sourceHash: string, stamp: FileStamp) {
  const cacheInfo = await lstat(cacheDirectory).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
  if (!cacheInfo) return undefined;
  if (cacheInfo.isSymbolicLink() || !cacheInfo.isDirectory() || await realpath(cacheDirectory) !== cacheDirectory) invalid("剪辑缓存目录不能包含符号链接", 403);
  const rawManifest = await readJson<unknown>(resolve(cacheDirectory, "manifest.json"));
  if (!isCacheManifest(rawManifest) || rawManifest.sourcePathHash !== sourcePathHash || rawManifest.sourceHash !== sourceHash || !sameStamp(rawManifest.sourceStamp, stamp)) return undefined;
  for (const [name, output] of [["proxy.mp4", rawManifest.proxy], ["thumbnails.jpg", rawManifest.thumbnails], ["waveform.json", rawManifest.waveform]] as const) {
    if (!output) continue;
    const info = await lstat(resolve(cacheDirectory, name)).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
    if (!info?.isFile() || info.isSymbolicLink() || info.size !== output.size || info.mtimeMs !== output.mtimeMs || info.ctimeMs !== output.ctimeMs) return undefined;
  }
  return rawManifest;
}

export async function statusEditorMediaCache(input: { directory: string; path: string }) {
  const directory = await authorizeProjectDirectory(input.directory);
  const source = await resolveSource(directory, input.path);
  const cached = await readCurrent(directory, input.path, source.stamp);
  const busy = inFlight.has(`${directory}\0${input.path}`);
  if (busy) return { state: "processing", ...(cached.key ? { key: cached.key } : {}) };
  if (cached.state !== "ready") return { state: cached.state, ...(cached.key ? { key: cached.key } : {}), ...(cached.sourceHash ? { sourceHash: cached.sourceHash } : {}) };
  return { state: "ready", sourceHash: cached.sourceHash, ...relativeCachePaths(cached.key, cached.manifest) };
}

export async function prepareEditorMediaCache(input: { directory: string; path: string }, signal: AbortSignal) {
  const account = requireAccount();
  if (account.signal) signal = AbortSignal.any([account.signal, signal]);
  signal.throwIfAborted();
  const directory = await authorizeProjectDirectory(input.directory);
  const source = await resolveSource(directory, input.path);
  const identity = `${directory}\0${input.path}`;
  const current = inFlight.get(identity);
  if (current) return await waitForCaller(current.promise, signal);

  const controller = new AbortController();
  const jobSignal = AbortSignal.any([signal, controller.signal]);
  const job = { controller, promise: Promise.resolve<unknown>(undefined) };
  job.promise = prepare(directory, input.path, source, jobSignal);
  inFlight.set(identity, job);
  try { return await job.promise; }
  finally { if (inFlight.get(identity) === job) inFlight.delete(identity); }
}

export async function cancelEditorMediaCache(input: { directory: string; path: string }) {
  const directory = await authorizeProjectDirectory(input.directory);
  assertMediaSourcePath(input.path);
  const identity = `${directory}\0${input.path}`;
  const job = inFlight.get(identity);
  if (!job) return { cancelled: false };
  job.controller.abort(new DOMException("缓存生成已取消", "AbortError"));
  await job.promise.catch(() => {});
  return { cancelled: true };
}

async function prepare(directory: string, relativePath: string, source: { path: string; stamp: FileStamp; sourcePathHash: string }, signal: AbortSignal) {
  const release = lockWorkspaceFiles([source.path]);
  let concurrencyRelease: (() => void) | undefined;
  let temporary: string | undefined;
  let publishedDirectory: string | undefined;
  let indexWritten = false;
  try {
    concurrencyRelease = acquireConcurrency("ffmpeg");
    signal.throwIfAborted();
    const initial = await lstat(source.path);
    if (!sameStamp(fileStamp(initial), source.stamp)) invalid("缓存源素材已变化，请重新准备", 409);
    const sourceHash = await hashFile(source.path, signal);
    const afterHash = await lstat(source.path);
    if (!sameStamp(fileStamp(afterHash), source.stamp)) invalid("缓存源素材在读取期间发生变化，请重试", 409);
    const key = cacheKey(sourceHash, source.sourcePathHash, source.stamp);
    const cacheRoot = await ensureDirectory(directory, "assets/videoEditor/cache");
    const indexDirectory = await ensureDirectory(directory, "assets/videoEditor/cache/index");
    const cached = await readCurrent(directory, relativePath, source.stamp);
    if (cached.state === "ready" && cached.sourceHash === sourceHash) return { state: "ready", sourceHash, ...relativeCachePaths(cached.key, cached.manifest) };
    const { tools } = await getStatus();
    if (!tools.ffmpeg.path || tools.ffmpeg.error || !tools.ffprobe.path || tools.ffprobe.error) invalid("生成剪辑缓存需要可用的 FFmpeg 与 FFprobe", 424);
    const media = await inspectMedia(tools.ffprobe.path, source.path, signal);
    const freeSpace = await statfs(cacheRoot);
    const availableBytes = Number(freeSpace.bavail) * Number(freeSpace.bsize);
    const neededBytes = mediaSpaceEstimate(source.stamp.size, media.kind);
    if (!Number.isFinite(availableBytes) || availableBytes < neededBytes) invalid("磁盘空间不足，无法生成剪辑缓存", 507);
    const temporaryName = `.tmp-${randomUUID()}`;
    temporary = resolve(cacheRoot, temporaryName);
    await mkdir(temporary, { mode: 0o700 });
    const manifest: CacheManifest = { version: 1, sourcePathHash: source.sourcePathHash, sourceHash, sourceStamp: source.stamp, ...media };
    if (media.kind === "video") {
      const proxyPath = resolve(temporary, "proxy.mp4");
      await runTool(tools.ffmpeg.path, [
        "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file", "-i", source.path,
        "-map", "0:v:0", "-map", "0:a:0?", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-threads", "2", "-c:a", "aac", "-b:a", "128k", "-fs", String(proxyMaxBytes), "-movflags", "+faststart", proxyPath,
      ], signal, 1);
      manifest.proxy = await stampOutput(proxyPath, proxyMaxBytes, signal);
      const proxyProbe = await inspectMedia(tools.ffprobe.path, proxyPath, signal);
      if (proxyProbe.kind !== "video" || Math.abs(proxyProbe.duration - media.duration) > Math.max(0.15, 2 / 24) || proxyProbe.hasAudio !== media.hasAudio) invalid("代理视频未完整覆盖源素材", 422);
      const thumbnailStep = Math.max(1, Math.ceil(media.duration / 128 * 100) / 100);
      const thumbnailCount = Math.min(128, Math.max(1, Math.ceil(media.duration / thumbnailStep)));
      const thumbnailPath = resolve(temporary, "thumbnails.jpg");
      await runTool(tools.ffmpeg.path, [
        "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file", "-i", source.path,
        "-vf", `fps=1/${thumbnailStep},scale=160:90:force_original_aspect_ratio=decrease,pad=160:90:(ow-iw)/2:(oh-ih)/2,tile=8x16:nb_frames=128:padding=2:margin=2:color=black`,
        "-frames:v", "1", "-an", "-q:v", "4", thumbnailPath,
      ], signal, 1);
      manifest.thumbnails = await stampOutput(thumbnailPath, thumbnailMaxBytes, signal);
      manifest.thumbnailStep = thumbnailStep;
      manifest.thumbnailCount = thumbnailCount;
    }
    if (media.hasAudio) {
      const waveformPath = resolve(temporary, "waveform.json");
      const waveform = await makeWaveform(tools.ffmpeg.path, source.path, waveformPath, media.duration, signal);
      manifest.waveform = await stampOutput(waveformPath, 1024 * 1024, signal);
      manifest.samplesPerPeak = waveform.samplesPerPeak;
      manifest.peaks = waveform.peaks;
    }
    signal.throwIfAborted();
    const finalInfo = await lstat(source.path);
    if (!sameStamp(fileStamp(finalInfo), source.stamp)) invalid("缓存源素材在生成期间发生变化，请重试", 409);
    await saveJsonAtomic(resolve(temporary, "manifest.json"), manifest);
    const destination = resolve(cacheRoot, key);
    const existing = await lstat(destination).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error; });
    if (existing) {
      if (!existing.isDirectory() || existing.isSymbolicLink()) invalid("剪辑缓存目录无效", 409);
      if (await readCacheDirectory(destination, source.sourcePathHash, sourceHash, source.stamp)) {
        await rm(temporary, { recursive: true, force: true });
        temporary = undefined;
      } else {
        const backup = `${destination}.invalid-${randomUUID()}`;
        await rename(destination, backup);
        try { await rename(temporary, destination); }
        catch (error) {
          await rename(backup, destination).catch(() => {});
          throw error;
        }
        temporary = undefined;
        publishedDirectory = destination;
        await rm(backup, { recursive: true, force: true }).catch(error => console.error("清理损坏的剪辑缓存失败", error));
      }
    } else {
      await rename(temporary, destination);
      temporary = undefined;
      publishedDirectory = destination;
    }
    const index: CacheIndex = { version: 1, sourcePathHash: source.sourcePathHash, sourceStamp: source.stamp, sourceHash, key };
    await saveJsonAtomic(resolve(indexDirectory, `${source.sourcePathHash}.json`), index);
    indexWritten = true;
    signal.throwIfAborted();
    const ready = await readCurrent(directory, relativePath, source.stamp);
    if (ready.state !== "ready") invalid("剪辑缓存生成后校验失败", 409);
    signal.throwIfAborted();
    return { state: "ready", sourceHash, ...relativeCachePaths(key, ready.manifest) };
  } catch (error) {
    if (publishedDirectory) await rm(publishedDirectory, { recursive: true, force: true }).catch(() => {});
    if (indexWritten) {
      const indexPath = resolve(directory, "assets/videoEditor/cache/index", `${source.sourcePathHash}.json`);
      const current = await readJson<unknown>(indexPath).catch(() => undefined);
      if (isCacheIndex(current) && current.sourcePathHash === source.sourcePathHash && current.key === cacheKey(current.sourceHash, current.sourcePathHash, current.sourceStamp)) {
        await unlink(indexPath).catch((cleanupError: NodeJS.ErrnoException) => { if (cleanupError.code !== "ENOENT") console.error("清理已取消的剪辑缓存索引失败", cleanupError); });
      }
    }
    throw error;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true }).catch(() => {});
    concurrencyRelease?.();
    release();
  }
}

export async function clearEditorMediaCache(input: { directory: string; path: string }) {
  const directory = await authorizeProjectDirectory(input.directory);
  const source = await resolveSource(directory, input.path);
  const release = lockWorkspaceFiles([source.path]);
  try {
  const cacheRoot = resolve(directory, "assets/videoEditor/cache");
  const indexDirectory = await ensureDirectory(directory, "assets/videoEditor/cache/index");
  const indexPath = resolve(indexDirectory, `${source.sourcePathHash}.json`);
  const rawIndex = await readJson<unknown>(indexPath);
  const key = isCacheIndex(rawIndex) && rawIndex.sourcePathHash === source.sourcePathHash && rawIndex.key === cacheKey(rawIndex.sourceHash, rawIndex.sourcePathHash, rawIndex.sourceStamp) ? rawIndex.key : undefined;
  const entries = await readdir(cacheRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return []; throw error; });
  const keys = new Set(key ? [key] : []);
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[\da-f]{64}$/.test(entry.name)) continue;
    const cacheDirectory = resolve(cacheRoot, entry.name);
    if (await realpath(cacheDirectory) !== cacheDirectory) invalid("剪辑缓存目录不能包含符号链接", 403);
    const manifest = await readJson<unknown>(resolve(cacheDirectory, "manifest.json"));
    if (isCacheManifest(manifest) && manifest.sourcePathHash === source.sourcePathHash) keys.add(entry.name);
  }
  for (const cacheKeyValue of keys) await rm(resolve(cacheRoot, cacheKeyValue), { recursive: true, force: true });
  await unlink(indexPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
  return { cleared: keys.size > 0, key, removed: keys.size };
  } finally { release(); }
}

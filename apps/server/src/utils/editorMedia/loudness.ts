import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { extname } from "node:path";
import { acquireConcurrency } from "@/lib/concurrency";
import { authorizeProjectDirectory } from "@/services/accountService";
import { requireAccount } from "@/utils/accountContext";
import { getStatus } from "@/utils/ffmpeg";
import { lockWorkspaceFiles, resolveWorkspacePath } from "@/utils/workspace/files";

type AudioInput = { directory: string; path: string; inPoint: number; outPoint: number; speed: number; targetLufs: number };
const mediaFormats = "mov,matroska,webm,mp3,wav,aac,ogg,flac";

function invalid(message: string, status = 422): never {
  throw Object.assign(new Error(message), { status });
}

async function hashFile(path: string, signal: AbortSignal) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal })) {
    signal.throwIfAborted();
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function readOutput(stream: ReadableStream<Uint8Array>, child: ReturnType<typeof Bun.spawn>) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > 1024 ** 2) { child.kill("SIGKILL"); invalid("响度分析输出超过限制"); }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, size).toString("utf8");
}

async function runTool(path: string, args: string[], signal: AbortSignal) {
  signal.throwIfAborted();
  const child = Bun.spawn([path, ...args], {
    stdin: "ignore", stdout: "pipe", stderr: "pipe", windowsHide: true, signal,
    env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "FFREPORT")),
  });
  try {
    const [stdout, stderr, code] = await Promise.all([readOutput(child.stdout!, child), readOutput(child.stderr!, child), child.exited]);
    signal.throwIfAborted();
    if (code !== 0) invalid("无法分析素材音轨，请确认音频编码受支持且文件完整");
    return { stdout, stderr };
  } catch (error) {
    try { child.kill("SIGKILL"); } catch { /* 子进程可能已退出 */ }
    await child.exited.catch(() => {});
    throw error;
  }
}

function sameFile(left: Awaited<ReturnType<typeof lstat>>, right: Awaited<ReturnType<typeof lstat>>) {
  return right.isFile() && !right.isSymbolicLink() && left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

export async function analyzeEditorAudio(input: AudioInput, callerSignal: AbortSignal) {
  const account = requireAccount();
  const timeout = AbortSignal.timeout(10 * 60 * 1000);
  const signal = AbortSignal.any([callerSignal, timeout, ...(account.signal ? [account.signal] : [])]);
  let releaseFile: (() => void) | undefined;
  let releaseConcurrency: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    if (![input.inPoint, input.outPoint, input.speed, input.targetLufs].every(Number.isFinite) || input.inPoint < 0 || input.outPoint > 86400 || input.outPoint <= input.inPoint || input.speed < .25 || input.speed > 4 || input.targetLufs < -24 || input.targetLufs > -9) invalid("响度分析区间、速度或目标无效", 400);
    if (!/\.(mp4|mov|m4v|webm|mkv|mp3|wav|m4a|aac|ogg|flac|oga|opus)$/i.test(extname(input.path))) invalid("此文件格式不支持音频响度分析", 400);
    const directory = await authorizeProjectDirectory(input.directory);
    const source = await resolveWorkspacePath(directory, input.path);
    releaseFile = lockWorkspaceFiles([source.path]);
    const before = await lstat(source.path);
    if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > 8 * 1024 ** 3) invalid("响度分析需要 8 GiB 以内的普通媒体文件", 413);
    releaseConcurrency = acquireConcurrency("ffmpeg");
    const { tools } = await getStatus();
    if (!tools.ffmpeg.path || tools.ffmpeg.error || !tools.ffprobe.path || tools.ffprobe.error) invalid("响度分析需要可用的 FFmpeg 与 FFprobe，请先完成工具配置", 424);
    const hash = await hashFile(source.path, signal);
    const probe = await runTool(tools.ffprobe.path, ["-v", "error", "-protocol_whitelist", "file", "-format_whitelist", mediaFormats, "-select_streams", "a:0", "-show_entries", "stream=codec_type,duration:format=duration", "-of", "json", source.path], signal);
    let media: { streams?: { codec_type?: string; duration?: string }[]; format?: { duration?: string } };
    try { media = JSON.parse(probe.stdout); }
    catch { invalid("素材音轨信息无效"); }
    const audio = media.streams?.find(stream => stream.codec_type === "audio");
    const streamDuration = Number(audio?.duration);
    const duration = Number.isFinite(streamDuration) && streamDuration > 0 ? streamDuration : Number(media.format?.duration);
    if (!audio || !Number.isFinite(duration) || duration <= 0 || duration > 86400) invalid("素材没有可测量的音轨或时长无效");
    if (input.outPoint > duration + .000001) invalid("分析区间超过音轨实际时长");
    const tempo = input.speed < .5 ? `atempo=0.5,atempo=${input.speed / .5}` : input.speed > 2 ? `atempo=2,atempo=${input.speed / 2}` : `atempo=${input.speed}`;
    // ACT: 测量片段源音轨并给出恒定增益，不动态压缩；真峰值限制优先于目标响度。
    const measured = await runTool(tools.ffmpeg.path, ["-nostdin", "-hide_banner", "-nostats", "-v", "info", "-protocol_whitelist", "file", "-format_whitelist", mediaFormats, "-i", source.path, "-map", "0:a:0", "-vn", "-sn", "-dn", "-af", `atrim=start=${input.inPoint}:end=${input.outPoint},asetpts=PTS-STARTPTS,aresample=48000,astats=measure_perchannel=none:measure_overall=Number_of_samples,${tempo},aformat=channel_layouts=stereo,loudnorm=I=${input.targetLufs}:TP=-1:LRA=11:print_format=json`, "-f", "null", "-"], signal);
    const sampleCount = Number(measured.stderr.match(/Number of samples:\s*(\d+)/g)?.at(-1)?.match(/\d+$/)?.[0]);
    const expectedSamples = Math.floor((input.outPoint - input.inPoint) * 48000);
    // ACT: 某些容器不报告音轨时长，按变速前解码样本校验；允许 50 ms 编码延迟与封装尾差。
    if (!Number.isFinite(sampleCount) || sampleCount + 2400 < expectedSamples) invalid("所选区间超过音轨实际时长");
    const json = measured.stderr.match(/\{\s*"input_i"\s*:[^{}]*\}/g)?.at(-1);
    let result: { input_i?: string; input_tp?: string };
    try { result = JSON.parse(json ?? "null"); }
    catch { invalid("无法解析响度测量结果"); }
    const integratedLufs = Number(result?.input_i);
    const truePeakDb = Number(result?.input_tp);
    if (!Number.isFinite(integratedLufs) || !Number.isFinite(truePeakDb)) invalid("所选区间为静音或过短，无法测量有效响度");
    const peakHeadroom = -1 - truePeakDb;
    if (peakHeadroom < -60) invalid("素材真峰值过高，超出可校准范围");
    const desired = input.targetLufs - integratedLufs;
    const gainDb = Math.floor(Math.max(-60, Math.min(24, desired, peakHeadroom)) * 1000) / 1000;
    const verified = await resolveWorkspacePath(directory, input.path);
    if (verified.path !== source.path || !sameFile(before, await lstat(source.path)) || hash !== await hashFile(source.path, signal) || !sameFile(before, await lstat(source.path))) invalid("素材在分析期间发生变化，请重新分析", 409);
    signal.throwIfAborted();
    return { integratedLufs, truePeakDb, targetLufs: input.targetLufs, gainDb, expectedLufs: integratedLufs + gainDb, limited: Math.abs(gainDb - desired) > .001, hash };
  } catch (error) {
    if (timeout.aborted) invalid("响度分析超过 10 分钟，请缩短选中区间后重试", 504);
    if (signal.aborted) throw new DOMException("响度分析已取消", "AbortError");
    throw error;
  } finally {
    releaseFile?.();
    releaseConcurrency?.();
  }
}

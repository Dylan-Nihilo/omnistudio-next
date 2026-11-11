import { tmpdir } from "node:os";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { copyFile, link, lstat, mkdtemp, open, realpath, rm, stat, statfs, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { chainMethods, queryMethods, runMethods } from "./browserTypes";
import type { BrowserFfmpegRequest, FfmpegCall, FfmpegRemoteEvent } from "./browserTypes";
import type { FfmpegCommand, FfmpegFactory, FfprobeData } from "./types";

const chainNames = new Set<string>(chainMethods);
const queryNames = new Set<string>(queryMethods);
const runNames = new Set<string>(runMethods);
const safeFilters = new Set(["color", "trim", "setpts", "format", "fps", "tpad", "scale", "setsar", "lutrgb", "colorchannelmixer", "geq", "null", "pad", "rotate", "fade", "overlay", "atrim", "asetpts", "atempo", "aresample", "aformat", "apad", "volume", "afade", "adelay", "amix", "alimiter", "anullsrc"]);
const mediaFormats = "mov,matroska,webm,mp3,wav,aac,ogg,flac,image2,png_pipe,jpeg_pipe,webp_pipe";
type RemoteCommand = FfmpegCommand & {
  _getArguments(): string[];
  _getFfprobePath(callback: (error: Error | null, path: string) => void): void;
  _inputs: { source: string }[];
};

export type RemoteExportRequestInfo = {
  inputPaths: string[];
  graphPath: string;
  outputPath: string;
  frameRate: number;
  duration: number;
  width?: number;
  height?: number;
};

export type RemoteFfmpegExecutionOptions = {
  temporaryDirectory?: string;
  beforePublish?: (renderedPath: string) => Promise<void>;
};

function controlProbe(command: RemoteCommand, signal: AbortSignal) {
  const pending = new Set<Promise<void>>();
  command.ffprobe = function(...args: unknown[]) {
    const index = typeof args[0] === "number" ? args[0] : command._inputs.length - 1;
    const callback = args.at(-1) as (error: Error | null, data?: FfprobeData) => void;
    let complete: () => void;
    let finished = false;
    const settled = new Promise<void>(resolve => { complete = resolve; });
    pending.add(settled);
    const finish = (error: Error | null, data?: FfprobeData) => {
      if (finished) return;
      finished = true;
      pending.delete(settled);
      complete();
      callback(error, data);
    };
    command._getFfprobePath((error, path) => {
      if (error || !path) return finish(error ?? new Error("找不到 ffprobe"));
      const input = command._inputs[index];
      if (!input) return finish(new Error("ffprobe 素材不存在"));
      const probeSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
      if (probeSignal.aborted) return finish(probeSignal.reason);
      const child = spawn(path, ["-v", "error", "-show_streams", "-show_format", "-print_format", "json", "-protocol_whitelist", "file", "-format_whitelist", mediaFormats, input.source], {
        windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
        env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "FFREPORT")),
      });
      let failure: Error | undefined;
      let stdout = "";
      let stderr = "";
      const cancel = () => { failure = probeSignal.reason; child.kill("SIGKILL"); };
      probeSignal.addEventListener("abort", cancel, { once: true });
      child.stdout.setEncoding("utf8").on("data", chunk => {
        stdout += chunk;
        if (stdout.length > 8 * 1024 * 1024) { failure = new Error("ffprobe 结果超过 8 MiB"); child.kill("SIGKILL"); }
      });
      child.stderr.setEncoding("utf8").on("data", chunk => { stderr = (stderr + chunk).slice(-65536); });
      child.once("error", error => { failure = error; });
      child.once("close", code => {
        probeSignal.removeEventListener("abort", cancel);
        if (failure) return finish(failure);
        if (code !== 0) return finish(new Error(`ffprobe 读取失败：${stderr.trim().slice(0, 500)}`));
        let data: FfprobeData;
        try { data = JSON.parse(stdout) as FfprobeData; }
        catch (error) { return finish(error instanceof Error ? error : new Error(String(error))); }
        finish(null, data);
      });
      if (probeSignal.aborted) cancel();
    });
  } as FfmpegCommand["ffprobe"];
  return () => Promise.allSettled(pending);
}

function assertPath(value: unknown, output = false): asserts value is string {
  if (typeof value !== "string" || !value || value.length > 4096 || /[\\:<>"|?*\x00-\x1f]/.test(value) || value.startsWith("/") || value.split("/").some(part => !part || part === "." || part === ".." || /[. ]$/.test(part))) {
    throw new Error("远程 FFmpeg 只能使用工作区内的相对文件路径");
  }
  if (output ? !/^assets\/videoEditor\/exports\/edited[\da-f]+\.mp4$/.test(value) : !/\.(mp4|mov|m4v|webm|mkv|mp3|wav|m4a|aac|ogg|flac|png|jpe?g|webp)$/i.test(value)) {
    throw new Error(output ? "远程 FFmpeg 只能创建剪辑台 MP4 导出文件" : "远程 FFmpeg 不支持此素材格式");
  }
}

function optionTokens(call: FfmpegCall) {
  if (call.args.length !== 1 || !Array.isArray(call.args[0]) || call.args[0].some(value => typeof value !== "string" || !value || value.length > 4096)) throw new Error("远程 FFmpeg 参数必须为字符串数组");
  // 与 fluent 的单数组参数拆分规则一致；规范化后逐个消费，未知参数一律拒绝。
  return (call.args[0] as string[]).flatMap(value => value.split(" ").length === 2 ? value.split(" ") : [value]);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) {
    throw new Error("远程 FFmpeg 请求结构无效");
  }
}

function validateRequestShape(request: BrowserFfmpegRequest) {
  if (!isObject(request)) throw new Error("远程 FFmpeg 请求结构无效");
  assertKeys(request, ["directory", "requestId", "options", "calls", "operation"]);
  if (typeof request.directory !== "string" || !request.directory || request.directory.length > 4096) throw new Error("远程 FFmpeg 工作区无效");
  if (typeof request.requestId !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(request.requestId)) throw new Error("远程 FFmpeg 请求编号无效");
  if (!isObject(request.options)) throw new Error("远程 FFmpeg 工厂参数无效");
  assertKeys(request.options, [], ["timeout"]);
  if (request.options.timeout !== undefined && (typeof request.options.timeout !== "number" || !Number.isFinite(request.options.timeout) || request.options.timeout <= 0 || request.options.timeout > 86400)) throw new Error("远程 FFmpeg 工厂参数不可用");
  if (!Array.isArray(request.calls) || request.calls.length > 2048) throw new Error("远程 FFmpeg 调用数量无效");
  for (const call of request.calls) {
    if (!isObject(call)) throw new Error("远程 FFmpeg 调用结构无效");
    assertKeys(call, ["method", "args"], ["undefinedArgs"]);
    if (typeof call.method !== "string" || !chainNames.has(call.method) || !Array.isArray(call.args) || call.args.length > 128) throw new Error("远程 FFmpeg 调用参数无效");
    if (call.method === "input" && call.args.length !== 1) throw new Error("远程 FFmpeg 输入参数数量无效");
    if (call.undefinedArgs !== undefined && (!Array.isArray(call.undefinedArgs) || call.undefinedArgs.length > 128 || call.undefinedArgs.some(index => !Number.isInteger(index) || (index as number) < 0 || (index as number) >= call.args.length))) throw new Error("远程 FFmpeg 可选参数索引无效");
    if (call.undefinedArgs?.length) throw new Error("持久渲染不能包含未定义参数");
  }
  if (!isObject(request.operation)) throw new Error("远程 FFmpeg 操作无效");
  assertKeys(request.operation, ["method", "args"], ["undefinedArgs"]);
  if (request.operation.method !== "run" || !Array.isArray(request.operation.args) || request.operation.args.length || request.operation.undefinedArgs !== undefined && (!Array.isArray(request.operation.undefinedArgs) || request.operation.undefinedArgs.length)) throw new Error("持久渲染仅支持无参数的 run 操作");
}

function exportRequestInfo(request: BrowserFfmpegRequest): RemoteExportRequestInfo {
  validateRequestShape(request);
  validateExportCalls(request.calls);
  const graphCall = request.calls.find(call => call.method === "outputOptions");
  const graphTokens = graphCall ? optionTokens(graphCall) : [];
  const graphIndex = graphTokens.indexOf("-filter_complex_script");
  const graphPath = graphTokens[graphIndex + 1];
  const output = request.calls.at(-1);
  const duration = request.calls.find(call => call.method === "duration")?.args[0];
  const frameRate = request.calls.find(call => call.method === "outputFps")?.args[0];
  if (!graphPath || typeof output?.args[0] !== "string" || typeof duration !== "number" || typeof frameRate !== "number") throw new Error("远程 FFmpeg 导出参数不完整");
  const result: RemoteExportRequestInfo = {
    inputPaths: request.calls.filter(call => call.method === "input").map(call => call.args[0] as string),
    graphPath,
    outputPath: output.args[0],
    frameRate,
    duration,
  };
  return result;
}

function graphDimensions(graph: string, frameRate: number, duration: number) {
  if (graph.length > 512 * 1024) throw new Error("远程 FFmpeg 滤镜图超过 512 KiB，请减少片段数量");
  validateGraph(graph);
  const match = /^color=c=black:s=(\d+)x(\d+):r=(\d+):d=(\d+(?:\.\d+)?)(?:\[base0\])?;/.exec(graph);
  if (!match) throw new Error("持久渲染滤镜图缺少有效的画布定义");
  const width = Number(match[1]);
  const height = Number(match[2]);
  const graphFrameRate = Number(match[3]);
  const graphDuration = Number(match[4]);
  if (!Number.isSafeInteger(width) || width < 2 || width > 3840 || width % 2 || !Number.isSafeInteger(height) || height < 2 || height > 2160 || height % 2 || width * height > 3840 * 2160) throw new Error("持久渲染输出尺寸超出允许范围");
  if (graphFrameRate !== frameRate || !Number.isFinite(graphDuration) || Math.abs(graphDuration - duration) > Math.max(1e-9, duration * 1e-9)) throw new Error("持久渲染滤镜图与项目帧率或时长不一致");
  return { width, height };
}

async function createRenderTemporaryDirectory(executionOptions: RemoteFfmpegExecutionOptions) {
  if (!executionOptions.temporaryDirectory) return mkdtemp(join(tmpdir(), "omnistudioFfmpeg"));
  const parent = resolve(executionOptions.temporaryDirectory);
  const info = await lstat(parent).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info?.isDirectory() || info.isSymbolicLink() || await realpath(parent) !== parent) throw new Error("持久渲染临时目录必须是已创建的普通目录");
  return mkdtemp(join(parent, "attempt"));
}

async function checkRenderSpace(directory: string, neededBytes: number) {
  const filesystem = await statfs(directory);
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (!Number.isFinite(availableBytes) || availableBytes < neededBytes) throw Object.assign(new Error("磁盘空间不足，无法完成视频导出"), { code: "ENOSPC" });
}

export function validateRemoteExportRequest(request: BrowserFfmpegRequest, graph?: string): RemoteExportRequestInfo {
  const info = exportRequestInfo(request);
  if (graph !== undefined) return { ...info, ...graphDimensions(graph, info.frameRate, info.duration) };
  return info;
}

function validateGraph(graph: string) {
  if (!graph || !/^[\w\[\]:=.,;+*/() @\t\r\n'\\-]+$/.test(graph) || /\\(?!,)|\/[a-z_]\w*=/i.test(graph)) throw new Error("远程 FFmpeg 滤镜图包含不支持的语法");
  let quoted = false;
  let start = 0;
  const checkFilter = (end: number) => {
    const filter = /^(?:\[[\w:]+\])*([a-z][\da-z]*)(?==|\[|$)/.exec(graph.slice(start, end).trim())?.[1];
    if (!filter || !safeFilters.has(filter)) throw new Error(`远程 FFmpeg 不支持此滤镜：${filter ?? "未知"}`);
  };
  for (let index = 0; index < graph.length; index++) {
    const character = graph[index];
    if (character === "\\") index++;
    else if (character === "'") quoted = !quoted;
    else if (!quoted && (character === "," || character === ";")) {
      checkFilter(index);
      start = index + 1;
    }
  }
  if (quoted) throw new Error("远程 FFmpeg 滤镜图的引号未闭合");
  checkFilter(graph.length);
}

async function prepareCommand(factory: FfmpegFactory, request: BrowserFfmpegRequest, signal: AbortSignal, executionOptions: RemoteFfmpegExecutionOptions = {}) {
  const probing = request.operation.method === "ffprobe";
  const composing = request.operation.method === "composeVideos";
  if (composing) {
    const { inputPaths, outputPath } = validateComposeOperation(request);
    const command = factory({ timeout: 0, stdoutLines: 100 }) as RemoteCommand;
    const settleProbes = controlProbe(command, signal);
    for (const inputPath of inputPaths) command.input(inputPath).inputOptions(["-protocol_whitelist", "file", "-format_whitelist", mediaFormats]);
    const streams: FfprobeData["streams"][] = [];
    for (let index = 0; index < inputPaths.length; index++) {
      signal.throwIfAborted();
      streams.push(await probeInput(command, index));
    }
    signal.throwIfAborted();
    if (streams.some(stream => !stream.some(item => item.codec_type === "video"))) throw new Error("所有拼接输入都必须包含视频流");
    const audioPresence = streams.map(items => items.some(item => item.codec_type === "audio"));
    if (audioPresence.some(hasAudio => hasAudio !== audioPresence[0])) throw new Error("输入视频的音频轨不一致，请先统一音频轨");

    const root = await realpath(request.directory);
    const destination = resolve(root, outputPath);
    const destinationOffset = relative(root, destination);
    if (destinationOffset === ".." || destinationOffset.startsWith(`..${sep}`) || isAbsolute(destinationOffset)) throw new Error("拼接输出必须位于当前工作区");
    const destinationDirectory = await realpath(dirname(destination));
    const directoryOffset = relative(root, destinationDirectory);
    if (directoryOffset === ".." || directoryOffset.startsWith(`..${sep}`) || isAbsolute(directoryOffset)) throw new Error("拼接输出目录必须位于当前工作区");
    try {
      await lstat(destination);
      throw new Error("拼接输出文件已存在，请重新执行");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const temporaryPath = `${outputPath.slice(0, outputPath.lastIndexOf("/") + 1)}.compose-${randomUUID()}.mp4`;
    const temporary = resolve(root, temporaryPath);
    try {
      await lstat(temporary);
      throw new Error("拼接临时文件已存在，请重新执行");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const output = command.output(temporaryPath).videoCodec("libx264");
    if (audioPresence[0]) output.audioCodec("aac");
    output.outputOptions(["-movflags +faststart"])
      .complexFilter({ filter: "concat", options: { n: inputPaths.length, v: 1, a: audioPresence[0] ? 1 : 0 } });
    const originalArguments = command._getArguments.bind(command);
    command._getArguments = () => {
      const args = originalArguments();
      const overwriteIndex = args.indexOf("-y");
      if (overwriteIndex >= 0) args[overwriteIndex] = "-n";
      return args;
    };
    const publish = async () => {
      signal.throwIfAborted();
      const outputInfo = await stat(temporary);
      if (!outputInfo.isFile() || outputInfo.size === 0) throw new Error("视频拼接未生成有效文件");
      await link(temporary, destination);
      if (signal.aborted) {
        await rm(destination).catch(error => { throw new Error("取消后清理拼接输出失败", { cause: error }); });
        signal.throwIfAborted();
      }
    };
    return { command, operation: { method: "run", args: [] }, temporary, publish, settleProbes };
  }
  if ((!probing && request.operation.method !== "run") || request.operation.args.length || request.operation.undefinedArgs?.length) throw new Error("远程 FFmpeg 仅支持受限拼接及无自定义参数的 run/ffprobe");
  for (const call of request.calls) {
    if (call.args.length !== 1 || call.undefinedArgs?.length) throw new Error(`远程 FFmpeg 参数数量无效：${call.method}`);
  }
  if (probing) {
    if (request.calls.length !== 1 || request.calls[0]?.method !== "input") throw new Error("远程 ffprobe 每次只能探测一个素材");
    assertPath(request.calls[0].args[0]);
  } else {
    validateExportCalls(request.calls);
  }
  // 超时统一走受控 signal，避免 fluent 在子进程退出前先发 error。
  const command = factory({ timeout: 0, stdoutLines: 100 }) as RemoteCommand;
  const settleProbes = controlProbe(command, signal);
  for (const call of request.calls) {
    invoke(command, call);
    if (call.method === "input") command.inputOptions(["-protocol_whitelist", "file", "-format_whitelist", mediaFormats]);
  }
  if (probing) {
    return { command, operation: { method: "ffprobe", args: [] }, temporary: undefined, publish: undefined, settleProbes };
  }
  // 工厂仍先校验真实工作区路径（包含符号链接）；仅替换宿主已验证的脚本参数。
  const originalArguments = command._getArguments.bind(command);
  const args = originalArguments();
  const outputPath = args.at(-1);
  if (!outputPath) throw new Error("远程 FFmpeg 缺少导出路径");
  try {
    await lstat(outputPath);
    throw new Error("导出文件已存在，请重新导出");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const graphIndex = args.indexOf("-filter_complex_script") + 1;
  const source = await open(args[graphIndex]!, "r");
  let graph: string;
  try {
    const buffer = Buffer.alloc(512 * 1024 + 1);
    const { bytesRead } = await source.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 512 * 1024) throw new Error("远程 FFmpeg 滤镜图超过 512 KiB，请减少片段数量");
    graph = buffer.toString("utf8", 0, bytesRead);
  } finally { await source.close(); }
  validateGraph(graph);
  signal.throwIfAborted();
  const temporary = await createRenderTemporaryDirectory(executionOptions);
  try {
    // ACT: 启动前保留 64 MiB 最低余量；成片体积受编码内容影响，发布复制前另按实际文件大小核验。
    await checkRenderSpace(temporary, 64 * 1024 ** 2);
    const snapshot = join(temporary, "graph.txt");
    const rendered = join(temporary, "render.mp4");
    await writeFile(snapshot, graph, { flag: "wx", mode: 0o600, signal });
    command._getArguments = () => {
      const resolved = originalArguments();
      const overwriteIndex = resolved.indexOf("-y");
      if (overwriteIndex >= 0) resolved[overwriteIndex] = "-n";
      resolved[resolved.indexOf("-filter_complex_script") + 1] = snapshot;
      resolved[resolved.length - 1] = rendered;
      return resolved;
    };
    const publish = async () => {
      signal.throwIfAborted();
      const destination = originalArguments().at(-1)!;
      await executionOptions.beforePublish?.(rendered);
      signal.throwIfAborted();
      const renderedInfo = await stat(rendered);
      if (!renderedInfo.isFile() || renderedInfo.size < 1) throw new Error("渲染未生成有效文件");
      try {
        await link(rendered, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
        await checkRenderSpace(dirname(destination), renderedInfo.size);
        // 跨盘先复制到目标目录的临时文件，再硬链接排他发布；崩溃残留由队列按输出编号回收。
        const staging = `${destination}.tmp-${randomUUID()}`;
        let canRemoveStaging = true;
        try {
          try { await copyFile(rendered, staging, constants.COPYFILE_EXCL); }
          catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") canRemoveStaging = false; throw error; }
          signal.throwIfAborted();
          await link(staging, destination);
        } finally {
          if (canRemoveStaging) await rm(staging, { force: true });
        }
      }
      if (signal.aborted) {
        await rm(destination).catch(error => { throw new Error("取消后清理未发布的导出文件失败", { cause: error }); });
        signal.throwIfAborted();
      }
    };
    return { command, operation: request.operation, temporary, publish, settleProbes };
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

function validateComposeOperation(request: BrowserFfmpegRequest) {
  if (request.calls.length || request.operation.args.length !== 2 || request.operation.undefinedArgs?.length) throw new Error("受限拼接参数无效");
  const [inputPaths, outputPath] = request.operation.args;
  if (!Array.isArray(inputPaths) || inputPaths.length < 2 || inputPaths.length > 32 || inputPaths.some(path => typeof path !== "string")) {
    throw new Error("视频拼接仅支持 2 至 32 个工作区素材");
  }
  for (const inputPath of inputPaths) {
    assertPath(inputPath);
    if (!/\.(mp4|mov|m4v|webm|mkv)$/i.test(inputPath)) throw new Error("视频拼接仅支持工作区视频素材");
  }
  assertPath(outputPath);
  if (typeof outputPath !== "string" || !/^assets\/[A-Za-z0-9_-]{1,128}\/combined-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/i.test(outputPath)) {
    throw new Error("视频拼接输出路径无效");
  }
  if (inputPaths.includes(outputPath)) throw new Error("视频拼接不能覆盖输入素材");
  return { inputPaths: inputPaths as string[], outputPath };
}

function probeInput(command: RemoteCommand, index: number) {
  return new Promise<NonNullable<FfprobeData["streams"]>>((resolve, reject) => {
    command.ffprobe(index, (error, data) => {
      if (error) reject(error);
      else resolve(data?.streams ?? []);
    });
  });
}

function validateExportCalls(calls: FfmpegCall[]) {
  let index = 0;
  let inputCount = 0;
  while (calls[index]?.method === "input") {
    assertPath(calls[index]!.args[0]);
    inputCount++;
    index++;
    const options = calls[index];
    if (options?.method === "inputOptions") {
      const tokens = optionTokens(options);
      if (tokens.length !== 4 || tokens[0] !== "-loop" || tokens[1] !== "1" || tokens[2] !== "-framerate" || !["24", "25", "30", "60"].includes(tokens[3]!)) throw new Error("远程 FFmpeg 图片序列参数不可用");
      index++;
    }
  }
  if (!inputCount) throw new Error("远程 FFmpeg 至少需要一个工作区素材");
  const graph = calls[index++];
  const graphTokens = graph?.method === "outputOptions" ? optionTokens(graph) : [];
  if (graphTokens.length !== 6 || graphTokens[0] !== "-filter_complex_script" || !/^assets\/videoEditor\/exports\/exportGraph[\da-f]+\.txt$/.test(graphTokens[1] ?? "") || graphTokens[2] !== "-map" || graphTokens[3] !== "[outv]" || graphTokens[4] !== "-map" || graphTokens[5] !== "[outa]") throw new Error("远程 FFmpeg 滤镜脚本或输出映射不可用");
  const expected = [["videoCodec", "libx264"], ["audioCodec", "aac"], ["audioBitrate", "192k"]] as const;
  for (const [method, value] of expected) {
    const call = calls[index++];
    if (call?.method !== method || call.args.length !== 1 || call.args[0] !== value) throw new Error(`远程 FFmpeg 导出配置不可用：${method}`);
  }
  const fps = calls[index++];
  if (fps?.method !== "outputFps" || fps.args.length !== 1 || ![24, 25, 30, 60].includes(fps.args[0] as number)) throw new Error("远程 FFmpeg 帧率不可用");
  const duration = calls[index++];
  if (duration?.method !== "duration" || duration.args.length !== 1 || typeof duration.args[0] !== "number" || !Number.isFinite(duration.args[0]) || duration.args[0] <= 0 || duration.args[0] > 86400) throw new Error("远程 FFmpeg 时长不可用");
  const quality = calls[index++];
  const qualityTokens = quality?.method === "outputOptions" ? optionTokens(quality) : [];
  if (qualityTokens.length !== 10 || qualityTokens[0] !== "-crf" || !["18", "23", "28"].includes(qualityTokens[1]!) || qualityTokens[2] !== "-preset" || qualityTokens[3] !== "medium" || qualityTokens[4] !== "-movflags" || qualityTokens[5] !== "+faststart" || qualityTokens[6] !== "-ar" || qualityTokens[7] !== "48000" || qualityTokens[8] !== "-ac" || qualityTokens[9] !== "2") throw new Error("远程 FFmpeg 编码参数不可用");
  const output = calls[index++];
  if (output?.method !== "output" || output.args.length !== 1) throw new Error("远程 FFmpeg 输出路径不可用");
  assertPath(output.args[0], true);
  if (index !== calls.length) throw new Error("远程 FFmpeg 请求包含未使用的调用");
}

function serializeError(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message, ...("code" in error ? { code: error.code } : {}) }
    : { name: "Error", message: String(error) };
}

function invoke(command: FfmpegCommand, call: FfmpegCall, extra: unknown[] = []) {
  if (["input", "output"].includes(call.method) && typeof call.args[0] !== "string") {
    throw new Error("浏览器 FFmpeg 输入、输出必须使用工作区文件路径");
  }
  const args = call.args.map((value, index) => call.undefinedArgs?.includes(index) ? undefined : value);
  return Reflect.apply((command as unknown as Record<string, (...args: unknown[]) => unknown>)[call.method]!, command, [...args, ...extra]);
}

/** 浏览器只传链式调用数据，执行及显式路径检查仍使用原生工作区工厂。 */
export async function executeRemoteFfmpeg(
  factory: FfmpegFactory,
  request: BrowserFfmpegRequest,
  emit: (event: FfmpegRemoteEvent) => void,
  signal: AbortSignal,
  executionOptions: RemoteFfmpegExecutionOptions = {},
): Promise<void> {
  let temporary: string | undefined;
  let settleProbes: (() => Promise<unknown>) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    if (Object.keys(request.options).some(key => key !== "timeout") || request.options.timeout !== undefined && (!Number.isFinite(request.options.timeout) || request.options.timeout <= 0 || request.options.timeout > 86400)) throw new Error("远程 FFmpeg 工厂参数不可用");
    const deadline = new AbortController();
    timeout = setTimeout(() => deadline.abort(new DOMException("FFmpeg 执行超时", "TimeoutError")), (request.options.timeout ?? 3600) * 1000);
    signal = AbortSignal.any([signal, deadline.signal]);
    signal.throwIfAborted();
    for (const call of request.calls) {
      if (!chainNames.has(call.method)) throw new Error(`FFmpeg 配置方法不可用：${call.method}`);
    }
    const prepared = await prepareCommand(factory, request, signal, executionOptions);
    temporary = prepared.temporary;
    settleProbes = prepared.settleProbes;
    const operation = prepared.operation;
    if (!queryNames.has(operation.method) && !runNames.has(operation.method)) {
      throw new Error(`FFmpeg 执行方法不可用：${operation.method}`);
    }
    const command = prepared.command;
    await new Promise<void>(resolve => {
      let finished = false;
      const send = (event: string, args: unknown[]) => { if (!finished) emit({ event, args }); };
      const finish = (event: string, args: unknown[]) => {
        if (finished) return;
        send(event, args);
        finished = true;
        signal.removeEventListener("abort", cancel);
        resolve();
      };
      const fail = (error: unknown, ...args: unknown[]) => finish("error", [serializeError(error), ...args]);
      const cancel = () => {
        if (queryNames.has(operation.method)) {
          // 受控 probe 绑定 signal；等 close 后回调，避免提前释放占用和清理素材。
          return;
        } else {
          // ACT: 等待原生 error/end，确认转换进程与输出流已关闭后才允许清理产物。
          command.kill("SIGKILL");
        }
      };
      signal.addEventListener("abort", cancel, { once: true });
      // ACT: 取消可能早于 spawn；保留监听，准备阶段结束后立即终止，且接住迟到的 error。
      command.on("start", (...args) => {
        if (signal.aborted) command.kill("SIGKILL");
        else send("start", args);
      });
      command.on("error", (error, ...args) => fail(signal.aborted ? signal.reason ?? new DOMException("FFmpeg 已取消", "AbortError") : error, ...args));
      command.on("end", (...args) => {
        if (signal.aborted) fail(signal.reason ?? new DOMException("FFmpeg 已取消", "AbortError"));
        else void (prepared.publish?.() ?? Promise.resolve()).then(() => {
          if (signal.aborted) fail(signal.reason ?? new DOMException("FFmpeg 已取消", "AbortError"));
          else finish("end", args);
        }, fail);
      });
      for (const event of ["progress", "stderr", "codecData", "filenames"] as const) {
        command.addListener(event, (...args: unknown[]) => send(event, args));
      }
      try {
        signal.throwIfAborted();
        if (queryNames.has(operation.method)) {
          // ACT: fluent 未公开查询子进程，取消只能停止等待；转换命令由上面的 kill 终止。
          invoke(command, operation, [(error: unknown, data: unknown) => error ? fail(error) : finish("result", [data])]);
        } else {
          invoke(command, operation);
        }
      } catch (error) {
        fail(error);
      }
    });
  } catch (error) {
    emit({ event: "error", args: [serializeError(error)] });
  } finally {
    clearTimeout(timeout);
    await settleProbes?.();
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}

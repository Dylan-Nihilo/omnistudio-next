import { tmpdir } from "node:os";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { copyFile, lstat, mkdtemp, open, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chainMethods, queryMethods, runMethods } from "./browserTypes";
import type { BrowserFfmpegRequest, FfmpegCall, FfmpegRemoteEvent } from "./browserTypes";
import type { FfmpegCommand, FfmpegFactory, FfprobeData } from "./types";

const chainNames = new Set<string>(chainMethods);
const queryNames = new Set<string>(queryMethods);
const runNames = new Set<string>(runMethods);
const safeFilters = new Set(["color", "trim", "setpts", "format", "fps", "scale", "setsar", "lutrgb", "colorchannelmixer", "geq", "null", "pad", "rotate", "fade", "overlay", "atrim", "asetpts", "atempo", "aresample", "aformat", "apad", "volume", "afade", "adelay", "amix", "alimiter", "anullsrc"]);
const mediaFormats = "mov,matroska,webm,mp3,wav,aac,ogg,flac,image2,png_pipe,jpeg_pipe,webp_pipe";
type RemoteCommand = FfmpegCommand & {
  _getArguments(): string[];
  _getFfprobePath(callback: (error: Error | null, path: string) => void): void;
  _inputs: { source: string }[];
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

async function prepareCommand(factory: FfmpegFactory, request: BrowserFfmpegRequest, signal: AbortSignal) {
  const probing = request.operation.method === "ffprobe";
  if ((!probing && request.operation.method !== "run") || request.operation.args.length || request.operation.undefinedArgs?.length) throw new Error("远程 FFmpeg 仅支持无自定义参数的 run/ffprobe");
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
  const temporary = await mkdtemp(join(tmpdir(), "omnistudioFfmpeg"));
  try {
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
      // 宿主临时目录不对工作区文件接口暴露；完成后排他发布，失败不会触碰预存文件。
      await copyFile(rendered, destination, constants.COPYFILE_EXCL);
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
    const prepared = await prepareCommand(factory, request, signal);
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
        else void (prepared.publish?.() ?? Promise.resolve()).then(() => finish("end", args), fail);
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

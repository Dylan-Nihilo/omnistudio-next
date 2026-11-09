import { createBrowserFfmpeg, type BrowserFfmpegFactory, type FfprobeData } from "@omnistudio-next/ffmpeg/browser";
import axios from "axios";
import type { ApiResponse } from "@/lib/authApi";
import useWorkspaceFiles from "@/lib/workspaceFiles";
import { clipDuration, crossfadeDuration, parseEditorProject, type EditorClip, type EditorKeyframeProperty, type EditorProject } from "./editorModel";
import { renderEditorText } from "./editorText";

export type EditorRenderJob = {
  id: string;
  projectPath: string;
  revision: string;
  projectName: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
  progress: number;
  outputPath: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function exportEditorProject(
  project: EditorProject,
  directory: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
  context: { projectPath: string; revision: string; projectName: string },
): Promise<EditorRenderJob> {
  const snapshot = parseEditorProject(JSON.parse(JSON.stringify(project)));
  signal.throwIfAborted();
  if (!snapshot.clips.length) throw new Error("时间线上没有可导出的片段");
  const files = useWorkspaceFiles(directory);
  const duration = Math.max(...snapshot.clips.map(clip => clip.start + clipDuration(clip)));
  const [ratioWidth, ratioHeight] = snapshot.aspectRatio.split(":").map(Number);
  const height = snapshot.exportHeight;
  const width = Math.round(height * ratioWidth / ratioHeight / 2) * 2;
  const jobId = crypto.randomUUID().replaceAll("-", "");
  const outputPath = `assets/videoEditor/exports/edited${Date.now()}${jobId.slice(0, 8)}.mp4`;
  const temporaryPaths: string[] = [];
  let retainArtifacts = false;
  let progress = 0;
  const report = (value: number) => {
    progress = Math.max(progress, Math.min(100, Math.round(value)));
    onProgress(progress);
  };
  report(0);
  try {
    await ensureExportDirectory(files, signal);
    const ffmpeg = await createBrowserFfmpeg(directory, signal);
    const tracks = new Map(snapshot.tracks.map(track => [track.id, track]));
    const referencedAssets = new Set(snapshot.clips.flatMap(clip => clip.assetId ? [clip.assetId] : []));
    const usedAssets = snapshot.assets.filter(asset => referencedAssets.has(asset.id));
    const probes = new Map<string, FfprobeData>();
    // ACT: 顺序探测避免大型工程一次拉起数百个 ffprobe 进程；媒体传输始终使用工作区路径。
    for (const asset of usedAssets) {
      signal.throwIfAborted();
      let data: FfprobeData;
      try {
        data = await probeMedia(ffmpeg, asset.path, signal);
      } catch (error) {
        signal.throwIfAborted();
        const detail = (error instanceof Error ? error.message : String(error)).split(/\r?\n/).find(Boolean)?.slice(0, 200);
        throw new Error(`素材「${asset.name}」无法读取，请重新导入${detail ? `：${detail}` : ""}`, { cause: error });
      }
      const requiredStream = asset.kind === "audio" ? "audio" : "video";
      const stream = data.streams.find(item => item.codec_type === requiredStream);
      if (!stream) throw new Error(`素材「${asset.name}」缺少${requiredStream === "video" ? "画面" : "音频"}流`);
      if (asset.kind !== "image") {
        const actualDuration = Number(stream.duration ?? data.format.duration);
        if (!Number.isFinite(actualDuration) || actualDuration <= 0) throw new Error(`无法确认素材「${asset.name}」的有效时长`);
        for (const clip of snapshot.clips.filter(item => item.assetId === asset.id)) {
          if (clip.outPoint > actualDuration + Math.max(0.05, 1 / snapshot.frameRate)) {
            throw new Error(`片段「${clip.title}」超出素材实际时长，请重新设置出点`);
          }
        }
      }
      probes.set(asset.id, data);
    }
    report(20);
    const command = ffmpeg();
    const assetIndexes = new Map<string, number>();
    usedAssets.forEach((asset, index) => {
      assetIndexes.set(asset.id, index);
      command.input(asset.path);
      if (asset.kind === "image") command.inputOptions(["-loop 1", `-framerate ${snapshot.frameRate}`]);
    });
    const graph: string[] = [`color=c=black:s=${width}x${height}:r=${snapshot.frameRate}:d=${duration}[base0]`];
    const visualClips = snapshot.tracks.toReversed().flatMap(track => snapshot.clips
      .filter(clip => clip.track === track.id && clip.kind !== "audio" && !track.hidden)
      .sort((a, b) => a.start - b.start));
    let videoBase = "base0";
    for (let index = 0; index < visualClips.length; index++) {
      signal.throwIfAborted();
      const clip = visualClips[index];
      const clipLength = clipDuration(clip);
      const label = `visual${index}`;
      const nextBase = `base${index + 1}`;
      const crossfadeOut = visualClips.some(other => crossfadeDuration(clip, other, 1 / snapshot.frameRate) !== undefined);
      if (clip.kind === "text") {
        const path = `assets/videoEditor/exports/exportText${jobId}${index}.png`;
        temporaryPaths.push(path);
        await files.write(path, await renderEditorText(clip, width, height), true, signal);
        command.input(path).inputOptions(["-loop 1", `-framerate ${snapshot.frameRate}`]);
        const input = usedAssets.length + temporaryPaths.length - 1;
        graph.push(`[${input}:v]trim=duration=${clipLength},setpts=PTS-STARTPTS,format=rgba${alphaFilters(clip, crossfadeOut)},setpts=PTS+${clip.start}/TB[${label}]`);
      } else {
        const input = assetIndexes.get(clip.assetId ?? "");
        if (input === undefined) throw new Error(`找不到素材「${clip.title}」`);
        const speed = clip.speed ?? 1;
        const scaledWidth = Math.max(2, Math.round(width * (clip.scale ?? 1) / 2) * 2);
        const scaledHeight = Math.max(2, Math.round(height * (clip.scale ?? 1) / 2) * 2);
        const angle = (clip.rotation ?? 0) * Math.PI / 180;
        const asset = usedAssets.find(item => item.id === clip.assetId)!;
        const sourceStart = asset.kind === "image" ? 0 : clip.inPoint;
        graph.push(`[${input}:v]trim=start=${sourceStart}:duration=${clip.outPoint - clip.inPoint},setpts=(PTS-STARTPTS)/${speed},fps=${snapshot.frameRate},scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease,setsar=1,format=rgba,${colorFilters(clip)},pad=${scaledWidth}:${scaledHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0,rotate=${angle}:ow=rotw(${angle}):oh=roth(${angle}):c=black@0${alphaFilters(clip, crossfadeOut)},setpts=PTS+${clip.start}/TB[${label}]`);
      }
      const xValue = clip.kind === "text" ? undefined : keyframeExpression(clip, "x", `(t-${clip.start})`);
      const yValue = clip.kind === "text" ? undefined : keyframeExpression(clip, "y", `(t-${clip.start})`);
      const x = xValue ? `(${xValue})*${width}/100` : String(clip.kind === "text" ? 0 : width * (clip.x ?? 0) / 100);
      const y = yValue ? `(${yValue})*${height}/100` : String(clip.kind === "text" ? 0 : height * (clip.y ?? 0) / 100);
      const enable = visibleExpression(clip, visualClips, snapshot.frameRate);
      graph.push(`[${videoBase}][${label}]overlay=x='(W-w)/2+${x}':y='(H-h)/2+${y}':eof_action=pass:repeatlast=0:enable='${enable}'[${nextBase}]`);
      videoBase = nextBase;
      report(20 + (index + 1) / visualClips.length * 60);
    }
    const audioClips = snapshot.clips.filter(clip => clip.kind !== "text" && clip.kind !== "image" && !tracks.get(clip.track)?.muted && probes.get(clip.assetId ?? "")?.streams.some(stream => stream.codec_type === "audio"));
    const audioLabels: string[] = [];
    for (let index = 0; index < audioClips.length; index++) {
      const clip = audioClips[index];
      const input = assetIndexes.get(clip.assetId ?? "");
      if (input === undefined) throw new Error(`找不到素材「${clip.title}」`);
      const label = `audio${index}`;
      const clipLength = clipDuration(clip);
      const fadeIn = Math.max(clip.fadeIn ?? 0, clip.transitionIn ?? 0);
      const fadeOut = Math.max(clip.fadeOut ?? 0, clip.transitionOut ?? 0);
      const fades = [
        fadeIn ? `afade=t=in:st=0:d=${fadeIn}` : "",
        fadeOut ? `afade=t=out:st=${Math.max(0, clipLength - fadeOut)}:d=${fadeOut}` : "",
      ].filter(Boolean);
      graph.push(`[${input}:a]atrim=start=${clip.inPoint}:duration=${clip.outPoint - clip.inPoint},asetpts=PTS-STARTPTS,${tempoFilters(clip.speed ?? 1)},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${clipLength},volume=${clip.volume}${fades.length ? `,${fades.join(",")}` : ""},adelay=${Math.round(clip.start * 48000)}S:all=1[${label}]`);
      audioLabels.push(label);
    }
    if (audioLabels.length) {
      graph.push(`${audioLabels.map(label => `[${label}]`).join("")}amix=inputs=${audioLabels.length}:duration=longest:normalize=0,alimiter=limit=0.95:level=0:latency=1,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS[outa]`);
    } else {
      graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[outa]`);
    }
    graph.push(`[${videoBase}]trim=duration=${duration},setpts=PTS-STARTPTS,format=yuv420p[outv]`);
    const graphPath = `assets/videoEditor/exports/exportGraph${jobId}.txt`;
    temporaryPaths.push(graphPath);
    await files.write(graphPath, graph.join(";\n"), true, signal);
    const crf = { draft: 28, standard: 23, high: 18 }[snapshot.exportQuality];
    command.outputOptions(["-filter_complex_script", graphPath, "-map", "[outv]", "-map", "[outa]"])
      .videoCodec("libx264").audioCodec("aac").audioBitrate("192k")
      .outputFps(snapshot.frameRate).duration(duration)
      .outputOptions([`-crf ${crf}`, "-preset medium", "-movflags +faststart", "-ar 48000", "-ac 2"])
      .output(outputPath);
    signal.throwIfAborted();
    report(90);
    // ACT: 入队请求交给服务端接管，不绑定页面 AbortSignal；响应不确定时保留辅助文件，避免破坏已接收的任务。
    retainArtifacts = true;
    try {
      const { data } = await axios.post<ApiResponse<EditorRenderJob>>("/api/videoEditor/renders/create", {
        directory, ...context, request: command.toRequest(),
      });
      report(100);
      return data.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response && error.response.status >= 400 && error.response.status < 500) retainArtifacts = false;
      if (retainArtifacts) throw new Error("渲染任务提交结果尚未确认，请刷新后台任务列表。准备文件已保留，以免影响服务端已接收的任务。", { cause: error });
      throw error;
    }
  } finally {
    const paths = retainArtifacts ? [] : temporaryPaths;
    const cleanup = await Promise.allSettled(paths.map(path => removeExportFile(files, path)));
    cleanup.forEach((result, index) => {
      if (result.status === "rejected") console.error(`导出文件清理失败：${paths[index]}`, result.reason);
    });
  }
}

async function ensureExportDirectory(files: ReturnType<typeof useWorkspaceFiles>, signal: AbortSignal) {
  let parent = "";
  for (const name of ["assets", "videoEditor", "exports"]) {
    signal.throwIfAborted();
    const path = parent ? `${parent}/${name}` : name;
    const { entries } = await files.list(parent);
    const existing = entries.find(entry => entry.name === name);
    if (existing && existing.type !== "directory") throw new Error(`「${path}」已被同名文件占用`);
    if (!existing) {
      try {
        await files.mkdir(path);
      } catch (error) {
        if (!(await files.list(parent)).entries.some(entry => entry.name === name && entry.type === "directory")) throw error;
      }
    }
    parent = path;
  }
}

function probeMedia(ffmpeg: BrowserFfmpegFactory, path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<FfprobeData>((resolve, reject) => {
    ffmpeg.ffprobe(path, (error, data) => {
      if (signal.aborted) reject(signal.reason ?? new DOMException("导出已取消", "AbortError"));
      else if (error) reject(error);
      else resolve(data);
    });
  });
}

function visibleExpression(clip: EditorClip, clips: EditorClip[], frameRate: number) {
  const end = clip.start + clipDuration(clip);
  const later = clips.filter(other => other.track === clip.track && other.id !== clip.id && (other.start > clip.start || other.start === clip.start && clips.indexOf(other) > clips.indexOf(clip)) && other.start < end && other.start + clipDuration(other) > clip.start);
  const active = (start: number, finish: number) => `gte(t\\,${start})*lt(t\\,${finish})`;
  return `${active(clip.start, end)}${later.filter(other => crossfadeDuration(clip, other, 1 / frameRate) === undefined).map(other => `*not(${active(other.start, other.start + clipDuration(other))})`).join("")}`;
}

function alphaFilters(clip: EditorClip, crossfadeOut = false) {
  const opacity = keyframeExpression(clip, "opacity", "T");
  const filters = [opacity ? `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${opacity}'` : `colorchannelmixer=aa=${clip.opacity ?? 1}`];
  const fadeIn = Math.max(clip.fadeIn ?? 0, clip.transitionIn ?? 0);
  const fadeOut = Math.max(clip.fadeOut ?? 0, crossfadeOut ? 0 : clip.transitionOut ?? 0);
  if (fadeIn) filters.push(`fade=t=in:st=0:d=${fadeIn}:alpha=1`);
  if (fadeOut) filters.push(`fade=t=out:st=${Math.max(0, clipDuration(clip) - fadeOut)}:d=${fadeOut}:alpha=1`);
  return `,${filters.join(",")}`;
}

function keyframeExpression(clip: EditorClip, property: EditorKeyframeProperty, time: string): string | undefined {
  const frames = clip.keyframes?.filter(frame => frame.property === property) ?? [];
  if (!frames.length) return undefined;
  let expression = String(frames.at(-1)!.value);
  for (let index = frames.length - 2; index >= 0; index--) {
    const left = frames[index]!;
    const right = frames[index + 1]!;
    const interpolation = `${left.value}+(${right.value}-${left.value})*(${time}-${left.time})/${right.time - left.time}`;
    expression = `if(lt(${time}\\,${right.time})\\,${interpolation}\\,${expression})`;
  }
  const first = frames[0]!;
  if (first.time > 0) expression = `if(lt(${time}\\,${first.time})\\,${first.value}\\,${expression})`;
  return expression;
}

function colorFilters(clip: EditorClip) {
  const brightness = clip.brightness ?? 1;
  const contrast = clip.contrast ?? 1;
  const saturation = clip.saturation ?? 1;
  const filters: string[] = [];
  const channels = (expression: string) => `lutrgb=r='${expression}':g='${expression}':b='${expression}'`;
  if (brightness !== 1) filters.push(channels(`clip(val*${brightness},0,255)`));
  if (contrast !== 1) filters.push(channels(`clip((val-127.5)*${contrast}+127.5,0,255)`));
  if (saturation === 1) return filters.join(",") || "null";
  const red = 0.2126 * (1 - saturation);
  const green = 0.7152 * (1 - saturation);
  const blue = 0.0722 * (1 - saturation);
  // ACT: colorchannelmixer 的矩阵项上限为 2；先减半再恢复亮度，覆盖 CSS 的 0–3 倍饱和度。
  const factor = saturation > 2 ? 2 : 1;
  filters.push(`colorchannelmixer=rr=${(red + saturation) / factor}:rg=${green / factor}:rb=${blue / factor}:gr=${red / factor}:gg=${(green + saturation) / factor}:gb=${blue / factor}:br=${red / factor}:bg=${green / factor}:bb=${(blue + saturation) / factor}`);
  if (factor !== 1) filters.push(channels(`clip(val*${factor},0,255)`));
  return filters.join(",");
}

function tempoFilters(speed: number) {
  if (speed < 0.5) return `atempo=0.5,atempo=${speed / 0.5}`;
  if (speed > 2) return `atempo=2,atempo=${speed / 2}`;
  return `atempo=${speed}`;
}

async function removeExportFile(files: ReturnType<typeof useWorkspaceFiles>, path: string) {
  try {
    await files.remove(path);
  } catch (error) {
    if ((error as { response?: { status?: number } }).response?.status !== 404) throw error;
  }
}

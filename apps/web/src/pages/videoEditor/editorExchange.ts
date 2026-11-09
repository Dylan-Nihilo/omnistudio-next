import { clipDuration, parseEditorProject, type EditorAsset, type EditorClip, type EditorProject } from "./editorModel";

export type EdlEvent = {
  event: number;
  reel: string;
  sourceIn: number;
  sourceOut: number;
  recordIn: number;
  recordOut: number;
  clipName: string;
};

const maxEdlBytes = 2 * 1024 * 1024;
const timecodePattern = /^(\d{2}):(\d{2}):(\d{2}):(\d{2})$/;

function invalid(message: string): never {
  throw new Error(`EDL ${message}`);
}

function assertFrameRate(frameRate: number) {
  if (![24, 25, 30, 60].includes(frameRate)) invalid("只支持 24、25、30 或 60 fps 工程");
}

function frameFromTime(seconds: number, frameRate: number, label: string) {
  const frames = Math.round(seconds * frameRate);
  if (!Number.isSafeInteger(frames) || Math.abs(frames / frameRate - seconds) > 0.001) invalid(`${label}必须落在完整帧上`);
  return frames;
}

function timecodeFromFrame(frame: number, frameRate: number) {
  if (!Number.isSafeInteger(frame) || frame < 0) invalid("时间码帧数无效");
  const frames = frame % frameRate;
  const totalSeconds = Math.floor(frame / frameRate);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours > 99) invalid("时间线超过 EDL 支持的 100 小时");
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function frameFromTimecode(value: string, frameRate: number, label: string) {
  const match = timecodePattern.exec(value);
  if (!match) invalid(`${label}时间码格式无效`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const frames = Number(match[4]);
  if (minutes > 59 || seconds > 59 || frames >= frameRate || hours > 99) invalid(`${label}时间码超出工程帧率范围`);
  return ((hours * 60 + minutes) * 60 + seconds) * frameRate + frames;
}

function safeComment(value: string, limit = 500) {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit);
}

function isDefaultNumber(value: number | undefined, fallback: number) {
  return value === undefined || Math.abs(value - fallback) < 0.000001;
}

function assertEdlClip(clip: EditorClip, frameRate: number, index: number) {
  if (clip.kind !== "video" && clip.kind !== "image") invalid(`第 ${index + 1} 个片段不是视频或图片，无法无损导出`);
  if (clip.speed !== undefined && Math.abs(clip.speed - 1) > 0.000001) invalid(`片段「${clip.title}」使用了变速，EDL 不支持变速`);
  if (clip.keyframes?.length) invalid(`片段「${clip.title}」使用了关键帧，EDL 不支持关键帧`);
  if (!isDefaultNumber(clip.volume, 1) || !isDefaultNumber(clip.gainDb, 0)) invalid(`片段「${clip.title}」使用了音量或增益，EDL 不支持音频混音参数`);
  if (!isDefaultNumber(clip.x, 0) || !isDefaultNumber(clip.y, 0) || !isDefaultNumber(clip.scale, 1) || !isDefaultNumber(clip.rotation, 0) || !isDefaultNumber(clip.opacity, 1) || !isDefaultNumber(clip.brightness, 1) || !isDefaultNumber(clip.contrast, 1) || !isDefaultNumber(clip.saturation, 1) || !isDefaultNumber(clip.fadeIn, 0) || !isDefaultNumber(clip.fadeOut, 0) || !isDefaultNumber(clip.transitionIn, 0) || !isDefaultNumber(clip.transitionOut, 0)) {
    invalid(`片段「${clip.title}」使用了画面效果或淡化，EDL 不支持这些效果`);
  }
  if (!clip.assetId) invalid(`片段「${clip.title}」缺少素材引用`);
  const start = frameFromTime(clip.start, frameRate, `片段「${clip.title}」起点`);
  const sourceIn = frameFromTime(clip.inPoint, frameRate, `片段「${clip.title}」入点`);
  const sourceOut = frameFromTime(clip.outPoint, frameRate, `片段「${clip.title}」出点`);
  const recordOut = start + sourceOut - sourceIn;
  if (sourceOut <= sourceIn || recordOut <= start) invalid(`片段「${clip.title}」时长无效`);
  return { start, sourceIn, sourceOut, recordOut };
}

function findAsset(assetId: string, assets: EditorAsset[], title: string) {
  const asset = assets.find(item => item.id === assetId);
  if (!asset) invalid(`片段「${title}」引用的素材不存在`);
  return asset;
}

export function exportEdl(project: EditorProject): string {
  const snapshot = parseEditorProject(JSON.parse(JSON.stringify(project)));
  assertFrameRate(snapshot.frameRate);
  const clips = snapshot.clips
    .filter(clip => clip.kind === "video" || clip.kind === "image")
    .sort((left, right) => left.start - right.start || left.id.localeCompare(right.id));
  if (!clips.length) invalid("工程没有可导出的画面片段");
  if (snapshot.clips.some(clip => clip.kind === "audio" || clip.kind === "text")) invalid("工程包含音频或文字片段，请先使用音频混音或 SRT/VTT 交换导出");
  if (snapshot.tracks.some(track => track.kind !== "text" && (!isDefaultNumber(track.volume, 1) || track.solo || track.muted))) invalid("工程使用了轨道混音控制，EDL 不支持音量、独听或静音");
  const lines = [`TITLE: ${safeComment(snapshot.name || "OmniStudio Edit")}`, "FCM: NON-DROP FRAME"];
  let previousEnd = 0;
  clips.forEach((clip, index) => {
    const timing = assertEdlClip(clip, snapshot.frameRate, index);
    if (timing.start < previousEnd) invalid(`片段「${clip.title}」与前一片段重叠，EDL 只支持顺序剪辑`);
    const asset = findAsset(clip.assetId!, snapshot.assets, clip.title);
    const event = String(index + 1).padStart(3, "0");
    const sourceIn = timecodeFromFrame(timing.sourceIn, snapshot.frameRate);
    const sourceOut = timecodeFromFrame(timing.sourceOut, snapshot.frameRate);
    const recordIn = timecodeFromFrame(timing.start, snapshot.frameRate);
    const recordOut = timecodeFromFrame(timing.recordOut, snapshot.frameRate);
    lines.push(`${event}  AX       V     C        ${sourceIn} ${sourceOut} ${recordIn} ${recordOut}`);
    lines.push(`* FROM CLIP NAME: ${safeComment(asset.path, 4096)}`);
    lines.push(`* CLIP TITLE: ${safeComment(clip.title)}`);
    previousEnd = timing.recordOut;
  });
  return `${lines.join("\n")}\n`;
}

function parseEdlLines(content: string, frameRate: number): EdlEvent[] {
  if (typeof content !== "string" || !content.trim()) invalid("文件为空");
  if (content.length > maxEdlBytes) invalid("文件超过 2 MiB");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) invalid("文件包含控制字符");
  const lines = content.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").split("\n");
  const events: EdlEvent[] = [];
  let clipName = "";
  let lastParsed: EdlEvent | undefined;
  let lastEvent = 0;
  let previousRecordOut = 0;
  for (const [lineIndex, original] of lines.entries()) {
    const line = original.trim();
    if (!line) continue;
    if (line.startsWith("TITLE:") || line === "FCM: NON-DROP FRAME" || line.startsWith("*")) {
      const source = /^\*\s*FROM CLIP NAME:\s*(.+)$/i.exec(line);
      if (source) {
        const value = source[1]!.trim();
        if (lastParsed && !lastParsed.clipName) lastParsed.clipName = value;
        else clipName = value;
      }
      continue;
    }
    const match = /^(\d{3,6})\s+(\S+)\s+V\s+C\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+.*)?$/.exec(line);
    if (!match) invalid(`第 ${lineIndex + 1} 行格式无效`);
    const event = Number(match[1]);
    if (!Number.isSafeInteger(event) || event <= lastEvent) invalid("事件编号必须递增且不重复");
    const sourceIn = frameFromTimecode(match[3]!, frameRate, "源入点");
    const sourceOut = frameFromTimecode(match[4]!, frameRate, "源出点");
    const recordIn = frameFromTimecode(match[5]!, frameRate, "时间线入点");
    const recordOut = frameFromTimecode(match[6]!, frameRate, "时间线出点");
    if (sourceOut <= sourceIn || recordOut <= recordIn || recordOut - recordIn !== sourceOut - sourceIn) invalid(`第 ${lineIndex + 1} 行源和时间线时长不一致`);
    if (recordIn < previousRecordOut) invalid(`第 ${lineIndex + 1} 行与前一事件在时间线上重叠`);
    const parsed: EdlEvent = { event, reel: match[2]!, sourceIn, sourceOut, recordIn, recordOut, clipName };
    events.push(parsed);
    lastParsed = parsed;
    clipName = "";
    lastEvent = event;
    previousRecordOut = recordOut;
  }
  if (!events.length) invalid("文件没有有效视频事件");
  if (events.some(event => !event.clipName)) invalid("存在事件缺少 FROM CLIP NAME 注释");
  return events;
}

function findEdlAsset(name: string, assets: EditorAsset[]) {
  const normalized = name.trim();
  const exactPath = assets.find(asset => asset.path === normalized);
  if (exactPath) return exactPath;
  const exactName = assets.filter(asset => asset.name === normalized);
  if (exactName.length === 1) return exactName[0]!;
  if (!exactName.length) invalid(`找不到素材「${normalized}」，请先导入对应文件`);
  invalid(`素材名称「${normalized}」对应多个文件，请改用素材路径`);
}

export function importEdl(content: string, project: EditorProject): EditorProject {
  const snapshot = parseEditorProject(JSON.parse(JSON.stringify(project)));
  assertFrameRate(snapshot.frameRate);
  const events = parseEdlLines(content, snapshot.frameRate);
  const videoTrack = snapshot.tracks.find(track => track.kind === "video");
  if (!videoTrack) invalid("工程没有视频轨道");
  const imported = events.map((event, index): EditorClip => {
    const asset = findEdlAsset(event.clipName, snapshot.assets);
    if (asset.kind !== "video" && asset.kind !== "image") invalid(`素材「${event.clipName}」不是视频或图片`);
    if (asset.kind !== "image" && event.sourceOut / snapshot.frameRate > asset.duration + 0.000001) invalid(`素材「${event.clipName}」的 EDL 出点超过素材时长`);
    return {
      id: crypto.randomUUID(),
      assetId: asset.id,
      title: asset.name,
      kind: asset.kind,
      track: videoTrack.id,
      start: event.recordIn / snapshot.frameRate,
      inPoint: event.sourceIn / snapshot.frameRate,
      outPoint: event.sourceOut / snapshot.frameRate,
      volume: 1,
      speed: 1,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 1,
      brightness: 1,
      contrast: 1,
      saturation: 1,
      fadeIn: 0,
      fadeOut: 0,
    };
  });
  const preserved = snapshot.clips.filter(clip => clip.kind !== "video" && clip.kind !== "image");
  return parseEditorProject({ ...snapshot, clips: [...preserved, ...imported] });
}

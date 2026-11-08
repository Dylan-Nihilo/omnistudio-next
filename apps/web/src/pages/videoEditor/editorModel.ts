export type MediaKind = "video" | "audio" | "image";
export type TrackKind = "video" | "audio" | "text";

export type EditorAsset = {
  id: string;
  name: string;
  path: string;
  kind: MediaKind;
  duration: number;
  size: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
};

export type EditorTrack = {
  id: string;
  label: string;
  kind: TrackKind;
  locked: boolean;
  muted: boolean;
  hidden: boolean;
};

export type EditorKeyframeProperty = "x" | "y" | "opacity";

export type EditorKeyframe = {
  property: EditorKeyframeProperty;
  time: number;
  value: number;
};

export type EditorClip = {
  id: string;
  assetId?: string;
  title: string;
  kind: MediaKind | "text";
  track: string;
  start: number;
  inPoint: number;
  outPoint: number;
  volume: number;
  text?: string;
  speed?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  fadeIn?: number;
  fadeOut?: number;
  fontSize?: number;
  textColor?: string;
  textX?: number;
  textY?: number;
  keyframes?: EditorKeyframe[];
};

export type EditorProject = {
  version: 2;
  assets: EditorAsset[];
  clips: EditorClip[];
  tracks: EditorTrack[];
  aspectRatio: string;
  frameRate: number;
  exportHeight: 720 | 1080 | 2160;
  exportQuality: "draft" | "standard" | "high";
};

const maxDuration = 24 * 60 * 60;

export function createDefaultTracks(): EditorTrack[] {
  return ([
    { id: "text", label: "文字", kind: "text" },
    { id: "video", label: "视频", kind: "video" },
    { id: "audio", label: "音频", kind: "audio" },
  ] as const).map(track => ({ ...track, locked: false, muted: false, hidden: false }));
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}格式错误`);
  return value as Record<string, unknown>;
}

function readString(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new Error(`${label}必须为有效文字`);
  return value;
}

function readNumber(value: unknown, label: string, minimum: number, maximum = Number.MAX_VALUE): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label}超出有效范围`);
  return value;
}

function readTime(value: unknown, label: string, minimum = 0): number {
  if (typeof value === "number" && Number.isFinite(value) && value > maxDuration) throw new Error(`${label}不能超过 24 小时`);
  return readNumber(value, label, minimum, maxDuration);
}

function readOptionalNumber(item: Record<string, unknown>, key: string, fallback: number, label: string, minimum: number, maximum = Number.MAX_VALUE): number {
  return readNumber(item[key] === undefined ? fallback : item[key], label, minimum, maximum);
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label}必须为布尔值`);
  return value;
}

function readChoice<T extends string | number>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) throw new Error(`${label}不受支持`);
  return value as T;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label}必须为列表`);
  return value;
}

function assertUniqueIds(items: { id: string }[], label: string) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`${label}存在重复编号：${item.id}`);
    ids.add(item.id);
  }
}

function readRelativePath(value: unknown): string {
  const path = readString(value, "素材路径");
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || /[\\:<>"|?*\u0000-\u001f]/.test(path) || path.startsWith("/") || path.split("/").some(part => !part || part === "." || part === ".." || part.endsWith(".") || part.endsWith(" "))) throw new Error("素材路径必须为工作区内的相对文件路径");
  return path;
}

function parseAsset(value: unknown, index: number): EditorAsset {
  const item = readObject(value, `素材 ${index + 1}`);
  const size = readNumber(item.size, "素材大小", 0);
  if (!Number.isSafeInteger(size)) throw new Error("素材大小必须为非负安全整数");
  const asset: EditorAsset = {
    id: readString(item.id, "素材编号"),
    name: readString(item.name, "素材名称"),
    path: readRelativePath(item.path),
    kind: readChoice(item.kind, ["video", "audio", "image"] as const, "素材类型"),
    duration: readTime(item.duration, "素材时长", Number.MIN_VALUE),
    size,
  };
  for (const key of ["width", "height"] as const) {
    if (item[key] === undefined) continue;
    const dimension = readNumber(item[key], "素材尺寸", 1);
    if (!Number.isSafeInteger(dimension)) throw new Error("素材尺寸必须为正整数");
    asset[key] = dimension;
  }
  if (item.hasAudio !== undefined) asset.hasAudio = readBoolean(item.hasAudio, "素材音轨标记");
  return asset;
}

function parseTrack(value: unknown, index: number): EditorTrack {
  const item = readObject(value, `轨道 ${index + 1}`);
  return {
    id: readString(item.id, "轨道编号"),
    label: readString(item.label, "轨道名称"),
    kind: readChoice(item.kind, ["video", "audio", "text"] as const, "轨道类型"),
    locked: readBoolean(item.locked, "轨道锁定状态"),
    muted: readBoolean(item.muted, "轨道静音状态"),
    hidden: readBoolean(item.hidden, "轨道隐藏状态"),
  };
}

function parseKeyframes(value: unknown, duration: number): EditorKeyframe[] {
  const items = readArray(value, "关键帧");
  if (items.length > 2048) throw new Error("单个片段不能超过 2048 个关键帧");
  const seen = new Set<string>();
  return items.map((value, index) => {
    const item = readObject(value, `关键帧 ${index + 1}`);
    if (Object.keys(item).some(key => !["property", "time", "value"].includes(key))) throw new Error(`关键帧 ${index + 1} 包含不支持的字段`);
    const property = readChoice(item.property, ["x", "y", "opacity"] as const, "关键帧属性");
    const time = readTime(item.time, "关键帧时间");
    const [minimum, maximum] = property === "opacity" ? [0, 1] : [-200, 200];
    if (time > duration + .000001) throw new Error("关键帧时间不能超出片段时长");
    const frame = { property, time: Math.min(time, duration), value: readNumber(item.value, "关键帧数值", minimum, maximum) };
    const identity = `${property}:${frame.time}`;
    if (seen.has(identity)) throw new Error("同一属性不能在相同时间重复设置关键帧");
    seen.add(identity);
    return frame;
  }).sort((left, right) => left.time - right.time || left.property.localeCompare(right.property));
}

function parseClip(value: unknown, index: number, assets: Map<string, EditorAsset>, tracks: Map<string, EditorTrack>): EditorClip {
  const item = readObject(value, `片段 ${index + 1}`);
  const clip: EditorClip = {
    id: readString(item.id, "片段编号"),
    title: readString(item.title, "片段名称"),
    kind: readChoice(item.kind, ["video", "audio", "image", "text"] as const, "片段类型"),
    track: readString(item.track, "片段轨道"),
    start: readTime(item.start, "片段起点"),
    inPoint: readTime(item.inPoint, "片段入点"),
    outPoint: readTime(item.outPoint, "片段出点"),
    volume: readNumber(item.volume, "片段音量", 0, 2),
    speed: readOptionalNumber(item, "speed", 1, "片段速度", 0.25, 4),
    x: readOptionalNumber(item, "x", 0, "水平位置", -200, 200),
    y: readOptionalNumber(item, "y", 0, "垂直位置", -200, 200),
    scale: readOptionalNumber(item, "scale", 1, "片段缩放", 0.1, 5),
    rotation: readOptionalNumber(item, "rotation", 0, "片段旋转", -360, 360),
    opacity: readOptionalNumber(item, "opacity", 1, "片段透明度", 0, 1),
    brightness: readOptionalNumber(item, "brightness", 1, "片段亮度", 0, 3),
    contrast: readOptionalNumber(item, "contrast", 1, "片段对比度", 0, 3),
    saturation: readOptionalNumber(item, "saturation", 1, "片段饱和度", 0, 3),
    fontSize: readOptionalNumber(item, "fontSize", 4, "文字大小", 1, 20),
    textColor: readString(item.textColor === undefined ? "#ffffff" : item.textColor, "文字颜色"),
    textX: readOptionalNumber(item, "textX", 50, "文字水平位置", 0, 100),
    textY: readOptionalNumber(item, "textY", 90, "文字垂直位置", 0, 100),
  };
  if (!/^#[\da-f]{6}$/i.test(clip.textColor!)) throw new Error("文字颜色必须为六位十六进制颜色");
  if (clip.outPoint <= clip.inPoint) throw new Error(`片段「${clip.title}」的出点必须晚于入点`);
  const duration = clipDuration(clip);
  if (!Number.isFinite(duration) || !Number.isFinite(clip.start + duration) || clip.start + duration > maxDuration) throw new Error("片段结束时间不能超过 24 小时");
  clip.fadeIn = readOptionalNumber(item, "fadeIn", 0, "淡入时长", 0, duration);
  clip.fadeOut = readOptionalNumber(item, "fadeOut", 0, "淡出时长", 0, duration);
  if (item.keyframes !== undefined) {
    if (clip.kind !== "video" && clip.kind !== "image") throw new Error("当前仅支持视频和图片片段关键帧");
    clip.keyframes = parseKeyframes(item.keyframes, duration);
  }
  const track = tracks.get(clip.track);
  if (!track || track.kind !== (clip.kind === "image" ? "video" : clip.kind)) throw new Error(`片段「${clip.title}」引用了不存在或类型不匹配的轨道`);
  if (clip.kind === "text") {
    clip.text = readString(item.text, "片段文字", true);
    if (item.assetId !== undefined) throw new Error("文字片段不能引用媒体素材");
    return clip;
  }
  clip.assetId = readString(item.assetId, "片段素材编号");
  const asset = assets.get(clip.assetId);
  if (!asset || asset.kind !== clip.kind) throw new Error(`片段「${clip.title}」引用了不存在或类型不匹配的素材`);
  if (clip.kind !== "image" && clip.outPoint > asset.duration + 0.000001) throw new Error(`片段「${clip.title}」的出点超过素材时长`);
  return clip;
}

export function parseEditorProject(value: unknown): EditorProject {
  const item = readObject(value, "剪辑项目");
  if (item.version !== 1 && item.version !== 2) throw new Error("不支持的剪辑项目版本，请使用兼容版本打开");
  const assets = readArray(item.assets, "素材").map(parseAsset);
  const tracks = item.version === 1 ? createDefaultTracks() : readArray(item.tracks, "轨道").map(parseTrack);
  assertUniqueIds(assets, "素材");
  assertUniqueIds(tracks, "轨道");
  const assetMap = new Map(assets.map(asset => [asset.id, asset]));
  const trackMap = new Map(tracks.map(track => [track.id, track]));
  const clips = readArray(item.clips, "片段").map((clip, index) => parseClip(clip, index, assetMap, trackMap));
  assertUniqueIds(clips, "片段");
  return {
    version: 2,
    assets,
    clips,
    tracks,
    aspectRatio: readChoice(item.aspectRatio, ["16:9", "9:16", "1:1", "4:3"] as const, "画面比例"),
    frameRate: readChoice(item.frameRate, [24, 25, 30, 60] as const, "帧率"),
    exportHeight: readChoice(item.version === 1 ? 1080 : item.exportHeight, [720, 1080, 2160] as const, "输出分辨率"),
    exportQuality: readChoice(item.version === 1 ? "standard" : item.exportQuality, ["draft", "standard", "high"] as const, "输出质量"),
  };
}

export function clipDuration(clip: EditorClip): number {
  return (clip.outPoint - clip.inPoint) / (clip.speed ?? 1);
}

export function clipKeyframeValue(clip: EditorClip, property: EditorKeyframeProperty, time: number): number {
  const frames = clip.keyframes?.filter(frame => frame.property === property) ?? [];
  const fallback = property === "opacity" ? clip.opacity ?? 1 : clip[property] ?? 0;
  if (!frames.length) return fallback;
  if (time <= frames[0]!.time) return frames[0]!.value;
  for (let index = 1; index < frames.length; index++) {
    const right = frames[index]!;
    if (time <= right.time) {
      const left = frames[index - 1]!;
      return left.value + (right.value - left.value) * ((time - left.time) / (right.time - left.time));
    }
  }
  return frames.at(-1)!.value;
}

export function sliceClipKeyframes(clip: EditorClip, start: number, end: number): EditorKeyframe[] | undefined {
  if (!clip.keyframes?.length) return clip.keyframes;
  const frames: EditorKeyframe[] = [];
  for (const property of ["x", "y", "opacity"] as const) {
    const points = clip.keyframes.filter(frame => frame.property === property);
    if (!points.length) continue;
    const shifted = points.filter(frame => frame.time >= start && frame.time <= end).map(frame => ({ ...frame, time: frame.time - start }));
    if (points[0]!.time < start && shifted[0]?.time !== 0) shifted.unshift({ property, time: 0, value: clipKeyframeValue(clip, property, start) });
    if (points.at(-1)!.time > end && shifted.at(-1)?.time !== end - start) shifted.push({ property, time: end - start, value: clipKeyframeValue(clip, property, end) });
    frames.push(...shifted);
  }
  return frames.sort((left, right) => left.time - right.time || left.property.localeCompare(right.property));
}

function parseSubtitleTime(value: string): number {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new Error(`字幕时间格式错误：${value}`);
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
  if (!Number.isFinite(seconds) || seconds > maxDuration) throw new Error("字幕时间不能超过 24 小时");
  return seconds;
}

function decodeSubtitleText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&(?:amp|lt|gt|nbsp|quot|apos);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": " ", "&quot;": "\"", "&apos;": "'" })[entity]!);
}

export function parseSubtitles(content: string): { start: number; end: number; text: string }[] {
  const normalized = content.replace(/^\ufeff/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("字幕文件为空");
  const isVtt = /^WEBVTT(?:[ \t]|$)/.test(normalized.split("\n")[0]!);
  const blocks = normalized.split(/\n[ \t]*\n/);
  const cues: { start: number; end: number; text: string }[] = [];
  for (const [index, block] of blocks.entries()) {
    if (isVtt && (index === 0 || /^(?:NOTE(?:[ \t]|$)|STYLE$|REGION$)/m.test(block.split("\n")[0]!))) continue;
    const lines = block.split("\n");
    const timeIndex = lines[0]?.includes("-->") ? 0 : 1;
    const timing = /^(\S+)\s+-->\s+(\S+)(?:[ \t]+[^\n]*)?$/.exec(lines[timeIndex] ?? "");
    if (!timing) throw new Error(`第 ${index + 1} 段字幕的时间格式错误`);
    const start = parseSubtitleTime(timing[1]!);
    const end = parseSubtitleTime(timing[2]!);
    const text = decodeSubtitleText(lines.slice(timeIndex + 1).join("\n")).trim();
    if (end <= start || !text) throw new Error(`第 ${index + 1} 段字幕的时长或内容无效`);
    cues.push({ start, end, text });
  }
  if (!cues.length) throw new Error("字幕文件中没有有效字幕");
  return cues.sort((a, b) => a.start - b.start);
}

function formatSubtitleTime(milliseconds: number, format: "srt" | "vtt"): string {
  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.floor(milliseconds / 60000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const fraction = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${format === "srt" ? "," : "."}${String(fraction).padStart(3, "0")}`;
}

export function serializeSubtitles(clips: EditorClip[], format: "srt" | "vtt"): string {
  const blocks = clips.filter(clip => clip.kind === "text" && clip.text?.trim()).sort((a, b) => a.start - b.start).map((clip, index) => {
    const duration = clipDuration(clip);
    if (!Number.isFinite(clip.start) || clip.start < 0 || !Number.isFinite(duration) || duration <= 0 || clip.start + duration > maxDuration || !Number.isSafeInteger(Math.round((clip.start + duration) * 1000))) throw new Error("字幕片段结束时间不能超过 24 小时或时间无效");
    const start = Math.round(clip.start * 1000);
    const end = Math.max(start + 1, Math.round((clip.start + duration) * 1000));
    const text = clip.text!.replace(/\r\n?/g, "\n").replace(/\n[ \t]*\n+/g, "\n").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `${format === "srt" ? `${index + 1}\n` : ""}${formatSubtitleTime(start, format)} --> ${formatSubtitleTime(end, format)}\n${text}`;
  });
  return `${format === "vtt" ? "WEBVTT\n\n" : ""}${blocks.join("\n\n")}${blocks.length ? "\n" : ""}`;
}

import {
  clipDuration,
  sliceClipKeyframes,
  type EditorAsset,
  type EditorClip,
  type EditorTrack,
} from "./editorModel";

export type TimelineEditContext = {
  clips: EditorClip[];
  tracks: EditorTrack[];
  assets: EditorAsset[];
  frameRate: number;
};

const maxDuration = 24 * 60 * 60;
const epsilon = 0.000001;

function requireContext(context: TimelineEditContext): number {
  if (![24, 25, 30, 60].includes(context.frameRate)) throw new Error("项目帧率无效");
  return 1 / context.frameRate;
}

function frameDelta(value: number, frameDuration: number): number {
  if (!Number.isFinite(value)) throw new Error("编辑时长无效");
  const snapped = Math.round(value / frameDuration) * frameDuration;
  if (Math.abs(snapped) < epsilon) throw new Error("编辑量不足一帧");
  return snapped;
}

function requireClip(context: TimelineEditContext, clipId: string): EditorClip {
  const clip = context.clips.find(item => item.id === clipId);
  if (!clip) throw new Error("未找到要编辑的片段");
  requireTimelineBounds(clip.start, clipDuration(clip), clip.title);
  requireFrameLength(clipDuration(clip), 1 / context.frameRate, clip.title);
  return clip;
}

function requireTrack(context: TimelineEditContext, clip: EditorClip): EditorTrack {
  const track = context.tracks.find(item => item.id === clip.track);
  if (!track) throw new Error(`片段「${clip.title}」所在轨道不存在`);
  if (track.locked) throw new Error(`轨道「${track.label}」已锁定`);
  return track;
}

function requireAsset(context: TimelineEditContext, clip: EditorClip): EditorAsset | undefined {
  if (clip.kind === "text") return undefined;
  const asset = context.assets.find(item => item.id === clip.assetId);
  if (!asset || asset.kind !== clip.kind) throw new Error(`片段「${clip.title}」引用的素材不存在或类型不匹配`);
  return asset;
}

function requireFrameLength(duration: number, frameDuration: number, title: string): void {
  if (!Number.isFinite(duration) || duration < frameDuration - epsilon) throw new Error(`片段「${title}」至少需要保留一帧`);
}

function requireTimelineBounds(start: number, duration: number, title: string): void {
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || start + duration > maxDuration) throw new Error(`片段「${title}」不能超出 24 小时时间线`);
}

function requireSourceBounds(clip: EditorClip, asset: EditorAsset | undefined, inPoint: number, outPoint: number): void {
  if (!Number.isFinite(inPoint) || !Number.isFinite(outPoint) || inPoint < 0 || outPoint <= inPoint || outPoint > maxDuration || (asset && clip.kind !== "image" && outPoint > asset.duration + epsilon)) {
    throw new Error(`片段「${clip.title}」不能超出素材边界`);
  }
}

function shiftLaterClips(context: TimelineEditContext, from: number, delta: number, excludedId: string): Map<string, EditorClip> {
  const shifted = new Map<string, EditorClip>();
  for (const clip of context.clips) {
    if (clip.id === excludedId || clip.start < from - epsilon) continue;
    const track = context.tracks.find(item => item.id === clip.track);
    if (!track) throw new Error(`片段「${clip.title}」所在轨道不存在`);
    if (track.locked) throw new Error(`波纹编辑会影响已锁定的「${track.label}」轨道`);
    const start = clip.start + delta;
    requireTimelineBounds(start, clipDuration(clip), clip.title);
    shifted.set(clip.id, { ...clip, start });
  }
  return shifted;
}

function requireClearRippleRange(context: TimelineEditContext, start: number, end: number, excludedId: string): void {
  for (const clip of context.clips) {
    if (clip.id !== excludedId && clip.start < end - epsilon && clip.start + clipDuration(clip) > start + epsilon) {
      throw new Error(`片段「${clip.title}」跨越波纹编辑区间，请先分割或移动该片段`);
    }
  }
}

function trimClip(clip: EditorClip, edge: "left" | "right", delta: number, frameDuration: number, asset?: EditorAsset): EditorClip {
  const speed = clip.speed ?? 1;
  const sourceDelta = delta * speed;
  const inPoint = clip.inPoint + (edge === "left" ? sourceDelta : 0);
  const outPoint = clip.outPoint + (edge === "right" ? sourceDelta : 0);
  const duration = (outPoint - inPoint) / speed;
  requireFrameLength(duration, frameDuration, clip.title);
  requireSourceBounds(clip, asset, inPoint, outPoint);
  const keyframes = edge === "left"
    ? sliceClipKeyframes(clip, delta, clipDuration(clip))
    : sliceClipKeyframes(clip, 0, duration);
  return { ...clip, inPoint, outPoint, keyframes, fadeIn: Math.min(clip.fadeIn ?? 0, duration), fadeOut: Math.min(clip.fadeOut ?? 0, duration) };
}

export function rippleDeleteClip(context: TimelineEditContext, clipId: string): EditorClip[] {
  requireContext(context);
  const selected = requireClip(context, clipId);
  requireTrack(context, selected);
  const start = selected.start;
  const end = start + clipDuration(selected);
  const duration = end - start;
  // ACT: Refuse cross-track intersections instead of guessing how to split linked media.
  requireClearRippleRange(context, start, end, selected.id);
  const updates = shiftLaterClips(context, end, -duration, selected.id);
  return context.clips.filter(clip => clip.id !== selected.id).map(clip => updates.get(clip.id) ?? clip);
}

export function rippleTrimClip(context: TimelineEditContext, clipId: string, edge: "left" | "right", deltaTimeline: number): EditorClip[] {
  const frameDuration = requireContext(context);
  const selected = requireClip(context, clipId);
  requireTrack(context, selected);
  if (edge !== "left" && edge !== "right") throw new Error("修剪边缘无效");
  const delta = frameDelta(deltaTimeline, frameDuration);
  const oldDuration = clipDuration(selected);
  const next = trimClip(selected, edge, delta, frameDuration, requireAsset(context, selected));
  requireTimelineBounds(next.start, clipDuration(next), next.title);
  const timelineDelta = edge === "left" ? -delta : delta;
  const boundary = selected.start + oldDuration;
  const nextBoundary = boundary + timelineDelta;
  // The old end is the sync boundary; earlier clips must not move when shrinking the selected clip.
  if (timelineDelta < 0) requireClearRippleRange(context, nextBoundary, boundary, selected.id);
  else {
    for (const clip of context.clips) {
      if (clip.id !== selected.id && clip.start < boundary - epsilon && clip.start + clipDuration(clip) > boundary + epsilon) {
        throw new Error(`片段「${clip.title}」跨越波纹边界，请先分割或移动该片段`);
      }
    }
  }
  const shifted = shiftLaterClips(context, boundary, timelineDelta, selected.id);
  return context.clips.map(clip => clip.id === selected.id ? next : shifted.get(clip.id) ?? clip);
}

export function rollEditClips(context: TimelineEditContext, leftClipId: string, rightClipId: string, deltaTimeline: number): EditorClip[] {
  const frameDuration = requireContext(context);
  const left = requireClip(context, leftClipId);
  const right = requireClip(context, rightClipId);
  if (left.id === right.id || left.track !== right.track) throw new Error("滚动修剪需要同一轨道上的两个相邻片段");
  requireTrack(context, left);
  requireTrack(context, right);
  const leftEnd = left.start + clipDuration(left);
  if (Math.abs(leftEnd - right.start) > epsilon) throw new Error("滚动修剪需要两个片段无缝相邻");
  const rightEnd = right.start + clipDuration(right);
  if (context.clips.some(clip => clip.id !== left.id && clip.id !== right.id && clip.track === left.track && clip.start < rightEnd - epsilon && clip.start + clipDuration(clip) > left.start + epsilon)) {
    throw new Error("滚动修剪区间存在同轨重叠片段，请先整理轨道");
  }
  const delta = frameDelta(deltaTimeline, frameDuration);
  const leftNext = trimClip(left, "right", delta, frameDuration, requireAsset(context, left));
  const rightNext = trimClip(right, "left", delta, frameDuration, requireAsset(context, right));
  const rightStart = right.start + delta;
  requireTimelineBounds(rightStart, clipDuration(rightNext), right.title);
  return context.clips.map(clip => clip.id === left.id ? leftNext : clip.id === right.id ? { ...rightNext, start: rightStart } : clip);
}

export function slipEditClip(context: TimelineEditContext, clipId: string, deltaTimeline: number): EditorClip[] {
  const frameDuration = requireContext(context);
  const clip = requireClip(context, clipId);
  requireTrack(context, clip);
  if (clip.kind === "image" || clip.kind === "text") throw new Error("滑移编辑仅适用于视频或音频片段");
  const delta = frameDelta(deltaTimeline, frameDuration);
  const asset = requireAsset(context, clip);
  const sourceDelta = delta * (clip.speed ?? 1);
  const inPoint = clip.inPoint + sourceDelta;
  const outPoint = clip.outPoint + sourceDelta;
  requireSourceBounds(clip, asset, inPoint, outPoint);
  return context.clips.map(item => item.id === clip.id ? { ...clip, inPoint, outPoint } : item);
}

export function insertClipAtTime(context: TimelineEditContext, sourceClip: EditorClip, timelineStart: number): EditorClip[] {
  const frameDuration = requireContext(context);
  const start = Math.round(timelineStart / frameDuration) * frameDuration;
  if (!Number.isFinite(timelineStart) || start < 0 || start > maxDuration) throw new Error("插入位置无效");
  if (context.clips.some(clip => clip.id === sourceClip.id)) throw new Error("新插入的片段编号已存在");
  const track = context.tracks.find(item => item.id === sourceClip.track);
  if (!track || track.kind !== (sourceClip.kind === "image" ? "video" : sourceClip.kind)) throw new Error("素材与目标轨道类型不匹配");
  if (track.locked) throw new Error(`轨道「${track.label}」已锁定`);
  const asset = requireAsset(context, sourceClip);
  const duration = clipDuration(sourceClip);
  requireFrameLength(duration, frameDuration, sourceClip.title);
  if (Math.abs(duration - Math.round(duration / frameDuration) * frameDuration) > epsilon) throw new Error("插入选区时长须为整帧，请先调整入出点");
  requireSourceBounds(sourceClip, asset, sourceClip.inPoint, sourceClip.outPoint);
  requireTimelineBounds(start, duration, sourceClip.title);
  const inserted = { ...sourceClip, start, keyframes: sourceClip.keyframes?.map(frame => ({ ...frame })) };
  const shifted = shiftLaterClips(context, start, duration, inserted.id);
  const result: EditorClip[] = [];

  for (const clip of context.clips) {
    const clipEnd = clip.start + clipDuration(clip);
    if (clip.start >= start - epsilon || clipEnd <= start + epsilon) {
      result.push(shifted.get(clip.id) ?? clip);
      continue;
    }
    const affectedTrack = context.tracks.find(item => item.id === clip.track);
    if (!affectedTrack) throw new Error(`片段「${clip.title}」所在轨道不存在`);
    if (affectedTrack.locked) throw new Error(`插入会影响已锁定的「${affectedTrack.label}」轨道`);
    const localTime = start - clip.start;
    const oldDuration = clipDuration(clip);
    requireFrameLength(localTime, frameDuration, clip.title);
    requireFrameLength(oldDuration - localTime, frameDuration, clip.title);
    // ACT: The clip model stores fade durations, not the partial alpha envelope needed to continue a fade across inserted media.
    if (localTime < (clip.fadeIn ?? 0) - epsilon || localTime > oldDuration - (clip.fadeOut ?? 0) + epsilon) {
      throw new Error(`插入点位于片段「${clip.title}」的淡化区间，请先调整淡入或淡出`);
    }
    const speed = clip.speed ?? 1;
    const sourcePoint = clip.inPoint + localTime * speed;
    const clipAsset = requireAsset(context, clip);
    requireSourceBounds(clip, clipAsset, clip.inPoint, sourcePoint);
    requireSourceBounds(clip, clipAsset, sourcePoint, clip.outPoint);
    const nextId = crypto.randomUUID();
    if (context.clips.some(item => item.id === nextId) || result.some(item => item.id === nextId) || nextId === inserted.id) throw new Error("无法生成唯一的片段编号");
    const before: EditorClip = {
      ...clip,
      outPoint: sourcePoint,
      keyframes: sliceClipKeyframes(clip, 0, localTime),
      fadeIn: Math.min(clip.fadeIn ?? 0, localTime),
      fadeOut: 0,
    };
    const after: EditorClip = {
      ...clip,
      id: nextId,
      title: `${clip.title}（后段）`,
      start: start + duration,
      inPoint: sourcePoint,
      keyframes: sliceClipKeyframes(clip, localTime, oldDuration),
      fadeIn: 0,
      fadeOut: Math.min(clip.fadeOut ?? 0, oldDuration - localTime),
    };
    requireTimelineBounds(after.start, clipDuration(after), after.title);
    result.push(before, after);
  }

  result.push(inserted);
  return result;
}

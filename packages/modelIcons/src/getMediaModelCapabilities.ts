type MediaModelCapability = {
  type?: string;
  mediaType?: string;
  mode?: unknown;
};

export function getMediaModelCapabilities(model: MediaModelCapability) {
  const type = model.mediaType ?? model.type;
  const modes = Array.isArray(model.mode) ? model.mode.flat(Infinity).filter((item): item is string => typeof item === "string") : [];
  const labels: string[] = [];

  if (type === "image") {
    if (modes.includes("text")) labels.push("文生图");
    if (modes.includes("singleImage")) labels.push("图生图");
    if (modes.includes("multiReference")) labels.push("多图参考");
  }

  if (type === "video") {
    if (modes.includes("text")) labels.push("文生视频");
    const imageReferenceLimit = modes.flatMap(mode => mode.startsWith("imageReference:") ? [Number(mode.slice("imageReference:".length))] : []).filter(limit => Number.isInteger(limit) && limit > 0);
    if (modes.includes("singleImage") || modes.includes("startFrameOptional") || modes.includes("endFrameOptional") || modes.includes("startEndRequired") || imageReferenceLimit.length) labels.push("图生视频");
    const videoReferenceLimit = modes.flatMap(mode => mode.startsWith("videoReference:") ? [Number(mode.slice("videoReference:".length))] : []).filter(limit => Number.isInteger(limit) && limit > 0);
    if (videoReferenceLimit.length) labels.push("视频生视频");
    if (modes.includes("startFrameOptional") && modes.includes("endFrameOptional")) labels.push("首帧/尾帧/首尾帧");
    else if (modes.includes("startFrameOptional")) labels.push("尾帧或首尾帧");
    else if (modes.includes("endFrameOptional")) labels.push("首帧或首尾帧");
    else if (modes.includes("startEndRequired")) labels.push("首尾帧必填");
  }

  return labels.join(" · ");
}

const iconFiles = import.meta.glob<string>([
  "../node_modules/@lobehub/icons-static-svg/icons/*.svg",
  "!../node_modules/@lobehub/icons-static-svg/icons/*-text*.svg",
  "!../node_modules/@lobehub/icons-static-svg/icons/*-brand*.svg",
], {
  eager: true,
  import: "default",
  query: "?url&no-inline",
});

const icons = new Map<string, { src: string; monochrome: boolean }>();
for (const [path, src] of Object.entries(iconFiles)) {
  const file = path.split("/").pop()!.replace(/\.svg$/, "");
  const name = file.replace(/-color$/, "");
  if (name.includes("-")) continue;
  const monochrome = file === name;
  if (!icons.has(name) || !monochrome) icons.set(name, { src, monochrome });
}

// 模型家族名与品牌图标不同的映射；同名品牌自动使用整个图标包中的资源。
const aliases: Record<string, string[]> = {
  openai: ["gpt", "chatgpt", "codex", "whisper", "tts", "o1", "o3", "o4"],
  claude: ["anthropic"],
  qwen: ["qwq", "qvq", "qwenimage", "cosyvoice", "funasr", "sensevoice", "通义千问"],
  meta: ["llama", "meta-llama"],
  mistral: ["mixtral", "magistral", "codestral", "ministral", "pixtral", "devstral", "voxtral"],
  kimi: ["moonshot"],
  chatglm: ["glm", "智谱"],
  wenxin: ["ernie", "文心"],
  kling: ["klingai", "可灵"],
  vidu: ["viduq"],
  google: ["veo", "imagen", "lyria"],
  runway: ["gen2", "gen3", "gen4", "gen-2", "gen-3", "gen-4"],
  luma: ["ray", "dream-machine"],
  hailuo: ["minimax-hailuo", "海螺"],
  alibaba: ["wan", "wanx", "wanvideo", "wan-video", "万相", "通义万相"],
  bytedance: ["seedance", "seedream", "seededit", "doubao-seedance", "doubao-seedream", "doubao-seededit"],
  baidu: ["baiduvideofire", "百度"],
  jimeng: ["即梦"],
  hunyuan: ["hunyuanvideo", "hunyuanimage", "混元"],
  cogvideo: ["cogvideox"],
  lightricks: ["ltx", "ltxvideo"],
  elevenlabs: ["eleven", "scribe"],
  fishaudio: ["fish-audio", "fish-speech", "fishspeech"],
  minimax: ["speech", "music", "abab"],
  stepfun: ["step", "step-audio", "stepaudio"],
  suno: ["chirp"],
  stability: ["stable-diffusion", "stable-audio", "stable-video", "sdxl", "sd3", "svd"],
  dalle: ["dall-e"],
  flux: ["black-forest-labs"],
};

const modelNames = [...icons.keys()].map(name => ({ prefix: name, brand: name }));
for (const [brand, names] of Object.entries(aliases)) {
  for (const prefix of names) modelNames.unshift({ prefix, brand });
}
modelNames.sort((left, right) => right.prefix.length - left.prefix.length);

export function getModelIcon(model: string) {
  // ACT: 无法凭任意名称可靠识别品牌；优先模型路径末段，服务商回退由图标组件处理。
  const segments = model.trim().toLowerCase().replace(/[_.\s]+/g, "-").split("/").reverse();
  for (const name of segments) {
    const match = modelNames.find(({ prefix }) => name.startsWith(prefix)
      && (!name[prefix.length] || /[-:0-9]/.test(name[prefix.length]!)));
    if (match) return icons.get(match.brand);
  }
}

const providerNamePrefixes: Record<string, string[]> = {
  openai: ["openai", "open ai"],
  google: ["google", "谷歌"],
  anthropic: ["anthropic"],
  bytedance: ["bytedance", "字节跳动"],
  baiduVideoFire: ["百度千帆视频", "百度千帆", "百度", "baidu"],
};
const legacyModelLabels: Record<string, string> = {
  "text/deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "text/qwen3.7-plus": "Qwen 3.7 Plus",
  "text/glm-5": "GLM-5",
  "text/gpt-5.6-sol": "GPT-5.6 Sol",
  "text/claude-opus-5": "Claude Opus 5",
};

export function getModelSelectionLabel(model: { label: string; modelId: string; providerId: string }) {
  const label = model.label.trim();
  if (!label) return model.modelId;
  if (/^(标准|通用|推理|高级|极致)模型$/.test(label)) return legacyModelLabels[model.modelId] ?? label;
  // 仅剥离已确认的公司前缀，保留与供应商同名的模型家族（如 DeepSeek、Kling）。
  const providerPrefix = providerNamePrefixes[model.providerId]?.find(prefix => label.toLowerCase().startsWith(prefix)
    && (!label[prefix.length] || /[\s._:/|·：-]/.test(label[prefix.length]!)));
  return providerPrefix ? label.slice(providerPrefix.length).replace(/^[\s._:/|·：-]+/, "") || model.modelId : label;
}

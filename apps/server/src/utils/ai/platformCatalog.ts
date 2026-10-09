export const platformProviders = [
  { providerId: "kaizoText", apiUrl: "https://www.kaizo.top/v1", protocol: "openai-completions" as const, secretRef: "OPENAI_API_KEY", config: { baseUrl: "https://www.kaizo.top/v1" } },
  { providerId: "kaizoImage", apiUrl: "https://www.kaizo.top/v1", protocol: "openai-completions" as const, secretRef: "OPENAI_IMAGE_API_KEY", config: { baseUrl: "https://www.kaizo.top/v1" } },
  { providerId: "jojokey", apiUrl: "https://video.jojokey.com/v1", protocol: "openai-completions" as const, secretRef: "JOJOKEY_API_KEY", config: { baseUrl: "https://video.jojokey.com/v1" } },
  { providerId: "dashscope", apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", protocol: "openai-completions" as const, secretRef: "DASHSCOPE_API_KEY", config: {} },
];

export const platformModelCatalog: Array<{ providerId: string; modelId: string; label: string; mediaType: "text" | "image" | "video"; apiModelId?: string; capabilities?: Record<string, boolean>; sortOrder: number }> = [
  { providerId: "kaizoText", modelId: "text/gpt-5.6-sol", apiModelId: "gpt-5.6-sol", label: "高级 · GPT 5.6 Sol", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 10 },
  { providerId: "kaizoText", modelId: "text/deepseek-v4.1-flash", apiModelId: "DeepSeek-V4.1-Flash", label: "标准 · DeepSeek V4.1 Flash", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 20 },
  { providerId: "kaizoText", modelId: "text/claude-opus-5", apiModelId: "claude-opus-5", label: "极致 · Claude Opus 5", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 30 },
  { providerId: "kaizoImage", modelId: "gpt-image-2", label: "GPT Image 2", mediaType: "image", sortOrder: 100 },
  { providerId: "jojokey", modelId: "seedance-2.0-mini", label: "Seedance 2.0 标准", mediaType: "video", sortOrder: 200 },
  { providerId: "jojokey", modelId: "seedance-2.0-fast", label: "Seedance 2.0 高级", mediaType: "video", sortOrder: 210 },
  { providerId: "jojokey", modelId: "seedance-2.0", label: "Seedance 2.0 卓越", mediaType: "video", sortOrder: 220 },
  { providerId: "jojokey", modelId: "seedance-2.5", label: "Seedance 2.5", mediaType: "video", sortOrder: 230 },
  { providerId: "jojokey", modelId: "minimax-h3", label: "MiniMax H3", mediaType: "video", sortOrder: 240 },
];

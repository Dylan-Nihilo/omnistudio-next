export const platformProviders = [
  { providerId: "kaizoText", apiUrl: "https://kaizo.top/v1", protocol: "openai-completions" as const, secretRef: "OPENAI_API_KEY", config: { baseUrl: "https://kaizo.top/v1" } },
  { providerId: "openheapImage", apiUrl: "https://openheapstack.com/v1", protocol: "openai-completions" as const, secretRef: "OPENHEAP_IMAGE_API_KEY", config: { baseUrl: "https://openheapstack.com/v1" } },
  { providerId: "jojokey", apiUrl: "https://video.jojokey.com/v1", protocol: "openai-completions" as const, secretRef: "JOJOKEY_API_KEY", config: { baseUrl: "https://video.jojokey.com/v1" } },
  { providerId: "dashscope", apiUrl: "https://ws-v856jk108cwj3i2c.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", protocol: "openai-completions" as const, secretRef: "DASHSCOPE_API_KEY", config: {} },
];

export const platformModelCatalog: Array<{ providerId: string; modelId: string; label: string; mediaType: "text" | "image" | "video"; apiModelId?: string; capabilities?: Record<string, boolean>; sortOrder: number }> = [
  { providerId: "kaizoText", modelId: "text/gpt-5.6-sol", apiModelId: "gpt-5.6-sol", label: "高级 · GPT 5.6 Sol", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 10 },
  { providerId: "dashscope", modelId: "text/deepseek-v4.1-flash", apiModelId: "deepseek-v4.1-flash", label: "标准 · DeepSeek V4.1 Flash", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 40 },
  { providerId: "dashscope", modelId: "text/qwen3.8-max", apiModelId: "qwen3.8-max", label: "旗舰 · Qwen 3.8 Max", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 50 },
  { providerId: "dashscope", modelId: "text/qwen3.8-flash", apiModelId: "qwen3.8-flash", label: "快速 · Qwen 3.8 Flash", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 60 },
  { providerId: "dashscope", modelId: "text/qwen3.7-plus", apiModelId: "qwen3.7-plus", label: "均衡 · Qwen 3.7 Plus", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 70 },
  { providerId: "dashscope", modelId: "text/qwen3.7-flash", apiModelId: "qwen3.7-flash", label: "快速 · Qwen 3.7 Flash", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 80 },
  { providerId: "dashscope", modelId: "text/deepseek-v4-pro", apiModelId: "deepseek-v4-pro", label: "高级 · DeepSeek V4 Pro", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 90 },
  { providerId: "dashscope", modelId: "text/glm-5", apiModelId: "glm-5", label: "通用 · GLM 5", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 100 },
  { providerId: "dashscope", modelId: "text/kimi-k2.5", apiModelId: "kimi-k2.5", label: "长文本 · Kimi K2.5", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 110 },
  { providerId: "openheapImage", modelId: "gpt-image-2", label: "GPT Image 2", mediaType: "image", sortOrder: 100 },
  { providerId: "openheapImage", modelId: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", mediaType: "image", sortOrder: 110 },
  { providerId: "openheapImage", modelId: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst", mediaType: "image", sortOrder: 120 },
  { providerId: "jojokey", modelId: "seedance-2.0-mini", label: "Seedance 2.0 标准", mediaType: "video", sortOrder: 200 },
  { providerId: "jojokey", modelId: "seedance-2.0-fast", label: "Seedance 2.0 高级", mediaType: "video", sortOrder: 210 },
  { providerId: "jojokey", modelId: "seedance-2.0", label: "Seedance 2.0 卓越", mediaType: "video", sortOrder: 220 },
  { providerId: "jojokey", modelId: "seedance-2.5", label: "Seedance 2.5", mediaType: "video", sortOrder: 230 },
  { providerId: "jojokey", modelId: "minimax-h3", label: "MiniMax H3", mediaType: "video", sortOrder: 240 },
];

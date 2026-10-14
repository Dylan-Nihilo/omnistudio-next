export const platformProviders = [
  { providerId: "utoooSeedance", apiUrl: "https://ai-gateway.utooo.com", protocol: "openai-completions" as const, secretRef: "UTOOO_SEEDANCE_API_KEY", config: { baseUrl: "https://ai-gateway.utooo.com" } },
  { providerId: "kaizoText", apiUrl: "https://kaizo.top/v1", protocol: "openai-completions" as const, secretRef: "OPENAI_API_KEY", config: { baseUrl: "https://kaizo.top/v1" } },
  { providerId: "kaizoClaude", apiUrl: "https://kaizo.top", protocol: "anthropic-messages" as const, secretRef: "KAIZO_CLAUDE_API_KEY", config: { baseUrl: "https://kaizo.top" } },
  { providerId: "openheapImage", apiUrl: "https://openheapstack.com/v1", protocol: "openai-completions" as const, secretRef: "OPENHEAP_IMAGE_API_KEY", config: { baseUrl: "https://openheapstack.com/v1" } },
  { providerId: "dashscope", apiUrl: "https://ws-v856jk108cwj3i2c.cn-beijing.maas.aliyuncs.com/compatible-mode/v1", protocol: "openai-completions" as const, secretRef: "DASHSCOPE_API_KEY", config: {} },
  { providerId: "dashscopeVideo", apiUrl: "https://ws-v856jk108cwj3i2c.cn-beijing.maas.aliyuncs.com/api/v1", protocol: "openai-completions" as const, secretRef: "DASHSCOPE_VIDEO_API_KEY", config: { baseUrl: "https://ws-v856jk108cwj3i2c.cn-beijing.maas.aliyuncs.com/api/v1" } },
];

export const platformModelCatalog: Array<{ providerId: string; modelId: string; label: string; mediaType: "text" | "image" | "video"; apiModelId?: string; capabilities?: Record<string, boolean>; sortOrder: number }> = [
  { providerId: "utoooSeedance", modelId: "doubao-seedance-2-5-260628", label: "Seedance 2.5", mediaType: "video", sortOrder: 180 },
  { providerId: "utoooSeedance", modelId: "doubao-seedance-2-0-260128", label: "Seedance 2.0", mediaType: "video", sortOrder: 190 },
  { providerId: "dashscope", modelId: "text/deepseek-v4.1-flash", apiModelId: "deepseek-v4.1-flash", label: "标准模型", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 30 },
  { providerId: "dashscope", modelId: "text/qwen3.7-plus", apiModelId: "qwen3.7-plus", label: "通用模型", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 40 },
  { providerId: "dashscope", modelId: "text/glm-5", apiModelId: "glm-5", label: "推理模型", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 50 },
  { providerId: "kaizoText", modelId: "text/gpt-5.6-sol", apiModelId: "gpt-5.6-sol", label: "高级模型", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 60 },
  { providerId: "kaizoClaude", modelId: "text/claude-opus-5", apiModelId: "claude-opus-5", label: "极致模型", mediaType: "text", capabilities: { vision: true, tools: true }, sortOrder: 70 },
  { providerId: "openheapImage", modelId: "gpt-image-2", label: "GPT Image 2", mediaType: "image", sortOrder: 100 },
  { providerId: "openheapImage", modelId: "gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", mediaType: "image", sortOrder: 110 },
  { providerId: "openheapImage", modelId: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst", mediaType: "image", sortOrder: 120 },
  { providerId: "dashscopeVideo", modelId: "minimax-h3", label: "MiniMax H3", mediaType: "video", sortOrder: 250 },
];

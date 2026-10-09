import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import type { Api } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getConfiguredModel } from "@/utils/ai";
import { createChargedStream } from "@/services/generationService";
import { requireAccount } from "@/utils/accountContext";

export async function createAgentModel(providerId: string, modelId: string, thinkingLevel = "off") {
  const configured = await getConfiguredModel(providerId, modelId);
  const { provider, model, baseUrl } = configured;
  const runtime = await ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null, refreshOnCreate: false });
  runtime.registerProvider(providerId, {
    api: provider.protocol,
    baseUrl,
    models: [{
      id: modelId, name: model.label, reasoning: thinkingLevel !== "off",
      // ACT: 保留图片输入，由实际供应方判断该模型是否支持。
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow, maxTokens: model.maxOutputTokens,
    }],
  });
  await runtime.setRuntimeApiKey(providerId, provider.apiKey);
  const account = requireAccount();
  const stream = runtime.stream.bind(runtime);
  const streamSimple = runtime.streamSimple.bind(runtime);
  runtime.stream = (selected, context, options) => {
    if (requireAccount().userId !== account.userId || selected.provider !== providerId || selected.id !== modelId) throw Object.assign(new Error("模型运行时不属于当前账户或平台模型"), { status: 403 });
    return createChargedStream({ providerId, modelId, model: selected, context, signal: options?.signal }, signal => stream<Api>({ ...selected, id: model.id }, context, { ...options, signal }));
  };
  runtime.streamSimple = (selected, context, options) => {
    if (requireAccount().userId !== account.userId || selected.provider !== providerId || selected.id !== modelId) throw Object.assign(new Error("模型运行时不属于当前账户或平台模型"), { status: 403 });
    return createChargedStream({ providerId, modelId, model: selected, context, signal: options?.signal }, signal => streamSimple({ ...selected, id: model.id }, context, { ...options, signal }));
  };
  return { ...configured, runtime };
}

export function formatAgentError(message: string, providerId?: string) {
  if (/\boverloaded\b/i.test(message)) {
    const provider = providerId?.toLowerCase().startsWith("kaizo") ? "Kaizo 上游模型服务" : "上游模型服务";
    return `${provider}当前过载，请稍后重试，或切换模型后继续。`;
  }
  return message;
}

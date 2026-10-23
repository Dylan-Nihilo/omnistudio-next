const fallbackError = "模型请求失败，请稍后重试";
const sensitiveField = /api[_-]?key|secret|token|password|authorization|cookie|signature|access[_-]?token/i;
const quotaErrorPattern = /(?:(?:token|user|account)?\s*quota\s+is\s+not\s+enough|insufficient[\s_-]+quota|quota[\s_-]+(?:is\s+)?exceeded|exceeded\s+(?:your\s+)?current\s+quota|out\s+of\s+quota|account\s+balance\s+is\s+insufficient|balance\s+(?:is\s+)?(?:not\s+enough|insufficient)|(?:token\s+)?(?:remain(?:ing)?|need)\s+quota\s*:[^,\n;，。]+|账户?(?:余额|额度)不足)(?:[,\s，]*(?:(?:token\s+)?(?:remain(?:ing)?|need)\s+quota|(?:当前|剩余)?(?:余额|额度)|需要)\s*[:：][^,\n;，。]*)*/gi;
const currencyAmountPattern = /(?:[¥￥$€£]\s*\d+(?:\.\d+)?(?:\s*(?:USD|CNY|RMB|EUR|GBP|元))?|\b\d+(?:\.\d+)?\s*(?:USD|CNY|RMB|EUR|GBP|元)(?![a-zA-Z0-9]))/gi;

export function sanitizeErrorMessage(text: string): string {
  return text
    .replace(quotaErrorPattern, "服务商额度不足，请稍后重试")
    .replace(currencyAmountPattern, "••••••");
}

export function formatAgentError(message: string, providerId?: string, secrets: readonly string[] = []) {
  let formatted = message.trim();
  if (!formatted) return fallbackError;
  if (/\boverloaded\b/i.test(formatted)) {
    const provider = providerId?.toLowerCase().startsWith("kaizo") ? "Kaizo 上游模型服务" : "上游模型服务";
    return `${provider}当前过载，请稍后重试，或切换模型后继续。`;
  }
  for (const secret of secrets) if (secret.trim()) formatted = formatted.replaceAll(secret, "••••••");
  formatted = sanitizeErrorMessage(formatted)
    .replace(/(https?:\/\/)([^/\s:@]+(?::[^/\s@]*)?@)/gi, "$1")
    .replace(/(Bearer\s+)[^\s"'<>]+/gi, "$1••••••")
    .replace(/([?&](?:api[_-]?key|token|secret|password|signature|authorization|access[_-]?token)=)[^&#\s"'<>]*/gi, "$1••••••")
    .replace(new RegExp(`((?:["']?${sensitiveField.source}["']?)\\s*[:=]\\s*["']?)[^\\s"',;}&<>]+`, "gi"), "$1••••••")
    .replace(/(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\/(?:app|home|opt|tmp|Users|var\/lib)\/)[^\s"'<>]*/g, "[路径已隐藏]")
    .replace(/\n\s*at\s+[^\n]+/g, "");
  if (/node_modules[\\/]|\b(?:TypeError|ReferenceError|SyntaxError):/.test(formatted)) return fallbackError;
  return formatted.slice(0, 4000) || fallbackError;
}

const fallbackError = "模型请求失败，请稍后重试";
const sensitiveField = /api[_-]?key|secret|token|password|authorization|cookie|signature|access[_-]?token/i;

export function formatAgentError(message: string, providerId?: string, secrets: readonly string[] = []) {
  let formatted = message.trim();
  if (!formatted) return fallbackError;
  if (/\boverloaded\b/i.test(formatted)) {
    const provider = providerId?.toLowerCase().startsWith("kaizo") ? "Kaizo 上游模型服务" : "上游模型服务";
    return `${provider}当前过载，请稍后重试，或切换模型后继续。`;
  }
  for (const secret of secrets) if (secret.trim()) formatted = formatted.replaceAll(secret, "••••••");
  formatted = formatted
    .replace(/(https?:\/\/)([^/\s:@]+(?::[^/\s@]*)?@)/gi, "$1")
    .replace(/(Bearer\s+)[^\s"'<>]+/gi, "$1••••••")
    .replace(/([?&](?:api[_-]?key|token|secret|password|signature|authorization|access[_-]?token)=)[^&#\s"'<>]*/gi, "$1••••••")
    .replace(new RegExp(`((?:["']?${sensitiveField.source}["']?)\\s*[:=]\\s*["']?)[^\\s"',;}&<>]+`, "gi"), "$1••••••")
    .replace(/(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/]|\/(?:app|home|opt|tmp|Users|var\/lib)\/)[^\s"'<>]*/g, "[路径已隐藏]")
    .replace(/\n\s*at\s+[^\n]+/g, "");
  if (/node_modules[\\/]|\b(?:TypeError|ReferenceError|SyntaxError):/.test(formatted)) return fallbackError;
  return formatted.slice(0, 4000) || fallbackError;
}

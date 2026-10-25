export type TextTokenRates = {
  input: string;
  output: string;
};

export type TextUsage = {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  totalTokens?: number;
  reasoning?: number;
};

export type TextPricingInput = { ratesPerMillion: TextTokenRates };
export type TextPricing = TextPricingInput & { billingRule: "textTokenV4" };

export type VideoBillingKind = "textImageToVideo" | "videoToVideo";
export type VideoPricing =
  | { videoPricingMode: "unified"; resolutionTiers: Record<string, string> }
  | { videoPricingMode: "separate"; videoPricingTiers: Record<VideoBillingKind, Record<string, string>> };

const microCreditsPerCredit = 1_000_000n;
const maxCreditAmount = 9_007_199_254_740_991n * microCreditsPerCredit;

function invalid(message: string, status = 422): never {
  throw Object.assign(new Error(message), { status });
}

export function parseCredits(value: string | number): bigint {
  if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) invalid("积分超出安全范围");
  const match = /^(-?)(\d{1,16})(?:\.(\d{1,6}))?$/.exec(String(value));
  if (!match) invalid("金额必须是最多六位小数的十进制数");
  const amount = (BigInt(match[2]) * microCreditsPerCredit + BigInt((match[3] ?? "").padEnd(6, "0"))) * (match[1] ? -1n : 1n);
  if (amount > maxCreditAmount || amount < -maxCreditAmount) invalid("积分超出安全范围");
  return amount;
}

export function formatCredits(value: bigint): string {
  if (value > maxCreditAmount || value < -maxCreditAmount) invalid("积分超出安全范围");
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / microCreditsPerCredit}.${String(absolute % microCreditsPerCredit).padStart(6, "0")}`;
}

function normalizeRate(value: unknown, label = "积分费率") {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(value)) invalid(`${label}必须是最多四位小数的非负十进制金额`);
  const amount = parseCredits(value);
  if (amount < 0n || amount > 1_000_000_000n * microCreditsPerCredit) invalid(`${label}超出范围`);
  const [integer, fraction = ""] = value.split(".");
  return `${integer}.${fraction.padEnd(4, "0")}`;
}

function normalizeRateMap(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label}配置无效`);
  const entries = Object.entries(value);
  if (!entries.length) invalid(`${label}不能为空`);
  const result: Record<string, string> = {};
  for (const [key, rate] of entries) {
    const normalizedKey = key.trim().toUpperCase();
    if (!normalizedKey || normalizedKey.length > 32 || result[normalizedKey] !== undefined) invalid(`${label}包含重复档位`);
    result[normalizedKey] = normalizeRate(rate, `${label}价格`);
  }
  return result;
}

export function buildTextPricing(input: TextPricingInput): TextPricing {
  if (!input || !input.ratesPerMillion || typeof input.ratesPerMillion !== "object") invalid("文本费率配置无效");
  const rates = input.ratesPerMillion as Record<string, unknown>;
  if (Object.keys(rates).some(key => key !== "input" && key !== "output")) invalid("文本费率只能配置输入和输出");
  return { billingRule: "textTokenV4", ratesPerMillion: { input: normalizeRate(rates.input, "输入费率"), output: normalizeRate(rates.output, "输出费率") } };
}

export function readTextPricing(constraints: unknown): TextPricing | undefined {
  if (!constraints || typeof constraints !== "object" || !("textPricing" in constraints)) return;
  const config = (constraints as { textPricing?: unknown }).textPricing;
  if (!config || typeof config !== "object" || (config as { billingRule?: unknown }).billingRule !== "textTokenV4") invalid("文本计费规则不受支持，请发布新的文本价格");
  const normalized = buildTextPricing(config as TextPricingInput);
  if (JSON.stringify(normalized.ratesPerMillion) !== JSON.stringify((config as { ratesPerMillion?: unknown }).ratesPerMillion)) invalid("锁定的文本费率无效");
  return normalized;
}

export function readVideoPricing(constraints: unknown): VideoPricing | undefined {
  if (!constraints || typeof constraints !== "object") return;
  const value = constraints as Record<string, unknown>;
  const mode = value.videoPricingMode;
  if (mode === "unified") return { videoPricingMode: mode, resolutionTiers: normalizeRateMap(value.resolutionTiers, "视频分辨率") };
  if (mode === "separate") {
    const tiers = value.videoPricingTiers;
    if (!tiers || typeof tiers !== "object" || Array.isArray(tiers)) invalid("视频区分计价档位配置无效");
    const input = tiers as Record<string, unknown>;
    return { videoPricingMode: mode, videoPricingTiers: { textImageToVideo: normalizeRateMap(input.textImageToVideo, "文生/图生视频"), videoToVideo: normalizeRateMap(input.videoToVideo, "视频生视频") } };
  }
  return;
}

export function normalizeTextUsage(value: unknown): TextUsage {
  if (!value || typeof value !== "object") invalid("供应商未提供计量数据");
  const usage = value as Partial<TextUsage>;
  for (const category of ["input", "cacheRead", "cacheWrite", "output"] as const) {
    if (!Number.isSafeInteger(usage[category]) || usage[category]! < 0) invalid(`供应商 ${category} 用量无效`);
  }
  const total = usage.input! + usage.cacheRead! + usage.cacheWrite! + usage.output!;
  if (!Number.isSafeInteger(total)) invalid("供应商用量超出安全范围");
  if (usage.totalTokens !== undefined && usage.totalTokens !== total) invalid("供应商总用量与分类用量不一致");
  if (usage.reasoning !== undefined && (!Number.isSafeInteger(usage.reasoning) || usage.reasoning < 0 || usage.reasoning > usage.output!)) invalid("思考用量必须是输出用量的子集");
  return { input: usage.input!, cacheRead: usage.cacheRead!, cacheWrite: usage.cacheWrite!, output: usage.output!, totalTokens: total, ...(usage.reasoning !== undefined ? { reasoning: usage.reasoning } : {}) };
}

export function calculateTextCredits(value: unknown, rates: TextTokenRates, rounding: "halfUp6" | "up6" = "halfUp6") {
  const usage = normalizeTextUsage(value);
  const input = BigInt(usage.input + usage.cacheRead + usage.cacheWrite);
  const output = BigInt(usage.output);
  const inputRate = parseCredits(rates.input);
  const outputRate = parseCredits(rates.output);
  const numerator = input * inputRate + output * outputRate;
  const amount = (numerator + (rounding === "up6" ? microCreditsPerCredit - 1n : microCreditsPerCredit / 2n)) / microCreditsPerCredit;
  return { credits: formatCredits(amount), numerator: String(numerator), usage, billableInput: Number(input), billableOutput: usage.output };
}

export function videoTierPrice(pricing: VideoPricing, kind: VideoBillingKind, resolution?: string): string {
  const tiers = pricing.videoPricingMode === "unified" ? pricing.resolutionTiers : pricing.videoPricingTiers[kind];
  const normalized = resolution?.trim().toUpperCase();
  const key = normalized ? Object.keys(tiers).find(item => item.toUpperCase() === normalized) : undefined;
  if (!key) invalid(`未配置${kind === "videoToVideo" ? "视频生视频" : "文生/图生视频"}的分辨率价格`, 503);
  return tiers[key];
}

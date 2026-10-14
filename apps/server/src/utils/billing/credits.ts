export type TextTokenRates = {
  input: string;
  cacheRead: string | null;
  cacheWrite: string | null;
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

export type TextPricingInput = {
  ratesPerMillion: TextTokenRates;
};

type LegacyTextPricingInput = {
  purchaseRatesYuanPerMillion: TextTokenRates;
  markupBasisPoints: number;
};

type LegacyTextPricing = LegacyTextPricingInput & {
  billingRule: "textTokenV2";
  ratesPerMillion: TextTokenRates;
};

export type TextPricing = (TextPricingInput & { billingRule: "textTokenV3" }) | LegacyTextPricing;

const microCreditsPerCredit = 1_000_000n;
const maxCreditAmount = 9_007_199_254_740_991n * microCreditsPerCredit;
const tokenCategories = ["input", "cacheRead", "cacheWrite", "output"] as const;

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 422 });
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

export function buildTextPricing(input: TextPricingInput): TextPricing {
  const rates = {} as TextTokenRates;
  for (const category of tokenCategories) {
    const rate = input.ratesPerMillion[category];
    if (rate === null && (category === "cacheRead" || category === "cacheWrite")) {
      rates[category] = null;
      continue;
    }
    if (typeof rate !== "string") invalid("积分费率必须使用十进制字符串");
    const amount = parseCredits(rate);
    if (amount < 0n || amount > 1_000_000_000n * microCreditsPerCredit) invalid("积分费率超出范围");
    rates[category] = formatCredits(amount);
  }
  return { billingRule: "textTokenV3", ratesPerMillion: rates };
}

function buildLegacyTextPricing(input: LegacyTextPricingInput): LegacyTextPricing {
  if (!Number.isSafeInteger(input.markupBasisPoints) || input.markupBasisPoints < 0 || input.markupBasisPoints > 1_000_000) invalid("服务加价比例无效");
  const purchaseRates = {} as TextTokenRates;
  const retailRates = {} as TextTokenRates;
  for (const category of tokenCategories) {
    const rate = input.purchaseRatesYuanPerMillion[category];
    if (rate === null && (category === "cacheRead" || category === "cacheWrite")) {
      purchaseRates[category] = null;
      retailRates[category] = null;
      continue;
    }
    if (typeof rate !== "string") invalid("采购费率必须使用十进制字符串");
    const amount = parseCredits(rate);
    if (amount < 0n || amount > 1_000_000_000n * microCreditsPerCredit) invalid("采购费率超出范围");
    purchaseRates[category] = formatCredits(amount);
    retailRates[category] = formatCredits((amount * 10n * BigInt(10000 + input.markupBasisPoints) + 5000n) / 10000n);
  }
  return { billingRule: "textTokenV2", purchaseRatesYuanPerMillion: purchaseRates, markupBasisPoints: input.markupBasisPoints, ratesPerMillion: retailRates };
}

export function readTextPricing(constraints: unknown): TextPricing | undefined {
  if (!constraints || typeof constraints !== "object" || !("textPricing" in constraints)) return;
  const config = constraints.textPricing as TextPricing;
  if (config?.billingRule !== "textTokenV2" && config?.billingRule !== "textTokenV3") invalid("文本计费规则不受支持");
  const normalized = config.billingRule === "textTokenV3" ? buildTextPricing(config) : buildLegacyTextPricing(config);
  if (!config.ratesPerMillion || tokenCategories.some(category => normalized.ratesPerMillion[category] !== config.ratesPerMillion[category])) invalid("锁定的文本零售费率无效");
  return normalized;
}

export function normalizeTextUsage(value: unknown): TextUsage {
  if (!value || typeof value !== "object") invalid("供应商未提供计量数据");
  const usage = value as TextUsage;
  for (const category of tokenCategories) {
    if (!Number.isSafeInteger(usage[category]) || usage[category] < 0) invalid(`供应商 ${category} 用量无效`);
  }
  const total = tokenCategories.reduce((sum, category) => sum + usage[category], 0);
  if (!Number.isSafeInteger(total)) invalid("供应商用量超出安全范围");
  if (usage.totalTokens !== undefined && usage.totalTokens !== total) invalid("供应商总用量与分类用量不一致");
  if (usage.reasoning !== undefined && (!Number.isSafeInteger(usage.reasoning) || usage.reasoning < 0 || usage.reasoning > usage.output)) invalid("思考用量必须是输出用量的子集");
  return { input: usage.input, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, output: usage.output, totalTokens: total, ...(usage.reasoning !== undefined ? { reasoning: usage.reasoning } : {}) };
}

export function calculateTextCredits(value: unknown, rates: TextTokenRates, rounding: "halfUp6" | "up6" = "halfUp6") {
  const usage = normalizeTextUsage(value);
  let numerator = 0n;
  for (const category of tokenCategories) {
    const rate = rates[category];
    if (rate === null) {
      if (usage[category] > 0) invalid(`当前模型未配置 ${category} 费率`);
      continue;
    }
    const rateMicro = parseCredits(rate);
    if (rateMicro < 0n) invalid("文本费率不能为负数");
    numerator += BigInt(usage[category]) * rateMicro;
  }
  const amount = (numerator + (rounding === "up6" ? microCreditsPerCredit - 1n : microCreditsPerCredit / 2n)) / microCreditsPerCredit;
  return { credits: formatCredits(amount), numerator: String(numerator), usage };
}

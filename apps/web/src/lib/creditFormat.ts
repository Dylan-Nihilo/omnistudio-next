export function creditMicros(value: string | number): bigint {
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(String(value));
  if (!match) throw new Error("积分金额格式无效");
  const amount = BigInt(match[2]!) * 1_000_000n + BigInt((match[3] ?? "").padEnd(6, "0"));
  return match[1] ? -amount : amount;
}

export function formatCredits(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const amount = creditMicros(value);
  const cents = ((amount < 0n ? -amount : amount) + 5_000n) / 10_000n;
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount < 0n && cents > 0n ? "-" : ""}${whole}.${(cents % 100n).toString().padStart(2, "0")}`;
}

export function compareCredits(left: string | number, right: string | number): number {
  const difference = creditMicros(left) - creditMicros(right);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

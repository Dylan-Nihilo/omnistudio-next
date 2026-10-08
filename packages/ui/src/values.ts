import type { UiValue } from "./types";

export function valueKey(value: UiValue) {
  return typeof value + ":" + String(value);
}

export function readPath(value: unknown, path: string): unknown {
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

export function finiteNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

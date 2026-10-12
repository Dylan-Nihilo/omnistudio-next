import type { ComputedRef, InjectionKey } from "vue";
import type { RuleItem } from "async-validator";

export type UiFormRule = RuleItem & { trigger?: string | string[] };
export type UiFormRules = Record<string, UiFormRule | UiFormRule[]>;
export type UiFormApi = {
  validate: () => Promise<boolean>;
  validateField: (fields: string | string[], trigger?: string) => Promise<boolean>;
  clearValidate: (fields?: string | string[]) => void;
  resetFields: () => void;
};
export type UiFormContext = UiFormApi & {
  errors: ComputedRef<Record<string, string>>;
  disabled: ComputedRef<boolean>;
  required: (field: string) => boolean;
  register: (field: string, label?: string, required?: boolean) => () => void;
};
export const uiFieldKey: InjectionKey<(trigger: string) => Promise<void>> = Symbol("uiField");
export const uiFormKey: InjectionKey<UiFormContext> = Symbol("uiForm");

export function isComposingInput(event: Event) {
  return !!((event as InputEvent).isComposing || (event as KeyboardEvent).keyCode === 229 || (event.target as (HTMLInputElement & { composing?: boolean }) | null)?.composing);
}

const compositionKeys = new WeakMap<HTMLElement, Set<string>>();
export function handleCompositionKey(event: KeyboardEvent) {
  const element = event.currentTarget as HTMLElement;
  const key = event.code || event.key;
  const composing = isComposingInput(event);
  let keys = compositionKeys.get(element);
  if (event.type === "keydown" && composing) {
    if (!keys) { keys = new Set(); compositionKeys.set(element, keys); }
    keys.add(key);
  } else if (event.type === "keydown" && !event.repeat) keys?.delete(key);
  // The confirmation keyup can arrive after compositionend with isComposing=false.
  if (composing || keys?.has(key)) event.stopImmediatePropagation();
  if (event.type === "keyup") {
    keys?.delete(key);
    if (!keys?.size) compositionKeys.delete(element);
  }
}

export type UiFieldRule = {
  type: string;
  field: string;
  title?: string;
  info?: string;
  value?: unknown;
  props?: Record<string, unknown>;
  options?: import("./types").UiOption[];
  validate?: UiFormRule[];
  required?: boolean;
  control?: { value: unknown; method?: string; rule: string[] }[];
};
export type UiRuleFormApi = UiFormApi & { formData: () => Record<string, unknown> };

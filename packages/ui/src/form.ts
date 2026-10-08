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

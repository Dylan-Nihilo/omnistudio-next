import type { Component, VNodeChild } from "vue";

export type UiValue = string | number | boolean;
export type UiTone = "neutral" | "success" | "warning" | "error";
export type UiContent = string | VNodeChild | (() => VNodeChild);
export type UiPlacement = "top" | "bottom" | "left" | "right" | "top-start" | "top-end" | "bottom-start" | "bottom-end" | "left-start" | "left-end" | "right-start" | "right-end";
export type UiOption = { value: UiValue; label: string; disabled?: boolean; group?: string; icon?: Component };
export type UiDropdownApi = { open: (last?: boolean) => Promise<void>; close: () => void };
export type UiMenuItem = UiOption & { divided?: boolean; children?: UiMenuItem[] };
export type UiColumn = {
  key: string;
  label: string;
  field?: string;
  width?: number;
  align?: "left" | "center" | "right";
  render?: (context: { row: Record<string, unknown>; column: UiColumn; value: unknown; index: number }) => VNodeChild;
};
export type UiTreeNode = {
  value: UiValue;
  label: string;
  children?: UiTreeNode[];
  leaf?: boolean;
  disabled?: boolean;
  data?: unknown;
};
export type UiTourStep = { target?: HTMLElement | (() => HTMLElement | null); title: string; description?: string };
export type UiDropPosition = "before" | "inside" | "after";

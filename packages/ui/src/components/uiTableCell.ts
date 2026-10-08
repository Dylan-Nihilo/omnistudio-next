import type { UiColumn } from "../types";
import { readPath } from "../values";

export default function uiTableCell(props: { row: Record<string, unknown>; column: UiColumn; index: number }) {
  const value = readPath(props.row, props.column.field ?? props.column.key);
  return props.column.render ? props.column.render({ ...props, value }) : String(value ?? "");
}

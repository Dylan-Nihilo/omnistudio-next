import type { UiContent } from "../types";

export default function uiContentRenderer(props: { content: UiContent }) {
  return typeof props.content === "function" ? props.content() : props.content;
}

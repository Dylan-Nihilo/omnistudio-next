import { h } from "vue";
import { ElNotification } from "element-plus";
import { useUiFeedback, type UiFeedback } from "@omnistudio-next/ui";
import nodeError from "./components/nodeError.vue";

export function showNodeError(error: unknown, title: string, feedback?: UiFeedback) {
  if (error instanceof Error && error.name === "AbortError") return;
  const detail = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  const message = typeof detail === "string" && detail.trim() ? detail
    : error instanceof Error ? error.message : typeof error === "string" ? error : title;
  const controller = new AbortController();
  if (feedback) {
    feedback.notify({ title, tone: "error", duration: 0, message: h(nodeError, { message: message || title, context: title, signal: controller.signal }), onClose: () => controller.abort() });
    return;
  }
  ElNotification({
    title,
    type: "error",
    duration: 0,
    customClass: "nodeErrorNotification",
    message: h(nodeError, { message: message || title, context: title, signal: controller.signal, onResize: () => ElNotification.updateOffsets() }),
    onClose: () => controller.abort(),
  });
}

export function useNodeError() {
  const feedback = useUiFeedback();
  return (error: unknown, title: string) => showNodeError(error, title, feedback);
}

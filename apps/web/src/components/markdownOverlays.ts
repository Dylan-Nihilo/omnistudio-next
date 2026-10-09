import { defineComponent, h, type CSSProperties, type PropType } from "vue";
import { uiButton, uiDialog } from "@omnistudio-next/ui";

function createOverlay(isAlert = false) {
  return defineComponent({
    inheritAttrs: false,
    props: {
      open: Boolean,
      title: String,
      ariaLabel: String,
      description: String,
      confirmText: String,
      cancelText: String,
      close: Function as PropType<() => void>,
      modalStyle: Object as PropType<CSSProperties>,
      headerStyle: Object as PropType<CSSProperties>,
    },
    emits: ["update:open", "confirm", "cancel"],
    setup(props, { emit, slots }) {
      function close() {
        if (isAlert) emit("cancel");
        if (props.close) props.close();
        else emit("update:open", false);
      }
      return () => h(uiDialog, {
        modelValue: props.open,
        title: props.title || props.ariaLabel || (isAlert ? "请确认" : "预览"),
        fullscreen: !isAlert,
        style: props.modalStyle,
        showClose: isAlert || !slots.actions,
        "onUpdate:modelValue": (value: boolean) => { if (!value) close(); },
      }, {
        ...(!isAlert && (slots.title || slots.actions || slots["header-center"]) ? {
          header: ({ titleId }: { titleId: string }) => h("header", {
            style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "16px", padding: "16px 24px", borderBottom: "1px solid var(--uiBorderDefault)", ...props.headerStyle },
          }, [
            h("h2", { id: titleId, style: { flex: "1", minWidth: "0", margin: "0", fontSize: "var(--uiFontHeading)" } }, slots.title?.() ?? props.title ?? props.ariaLabel ?? "预览"),
            slots["header-center"]?.(),
            slots.actions?.() ?? h(uiButton, { variant: "ghost", "aria-label": "关闭预览", onClick: close }, () => "关闭"),
          ]),
        } : {}),
        default: () => [props.description ? h("p", { style: { overflowWrap: "anywhere" } }, props.description) : null, slots.default?.()],
        ...(isAlert ? { footer: () => slots.footer?.() ?? [
          h(uiButton, { variant: "secondary", onClick: close }, () => props.cancelText || "取消"),
          h(uiButton, { onClick: () => { emit("confirm"); emit("update:open", false); } }, () => props.confirmText || "确定"),
        ] } : {}),
      });
    },
  });
}

export default { Alert: createOverlay(true), Modal: createOverlay() };

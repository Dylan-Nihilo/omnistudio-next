import feedback from "@/lib/uiFeedback";
import axios from "axios";
import { h } from "vue";
import type { PluginInstallRequest, PluginInstallType } from "@omnistudio-next/server/desktop";
import { useAuthStore } from "@/stores/auth";

declare global {
  interface WindowEventMap {
    "omnistudio-next:install-plugin": CustomEvent<PluginInstallRequest>;
    "omnistudio-next:plugin-installed": CustomEvent<{ type: PluginInstallType; name: string }>;
  }
}

export function registerDesktopProtocol() {
  const auth = useAuthStore();
  const labels = { node: "节点", tool: "工具", skill: "技能", provider: "供应商", agent: "Agent" };
  const pending = new Set<string>();
  let queue = Promise.resolve();

  const handleInstall = (event: WindowEventMap["omnistudio-next:install-plugin"]) => {
    const request = event.detail;
    if (!request || !Object.hasOwn(labels, request.type) || typeof request.url !== "string" || typeof request.fileName !== "string") return;
    const key = `${request.type}:${request.url}`;
    if (pending.has(key)) return;
    if (pending.size >= 20) {
      feedback.message({ tone: "warning", message: "待确认的安装请求过多，请稍后重试" });
      return;
    }
    pending.add(key);
    queue = queue.then(() => confirmInstall(request)).catch(error => {
      feedback.message({ tone: "error", message: error instanceof Error ? error.message : "安装插件失败" });
    }).finally(() => pending.delete(key));
  };
  window.addEventListener("omnistudio-next:install-plugin", handleInstall);

  async function confirmInstall(request: PluginInstallRequest) {
    if (!auth.isRoot) { feedback.message({ tone: "error", message: "请先登录 root 管理员后再安装平台扩展。" }); return; }
    const confirmed = await feedback.confirm(
      h("div", { style: { overflowWrap: "anywhere" } }, [
        h("p", `${labels[request.type]}：${request.fileName}`),
        h("p", { style: { maxHeight: "120px", overflow: "auto", fontSize: "12px", color: "var(--uiTextMuted)" } }, request.url),
        h("p", "插件可能执行代码并访问本地文件，请仅安装信任来源的插件。"),
      ]),
      "安装插件",
      { confirmButtonText: "确认安装", cancelButtonText: "取消", closeOnClickModal: false },
    ).then(() => true, () => false);
    if (!confirmed) return;

    const loading = feedback.message({ message: "正在安装插件…", duration: 0 });
    try {
      const { data } = await axios.post("/api/desktop/plugins/install", { type: request.type, url: request.url }, {
        headers: { "x-omnistudio-next-desktop": "1" },
        timeout: 60000,
      });
      if (data?.code !== 200) throw new Error(typeof data?.message === "string" && data.message.trim() ? data.message : "安装接口返回了无效响应，请重启或更新 omnistudio-next 后重试");
      if (typeof data.data?.name !== "string" || !data.data.name.trim()) throw new Error("安装接口未返回有效的插件名称，请先检查插件列表，再重试");
      window.dispatchEvent(new CustomEvent("omnistudio-next:plugin-installed", { detail: { type: request.type, name: data.data.name } }));
      feedback.message({ tone: "success", message: `${labels[request.type]}已安装` });
    } catch (error) {
      let message = error instanceof Error ? error.message : "安装失败，请稍后重试";
      if (axios.isAxiosError(error)) {
        const response = error.response;
        const data = response?.data;
        if (typeof data?.message === "string" && data.message.trim()) {
          message = data.message;
          if (Array.isArray(data.data) && data.data.every((item: unknown) => typeof item === "string")) message += `：${data.data.join("；")}`;
        } else if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
          message = "安装请求等待超时，请先查看插件是否已安装，再重试";
        } else if (!response) {
          message = "无法连接 omnistudio-next 本机服务，请确认应用正常运行后重试";
        } else {
          message = `安装接口返回异常（HTTP ${response.status}），请重启或更新 omnistudio-next 后重试`;
        }
      }
      feedback.message({ tone: "error", message: `${labels[request.type]}“${request.fileName}”安装失败：${message}`, duration: 10000, showClose: true });
    } finally {
      loading.close();
    }
  }
  return () => window.removeEventListener("omnistudio-next:install-plugin", handleInstall);
}

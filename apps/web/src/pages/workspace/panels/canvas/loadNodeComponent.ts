import type { NodeTypesObject } from "@vue-flow/core";
import * as vueRuntime from "vue";
import * as uiRuntime from "@omnistudio-next/ui";
import * as modelIconsRuntime from "@omnistudio-next/model-icons";
import * as tiptapRuntime from "@tiptap/core";
import * as starterKitRuntime from "@tiptap/starter-kit";
import * as vueFlowRuntime from "@vue-flow/core";
import * as elementPlusRuntime from "element-plus";
import { runAgentLoop } from "@earendil-works/pi-agent-core";
import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import "element-plus/dist/index.css";

type NodeComponent = Exclude<NodeTypesObject[string], string>;

const components = new Map<string, NodeComponent>();
const requests = new Map<string, Promise<NodeComponent>>();
const nodeWindow = window as typeof window & {
  toonflowNodeHost?: { vue: typeof vueRuntime; ui: typeof uiRuntime; modelIcons: typeof modelIconsRuntime; tiptap: typeof tiptapRuntime; starterKit: typeof starterKitRuntime; vueFlow: typeof vueFlowRuntime; elementPlus: typeof elementPlusRuntime; ai: { runAgentLoop: typeof runAgentLoop; createAssistantMessageEventStream: typeof createAssistantMessageEventStream } };
  toonflowNodes?: NodeTypesObject;
};
// ACT: 宿主随首次节点加载初始化，保留插件约定的完整导出，空画布不提前加载插件运行时。
nodeWindow.toonflowNodeHost = { vue: vueRuntime, ui: uiRuntime, modelIcons: modelIconsRuntime, tiptap: tiptapRuntime, starterKit: starterKitRuntime, vueFlow: vueFlowRuntime, elementPlus: elementPlusRuntime, ai: { runAgentLoop, createAssistantMessageEventStream } };

export function loadNodeComponent(name: string, url: string, force = false): Promise<NodeComponent> {
  const pending = requests.get(name);
  if (pending) return pending;
  const cached = components.get(name) ?? (Object.hasOwn(nodeWindow.toonflowNodes ?? {}, name) ? nodeWindow.toonflowNodes?.[name] : undefined);
  if (!force && cached && (typeof cached === "object" || typeof cached === "function")) {
    components.set(name, cached);
    return Promise.resolve(cached);
  }
  components.delete(name);
  // ACT: 同名节点只加载一份脚本，所有画布共享进行中的重载，避免互相清除全局导出。
  const request = new Promise<NodeComponent>((resolve, reject) => {
    delete nodeWindow.toonflowNodes?.[name];
    const script = document.createElement("script");
    script.src = force ? `${url}${url.includes("?") ? "&" : "?"}reload=${crypto.randomUUID()}` : url;
    script.onload = () => {
      script.remove();
      const component = nodeWindow.toonflowNodes?.[name];
      if (!Object.hasOwn(nodeWindow.toonflowNodes ?? {}, name) || !component || (typeof component !== "object" && typeof component !== "function")) {
        reject(new Error(`节点脚本未导出 ${name} 组件`));
        return;
      }
      resolve(component);
    };
    script.onerror = () => {
      script.remove();
      delete nodeWindow.toonflowNodes?.[name];
      reject(new Error("节点脚本加载失败"));
    };
    document.head.append(script);
  }).then(component => {
    components.set(name, component);
    return component;
  }).finally(() => requests.delete(name));
  requests.set(name, request);
  return request;
}

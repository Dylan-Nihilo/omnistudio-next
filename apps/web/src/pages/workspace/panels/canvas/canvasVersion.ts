import type { FlowExportObject } from "@vue-flow/core";

type CanvasFlow = Pick<FlowExportObject, "nodes" | "edges" | "viewport">;

// ACT: 该指纹用于发现会话绑定的画布是否已变化，不作为安全校验或内容寻址；保留固定长度，避免把整张画布放入请求。
export function getCanvasVersion(flow: CanvasFlow) {
  const source = JSON.stringify({
    nodes: flow.nodes.map(node => ({ id: node.id, type: node.type, parentNode: node.parentNode })),
    edges: flow.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle, type: edge.type })),
  });
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second ^= code + index;
    second = Math.imul(second, 2246822519);
  }
  return (first >>> 0).toString(16).padStart(8, "0") + (second >>> 0).toString(16).padStart(8, "0");
}

import axios from "axios";
import type useWorkspaceFiles from "@/lib/workspaceFiles";

type CanvasAssetNode = { id: string; data?: unknown };

export function getCanvasAssetDirectories(nodes: CanvasAssetNode[], retainedNodes: CanvasAssetNode[]) {
  const retained = new Set(retainedNodes.map(node => node.id.toLowerCase()));
  const pending = retainedNodes.map(node => node.data);
  const visited = new WeakSet<object>();
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "string") {
      const parts = value.replaceAll("\\", "/").split("/").filter(part => part && part !== ".");
      if (parts[0]?.toLowerCase() === "assets" && parts[1] && !parts.includes("..")) retained.add(parts[1].toLowerCase());
    } else if (value && typeof value === "object" && !visited.has(value)) {
      visited.add(value);
      for (const item of Object.values(value)) pending.push(item);
    }
  }
  // ACT: 仅清理节点所属目录，不把引用路径当作目录归属，避免误删 assets/generated 等共享目录。
  return [...new Set(nodes.map(node => node.id))]
    .filter(id => id && !/[<>:"/\\|?*\x00-\x1f]/.test(id) && !/[. ]$/.test(id)
      && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(id) && !retained.has(id.toLowerCase()))
    .map(id => `assets/${id}`);
}

export async function isCanvasFile(files: Pick<ReturnType<typeof useWorkspaceFiles>, "readText">, path: string) {
  try {
    const header = await files.readText(path, 4096);
    return /^\s*\{/.test(header) && /"toonflowCanvas"\s*:\s*true\s*[,}]/.test(header);
  } catch (error) {
    // ACT: 扫描期间已消失或不可作为文件读取的条目跳过，权限及其他 IO 错误继续抛出。
    if (axios.isAxiosError(error) && [400, 404].includes(error.response?.status ?? 0)) return;
    throw error;
  }
}

export function suggestNextCanvasName(existingNames: string[], baseName?: string): string {
  const existingSet = new Set(existingNames.map(name => name.trim().toLowerCase()));

  function parsePattern(name: string) {
    const match = /(.*?)(\d+)([^\d]*)$/.exec(name);
    if (!match) return null;
    return {
      prefix: match[1],
      digits: match[2],
      suffix: match[3],
      value: parseInt(match[2], 10),
      padLength: match[2].length,
    };
  }

  function tryFormat(prefix: string, startValue: number, padLength: number, suffix: string): string {
    let current = Math.max(1, startValue);
    for (let attempts = 0; attempts < 10000; attempts++) {
      const numStr = String(current).padStart(padLength, "0");
      const candidate = `${prefix}${numStr}${suffix}`.trim();
      if (!existingSet.has(candidate.toLowerCase())) {
        return candidate;
      }
      current++;
    }
    return `${prefix}${current}${suffix}`.trim();
  }

  if (baseName) {
    const parsed = parsePattern(baseName.trim());
    if (parsed) {
      return tryFormat(parsed.prefix, parsed.value + 1, parsed.padLength, parsed.suffix);
    }
  }

  let bestPattern: { prefix: string; maxValue: number; padLength: number; suffix: string; count: number } | null = null;
  const patternGroups = new Map<string, { prefix: string; maxValue: number; padLength: number; suffix: string; count: number }>();

  for (const name of existingNames) {
    const parsed = parsePattern(name.trim());
    if (!parsed) continue;
    const key = `${parsed.prefix}__$$__${parsed.suffix}`;
    const group = patternGroups.get(key) ?? {
      prefix: parsed.prefix,
      suffix: parsed.suffix,
      maxValue: 0,
      padLength: parsed.padLength,
      count: 0,
    };
    group.count++;
    if (parsed.value > group.maxValue) {
      group.maxValue = parsed.value;
      group.padLength = Math.max(group.padLength, parsed.padLength);
    }
    patternGroups.set(key, group);
  }

  for (const group of patternGroups.values()) {
    if (!bestPattern || group.count > bestPattern.count || (group.count === bestPattern.count && group.maxValue > bestPattern.maxValue)) {
      bestPattern = group;
    }
  }

  if (bestPattern) {
    return tryFormat(bestPattern.prefix, bestPattern.maxValue + 1, bestPattern.padLength, bestPattern.suffix);
  }

  return tryFormat("画布", existingNames.length + 1, 1, "");
}

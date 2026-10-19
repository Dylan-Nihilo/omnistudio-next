import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { cp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { getDataDirectory } from "@/utils/conf";
import { requireActiveAccount } from "@/utils/accountContext";
import { getPersonalProjectRoot, registerPersonalProject } from "@/services/accountService";
import { lockWorkspaceFiles, resolveWorkspacePath } from "@/utils/workspace/files";
import layout from "./layout.json";

const demo = {
  id: "admissionCounterattack",
  title: "拼回去",
  description: "保姆女儿撕毁千金录取通知书",
  meta: "真人短剧 · 第一集 · 2分45秒",
};
const mediaPaths = {
  cover: "assets/demoCover/coverLandscape.webp",
  video: "assets/d37fdb2d-4b99-461b-ae29-cf6775945f85/episodeOneFinalV1.mp4",
};

async function getDirectory(id: string) {
  requireActiveAccount();
  if (id !== demo.id) throw Object.assign(new Error("Demo 不存在"), { status: 404 });
  const { path } = await resolveWorkspacePath(getDataDirectory(), `demos/${id}`);
  if (!(await stat(path)).isDirectory()) throw Object.assign(new Error("Demo 不存在"), { status: 404 });
  return path;
}

export async function getMedia(id: string, kind: keyof typeof mediaPaths) {
  const { path } = await resolveWorkspacePath(await getDirectory(id), mediaPaths[kind]);
  if (!(await stat(path)).isFile()) throw Object.assign(new Error("Demo 素材不存在"), { status: 404 });
  return path;
}

export async function list() {
  try {
    await getMedia(demo.id, "cover");
    await getMedia(demo.id, "video");
    const directory = await getDirectory(demo.id);
    await stat(resolve(directory, "episodeOne.json"));
    return [{ ...demo, coverUrl: `/api/demos/file?id=${demo.id}&kind=cover&version=landscape`, videoUrl: `/api/demos/file?id=${demo.id}&kind=video` }];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function open(id: string) {
  const source = await getDirectory(id);
  const root = await getPersonalProjectRoot();
  const destination = resolve(root, "admissionCounterattackDemo");
  const unlock = lockWorkspaceFiles([destination]);
  const temporary = resolve(root, `demoImport${randomUUID().replaceAll("-", "")}`);
  try {
    const existing = await stat(destination).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing) {
      const { path } = await resolveWorkspacePath(root, "admissionCounterattackDemo/demoSource.json");
      const marker = JSON.parse(await readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") throw Object.assign(new Error("样板目录已被其他项目占用，请先重命名该目录"), { status: 409 });
        throw error;
      }));
      if (marker.id !== id) throw Object.assign(new Error("样板目录已被其他项目占用，请先重命名该目录"), { status: 409 });
    } else {
      await cp(source, temporary, { recursive: true, force: false, errorOnExist: true, mode: constants.COPYFILE_FICLONE });
      const canvasPath = resolve(temporary, "episodeOne.json");
      const canvas = z.looseObject({
        toonflowCanvas: z.literal(true),
        nodes: z.array(z.looseObject({ id: z.string().min(1), type: z.string().min(1), data: z.record(z.string(), z.json()).optional() })),
        edges: z.array(z.json()),
        viewport: z.json(),
      }).parse(JSON.parse(await readFile(canvasPath, "utf8")));
      const nodeIds = new Set(canvas.nodes.map(node => node.id));
      const groupIds = new Set(layout.groups.map(group => group.id));
      if (nodeIds.size !== canvas.nodes.length || layout.nodes.some(node => !nodeIds.has(node.id))
        || canvas.nodes.some(node => groupIds.has(node.id) && node.type !== "canvasGroup")) {
        throw new Error("Demo 节点与布局版本不匹配，请联系管理员更新模板");
      }
      const positions = new Map(layout.nodes.map(node => [node.id, node]));
      canvas.nodes = [...layout.groups, ...canvas.nodes.filter(node => !groupIds.has(node.id)).map(node => {
        const placement = positions.get(node.id);
        return placement ? {
          ...node, position: placement.position, parentNode: placement.parentNode, expandParent: false,
          data: { ...node.data, ...(placement.label ? { label: placement.label } : {}) },
        } : node;
      })];
      canvas.viewport = layout.viewport;
      await writeFile(canvasPath, `${JSON.stringify(canvas, null, 2)}\n`);
      requireActiveAccount();
      await rename(temporary, destination);
    }
    return { directory: await registerPersonalProject(destination, demo.title), name: demo.title };
  } finally {
    try { await rm(temporary, { recursive: true, force: true }); }
    finally { unlock(); }
  }
}

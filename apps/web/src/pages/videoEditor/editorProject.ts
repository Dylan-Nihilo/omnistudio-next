import useWorkspaceFiles from "@/lib/workspaceFiles";
import { createDefaultTracks, parseEditorProject, type EditorProject } from "./editorModel";

const projectPath = "assets/videoEditor/timeline.json";
const editorDirectory = "assets/videoEditor";
const projectsDirectory = `${editorDirectory}/projects`;
const backupDirectory = `${editorDirectory}/backups`;
const backupNamePattern = /^backup\d{17}[\da-f]{32}\.json$/;
const projectPathPattern = /^assets\/videoEditor\/projects\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\.json$/;

type EditorBackup = { name: string; path: string };
type EditorProjectEntry = { path: string; name: string };

function normalizeProjectPath(path = projectPath): string {
  if (path === projectPath || projectPathPattern.test(path)) return path;
  throw new Error("剪辑工程路径无效");
}

function getBackupDirectory(path: string) {
  const match = projectPathPattern.exec(path);
  return match ? `${backupDirectory}/${match[1]}` : backupDirectory;
}

function createEmptyProject(name = "默认剪辑项目"): EditorProject {
  return {
    version: 2,
    name,
    assets: [],
    clips: [],
    tracks: createDefaultTracks(),
    aspectRatio: "16:9",
    frameRate: 30,
    exportHeight: 1080,
    exportQuality: "standard",
  };
}

function readProjectName(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

function validateProjectName(name: string) {
  if (typeof name !== "string") throw new Error("剪辑工程名称无效");
  const normalized = name.trim();
  if (!normalized || normalized.length > 120 || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error("剪辑工程名称须为 1 至 120 个有效字符");
  return normalized;
}

export async function ensureEditorFolders(files: ReturnType<typeof useWorkspaceFiles>): Promise<void> {
  const root = await files.list();
  if (!root.entries.some(entry => entry.path === "assets" && entry.type === "directory")) await files.mkdir("assets");
  const assets = await files.list("assets");
  if (!assets.entries.some(entry => entry.path === "assets/videoEditor" && entry.type === "directory")) await files.mkdir("assets/videoEditor");
  const editor = await files.list(editorDirectory);
  for (const name of ["media", "exports", "backups", "projects"]) {
    const path = `${editorDirectory}/${name}`;
    if (!editor.entries.some(entry => entry.path === path && entry.type === "directory")) await files.mkdir(path);
  }
}

export async function listEditorProjects(directory: string): Promise<EditorProjectEntry[]> {
  const files = useWorkspaceFiles(directory);
  await ensureEditorFolders(files);
  const editor = await files.list(editorDirectory);
  const projects = await files.list(projectsDirectory);
  const entries: EditorProjectEntry[] = [];
  let defaultName = "默认剪辑项目";
  if (editor.entries.some(entry => entry.type === "file" && entry.path === projectPath)) {
    const content = await files.readText(projectPath);
    try {
      const value: unknown = JSON.parse(content);
      parseEditorProject(value);
      defaultName = readProjectName(value, defaultName);
    } catch {
      // ACT: 坏掉的工程仍保留入口名，打开时由工程解析错误明确报告。
    }
  }
  entries.push({ path: projectPath, name: defaultName });
  for (const entry of projects.entries) {
    if (entry.type !== "file" || !projectPathPattern.test(entry.path) || entry.path !== `${projectsDirectory}/${entry.name}`) continue;
    const content = await files.readText(entry.path);
    const fallback = `剪辑工程 ${entry.name.slice(0, 8)}`;
    let name = fallback;
    try {
      const value: unknown = JSON.parse(content);
      parseEditorProject(value);
      name = readProjectName(value, fallback);
    } catch {
      // ACT: 按文件编号保留坏工程条目，便于定位并恢复工程文件。
    }
    entries.push({ path: entry.path, name });
  }
  return entries;
}

export async function createEditorProject(directory: string, name: string): Promise<{ path: string; project: EditorProject }> {
  const files = useWorkspaceFiles(directory);
  await ensureEditorFolders(files);
  const project = createEmptyProject(validateProjectName(name));
  const path = `${projectsDirectory}/${crypto.randomUUID()}.json`;
  await files.writeJson(path, project, true);
  return { path, project };
}

export async function listEditorBackups(directory: string, requestedProjectPath = projectPath): Promise<EditorBackup[]> {
  const path = normalizeProjectPath(requestedProjectPath);
  const files = useWorkspaceFiles(directory);
  await ensureEditorFolders(files);
  const parent = getBackupDirectory(path);
  if (parent !== backupDirectory) {
    const root = await files.list(backupDirectory);
    if (!root.entries.some(entry => entry.type === "directory" && entry.path === parent)) return [];
  }
  const listing = await files.list(parent);
  return listing.entries
    .filter(entry => entry.type === "file" && backupNamePattern.test(entry.name) && entry.path === `${parent}/${entry.name}`)
    .map(entry => ({ name: entry.name, path: entry.path }))
    .sort((left, right) => right.name.localeCompare(left.name));
}

export async function loadEditorProject(directory: string, requestedProjectPath = projectPath): Promise<{ project: EditorProject; revision: string; content: string; backups: EditorBackup[] }> {
  const path = normalizeProjectPath(requestedProjectPath);
  const files = useWorkspaceFiles(directory);
  await ensureEditorFolders(files);
  const { content, revision } = await files.readVersionedText(path);
  const project = revision === "missing" ? createEmptyProject(path === projectPath ? "默认剪辑项目" : `剪辑工程 ${path.split("/").at(-1)!.slice(0, 8)}`) : parseEditorProject(JSON.parse(content));
  const backups = await listEditorBackups(directory, path);
  return { project, revision, content, backups };
}

export async function backupEditorContent(directory: string, content: string, requestedProjectPath = projectPath): Promise<string> {
  const path = normalizeProjectPath(requestedProjectPath);
  const files = useWorkspaceFiles(directory);
  await ensureEditorFolders(files);
  const parent = getBackupDirectory(path);
  if (parent !== backupDirectory) {
    const root = await files.list(backupDirectory);
    if (!root.entries.some(entry => entry.type === "directory" && entry.path === parent)) await files.mkdir(parent);
  }
  const timestamp = new Date().toISOString().replace(/\D/g, "");
  const backupPath = `${parent}/backup${timestamp}${crypto.randomUUID().replaceAll("-", "")}.json`;
  await files.write(backupPath, content, true);
  return backupPath;
}

export async function pruneEditorBackups(directory: string, retainedPath?: string, requestedProjectPath = projectPath): Promise<void> {
  const path = normalizeProjectPath(requestedProjectPath);
  const files = useWorkspaceFiles(directory);
  const backups = (await listEditorBackups(directory, path)).filter(backup => backupNamePattern.test(backup.name));
  const hasRetained = backups.some(backup => backup.path === retainedPath);
  const retained = new Set([
    ...(hasRetained ? [retainedPath!] : []),
    ...backups.filter(backup => backup.path !== retainedPath).slice(0, hasRetained ? 9 : 10).map(backup => backup.path),
  ]);
  const cleanup = await Promise.allSettled(backups.filter(backup => !retained.has(backup.path)).map(backup => files.remove(backup.path)));
  const failures = cleanup.filter(result => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), "旧剪辑备份清理失败");
}

export async function saveEditorProject(directory: string, project: EditorProject, expectedRevision: string, previousContent: string, requestedProjectPath = projectPath): Promise<{ revision: string; content: string }> {
  const path = normalizeProjectPath(requestedProjectPath);
  const normalizedProject = parseEditorProject(project);
  if (!/^(?:missing|[\da-f]{64})$/.test(expectedRevision)) throw new Error("剪辑项目版本标记无效");
  const files = useWorkspaceFiles(directory);
  await ensureEditorFolders(files);
  const content = `${JSON.stringify(normalizedProject, null, 2)}\n`;
  let hasPreviousProject = false;
  if (previousContent) {
    try {
      parseEditorProject(JSON.parse(previousContent));
      hasPreviousProject = true;
    } catch {
      hasPreviousProject = false;
    }
  }
  let backupPath: string | undefined;
  if (hasPreviousProject) backupPath = await backupEditorContent(directory, previousContent, path);
  const { revision } = await files.writeVersionedText(path, content, expectedRevision);
  if (hasPreviousProject) {
    try {
      await pruneEditorBackups(directory, backupPath, path);
    } catch (error) {
      console.warn("剪辑项目已保存，但旧备份清理失败", error);
    }
  }
  return { revision, content };
}

export async function readEditorBackup(directory: string, backupPath: string, requestedProjectPath = projectPath): Promise<EditorProject> {
  const project = normalizeProjectPath(requestedProjectPath);
  const parent = getBackupDirectory(project);
  const normalizedPath = backupPath.replaceAll("\\", "/");
  const filename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
  if (normalizedPath !== `${parent}/${filename}` || !backupNamePattern.test(filename)) throw new Error("备份路径无效或不属于当前剪辑工程");
  const files = useWorkspaceFiles(directory);
  return parseEditorProject(JSON.parse(await files.readText(normalizedPath)));
}

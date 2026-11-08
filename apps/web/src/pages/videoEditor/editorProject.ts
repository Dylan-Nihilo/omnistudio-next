import useWorkspaceFiles from "@/lib/workspaceFiles";
import { createDefaultTracks, parseEditorProject, type EditorProject } from "./editorModel";

const projectPath = "assets/videoEditor/timeline.json";
const editorDirectory = "assets/videoEditor";
const backupDirectory = "assets/videoEditor/backups";
const backupNamePattern = /^backup\d{17}[\da-f]{32}\.json$/;

type EditorBackup = { name: string; path: string };

function createEmptyProject(): EditorProject {
  return {
    version: 2,
    assets: [],
    clips: [],
    tracks: createDefaultTracks(),
    aspectRatio: "16:9",
    frameRate: 30,
    exportHeight: 1080,
    exportQuality: "standard",
  };
}

export async function ensureEditorFolders(files: ReturnType<typeof useWorkspaceFiles>): Promise<void> {
  const root = await files.list();
  if (!root.entries.some(entry => entry.path === "assets" && entry.type === "directory")) await files.mkdir("assets");
  const assets = await files.list("assets");
  if (!assets.entries.some(entry => entry.path === "assets/videoEditor" && entry.type === "directory")) await files.mkdir("assets/videoEditor");
  const editor = await files.list("assets/videoEditor");
  for (const name of ["media", "exports", "backups"]) {
    const path = `${editorDirectory}/${name}`;
    if (!editor.entries.some(entry => entry.path === path && entry.type === "directory")) await files.mkdir(path);
  }
}

export async function listEditorBackups(directory: string): Promise<EditorBackup[]> {
  const files = useWorkspaceFiles(directory);
  const listing = await files.list(backupDirectory);
  return listing.entries
    .filter(entry => entry.type === "file" && entry.name.endsWith(".json") && entry.path === `${backupDirectory}/${entry.name}` && !/[\\/]/.test(entry.name))
    .map(entry => ({ name: entry.name, path: entry.path }))
    .sort((left, right) => right.name.localeCompare(left.name));
}

export async function loadEditorProject(directory: string): Promise<{ project: EditorProject; revision: string; content: string; backups: EditorBackup[] }> {
  const files = useWorkspaceFiles(directory);
  await ensureEditorFolders(files);
  const { content, revision } = await files.readVersionedText(projectPath);
  const project = revision === "missing" ? createEmptyProject() : parseEditorProject(JSON.parse(content));
  const backups = await listEditorBackups(directory);
  return { project, revision, content, backups };
}

export async function backupEditorContent(directory: string, content: string): Promise<string> {
  const files = useWorkspaceFiles(directory);
  await ensureEditorFolders(files);
  const timestamp = new Date().toISOString().replace(/\D/g, "");
  const path = `${backupDirectory}/backup${timestamp}${crypto.randomUUID().replaceAll("-", "")}.json`;
  await files.write(path, content, true);
  return path;
}

export async function pruneEditorBackups(directory: string, retainedPath?: string): Promise<void> {
  const files = useWorkspaceFiles(directory);
  const backups = (await listEditorBackups(directory)).filter(backup => backupNamePattern.test(backup.name));
  const hasRetained = backups.some(backup => backup.path === retainedPath);
  const retained = new Set([
    ...(hasRetained ? [retainedPath!] : []),
    ...backups.filter(backup => backup.path !== retainedPath).slice(0, hasRetained ? 9 : 10).map(backup => backup.path),
  ]);
  const cleanup = await Promise.allSettled(backups.filter(backup => !retained.has(backup.path)).map(backup => files.remove(backup.path)));
  const failures = cleanup.filter(result => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), "旧剪辑备份清理失败");
}

export async function saveEditorProject(directory: string, project: EditorProject, expectedRevision: string, previousContent: string): Promise<{ revision: string; content: string }> {
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
  if (hasPreviousProject) backupPath = await backupEditorContent(directory, previousContent);
  const { revision } = await files.writeVersionedText(projectPath, content, expectedRevision);
  if (hasPreviousProject) {
    try {
      await pruneEditorBackups(directory, backupPath);
    } catch (error) {
      console.warn("剪辑项目已保存，但旧备份清理失败", error);
    }
  }
  return { revision, content };
}

export async function readEditorBackup(directory: string, path: string): Promise<EditorProject> {
  const normalizedPath = path.replaceAll("\\", "/");
  const filename = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
  if (normalizedPath !== `${backupDirectory}/${filename}` || !filename.endsWith(".json") || filename === ".json" || /[\u0000-\u001f:<>"|?*]/.test(filename)) throw new Error("备份路径无效");
  const files = useWorkspaceFiles(directory);
  return parseEditorProject(JSON.parse(await files.readText(normalizedPath)));
}

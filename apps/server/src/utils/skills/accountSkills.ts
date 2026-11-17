import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAccountDirectory, getDataDirectory } from "@/utils/conf";
import { isSafeSegment } from "@/utils/skills/files";
import { isWithin, lockWorkspaceFiles, writeWorkspaceFile } from "@/utils/workspace/files";

const preferencesFileName = ".skillMarket.json";

export type AccountSkillPackageBackup = {
  id: string;
  version: string;
  sourceCommit: string;
  sourceSha256: string;
  archiveSha256: string;
  createdAt: string;
};

export type AccountSkillPackageRecord = {
  version: string;
  sourceCommit: string;
  sha256: string;
  installedAt: string;
  fileHashes: Record<string, Record<string, string>>;
  installed?: boolean;
  backups?: AccountSkillPackageBackup[];
};

type AccountSkillMarketState = { version: 1; autoPaused: string[]; packages: Record<string, AccountSkillPackageRecord> };

function invalidDirectory(): never {
  throw Object.assign(new Error("账户技能目录必须位于账户私有目录内且不能包含符号链接"), { status: 403 });
}

export function directory(userId: string) {
  return join(getAccountDirectory(userId), "skills");
}

export function existingDirectory(userId: string) {
  const dataDirectory = getDataDirectory();
  const accountDirectory = getAccountDirectory(userId);
  let current = dataDirectory;
  for (const target of [dirname(accountDirectory), accountDirectory, join(accountDirectory, "skills")]) {
    current = target;
    if (!existsSync(current)) return undefined;
    const info = lstatSync(current);
    if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(dataDirectory, realpathSync(current))) invalidDirectory();
  }
  return current;
}

export async function ensureDirectory(userId: string) {
  const dataDirectory = getDataDirectory();
  const accountDirectory = getAccountDirectory(userId);
  let current = dataDirectory;
  for (const target of [dirname(accountDirectory), accountDirectory, join(accountDirectory, "skills")]) {
    current = target;
    let info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (!info) {
      await mkdir(current, { mode: 0o700 });
      info = await lstat(current);
    }
    if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(dataDirectory, await realpath(current))) invalidDirectory();
  }
  return current;
}

export async function lockPackageLifecycle(userId: string, packageId: string) {
  if (!/^[a-z][a-zA-Z0-9]{0,99}$/.test(packageId)) throw Object.assign(new Error("技能包标识无效"), { status: 400 });
  const skillsDirectory = await ensureDirectory(userId);
  return lockWorkspaceFiles([join(dirname(skillsDirectory), ".skillPackage-" + packageId)]);
}

export async function ensureBackupDirectory(userId: string, packageId: string, backupId: string) {
  if (!/^[a-z][a-zA-Z0-9]{0,99}$/.test(packageId) || !/^[\da-f-]{36}$/i.test(backupId)) {
    throw Object.assign(new Error("技能备份标识无效"), { status: 400 });
  }
  const dataDirectory = getDataDirectory();
  const accountDirectory = getAccountDirectory(userId);
  let current = dataDirectory;
  for (const target of [dirname(accountDirectory), accountDirectory, join(accountDirectory, "skillBackups"), join(accountDirectory, "skillBackups", packageId), join(accountDirectory, "skillBackups", packageId, backupId)]) {
    current = target;
    let info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
    if (!info) {
      await mkdir(current, { mode: 0o700 });
      info = await lstat(current);
    }
    if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(dataDirectory, await realpath(current))) invalidDirectory();
  }
  return current;
}

export async function removeBackupDirectory(userId: string, packageId: string, backupId: string) {
  if (!/^[a-z][a-zA-Z0-9]{0,99}$/.test(packageId) || !/^[\da-f-]{36}$/i.test(backupId)) {
    throw Object.assign(new Error("技能备份标识无效"), { status: 400 });
  }
  const dataDirectory = getDataDirectory();
  const accountDirectory = getAccountDirectory(userId);
  const targets = [dirname(accountDirectory), accountDirectory, join(accountDirectory, "skillBackups"), join(accountDirectory, "skillBackups", packageId), join(accountDirectory, "skillBackups", packageId, backupId)];
  for (const target of targets) {
    const info = await lstat(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!info) return;
    if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(dataDirectory, await realpath(target))) invalidDirectory();
  }
  await rm(targets.at(-1)!, { recursive: true, force: false });
}

export async function listBackupRecords(userId: string, packageId: string): Promise<AccountSkillPackageBackup[]> {
  if (!/^[a-z][a-zA-Z0-9]{0,99}$/.test(packageId)) throw Object.assign(new Error("技能包标识无效"), { status: 400 });
  const dataDirectory = getDataDirectory();
  const accountDirectory = getAccountDirectory(userId);
  const root = join(accountDirectory, "skillBackups", packageId);
  const roots = [dirname(accountDirectory), accountDirectory, dirname(root), root];
  for (const path of roots) {
    const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!info) return [];
    if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(dataDirectory, await realpath(path))) invalidDirectory();
  }
  const backups: AccountSkillPackageBackup[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[\da-f-]{36}$/i.test(entry.name)) continue;
    const directory = join(root, entry.name);
    const info = await lstat(directory);
    if (info.isSymbolicLink() || !isWithin(dataDirectory, await realpath(directory))) invalidDirectory();
    const manifestPath = join(directory, "backup.json");
    const manifestInfo = await lstat(manifestPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!manifestInfo) continue;
    if (manifestInfo.isSymbolicLink() || !manifestInfo.isFile() || manifestInfo.size > 16 * 1024) invalidDirectory();
    const parsed: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!parsed || typeof parsed !== "object") invalidDirectory();
    const value = parsed as Record<string, unknown>;
    if (value.packageId !== packageId || value.id !== entry.name || typeof value.version !== "string"
      || typeof value.sourceCommit !== "string" || typeof value.sourceSha256 !== "string"
      || typeof value.archiveSha256 !== "string" || typeof value.createdAt !== "string"
      || !/^[\da-f]{64}$/.test(value.sourceSha256) || !/^[\da-f]{64}$/.test(value.archiveSha256)) invalidDirectory();
    backups.push({ id: value.id, version: value.version, sourceCommit: value.sourceCommit, sourceSha256: value.sourceSha256, archiveSha256: value.archiveSha256, createdAt: value.createdAt });
  }
  return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function preferencesPath(userId: string) {
  const root = existingDirectory(userId);
  return root ? join(root, preferencesFileName) : undefined;
}

export function autoPausedNames(userId: string) {
  return readMarketState(userId).autoPaused;
}

function readMarketState(userId: string): AccountSkillMarketState {
  const path = preferencesPath(userId);
  if (!path || !existsSync(path)) return { version: 1, autoPaused: [], packages: {} };
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile() || info.size > 4 * 1024 * 1024) invalidDirectory();
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object") invalidDirectory();
  const state = parsed as Partial<AccountSkillMarketState>;
  const packages = state.packages ?? {};
  if (state.version !== 1 || !Array.isArray(state.autoPaused) || !packages || typeof packages !== "object" || Array.isArray(packages)) invalidDirectory();
  if (state.autoPaused.length > 2000 || state.autoPaused.some(name => typeof name !== "string" || !/^[a-z][a-zA-Z0-9-]{0,63}$/.test(name))) invalidDirectory();
  for (const [packageId, record] of Object.entries(packages)) {
    if (!/^[a-z][a-zA-Z0-9]{0,99}$/.test(packageId) || !record || typeof record !== "object"
      || typeof record.version !== "string" || typeof record.sourceCommit !== "string" || typeof record.sha256 !== "string"
      || typeof record.installedAt !== "string" || !record.fileHashes || typeof record.fileHashes !== "object") invalidDirectory();
    if (record.installed !== undefined && typeof record.installed !== "boolean") invalidDirectory();
    if (record.backups !== undefined && (!Array.isArray(record.backups) || record.backups.length > 50 || record.backups.some(backup =>
      !backup || !/^[\da-f-]{36}$/i.test(backup.id) || typeof backup.version !== "string"
      || typeof backup.sourceCommit !== "string" || !/^[\da-f]{64}$/.test(backup.sourceSha256)
      || !/^[\da-f]{64}$/.test(backup.archiveSha256) || typeof backup.createdAt !== "string"))) invalidDirectory();
    for (const files of Object.values(record.fileHashes)) {
      if (!files || typeof files !== "object" || Object.entries(files).some(([path, digest]) =>
        !path || path.split("/").some(part => !isSafeSegment(part))
        || typeof digest !== "string" || !/^[\da-f]{64}$/.test(digest))) invalidDirectory();
    }
  }
  return { version: 1, autoPaused: [...new Set(state.autoPaused)], packages };
}

async function updateMarketState(userId: string, update: (state: AccountSkillMarketState) => AccountSkillMarketState) {
  const root = await ensureDirectory(userId);
  const path = join(root, preferencesFileName);
  const release = lockWorkspaceFiles([path]);
  try {
    const state = update(readMarketState(userId));
    await writeWorkspaceFile(path, JSON.stringify(state));
    return state;
  } finally { release(); }
}

export async function setAutoPaused(userId: string, name: string, paused: boolean) {
  if (!/^[a-z][a-zA-Z0-9-]{0,63}$/.test(name)) throw Object.assign(new Error("技能名称无效"), { status: 400 });
  const state = await updateMarketState(userId, current => ({
    ...current,
    autoPaused: paused ? [...new Set([...current.autoPaused, name])] : current.autoPaused.filter(value => value !== name),
  }));
  return state.autoPaused;
}

export function getPackageRecord(userId: string, packageId: string) {
  return readMarketState(userId).packages[packageId];
}

export async function setPackageRecord(userId: string, packageId: string, record: AccountSkillPackageRecord) {
  if (!/^[a-z][a-zA-Z0-9]{0,99}$/.test(packageId)) throw Object.assign(new Error("技能包标识无效"), { status: 400 });
  return updateMarketState(userId, current => ({ ...current, packages: { ...current.packages, [packageId]: record } }));
}

export async function removeInstalledPackageRecord(userId: string, packageId: string) {
  return updateMarketState(userId, current => {
    const record = current.packages[packageId];
    if (!record) return current;
    return { ...current, packages: { ...current.packages, [packageId]: { ...record, installed: false, fileHashes: {} } } };
  });
}

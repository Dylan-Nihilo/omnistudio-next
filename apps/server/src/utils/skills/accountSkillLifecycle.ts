import { createHash, randomUUID } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
import { requireActiveAccount } from "@/utils/accountContext";
import * as accountSkills from "@/utils/skills/accountSkills";
import type { AccountSkillPackageBackup, AccountSkillPackageRecord } from "@/utils/skills/accountSkills";
import { skillCatalog } from "@/utils/skills/catalog";
import { isWithin, writeWorkspaceFile } from "@/utils/workspace/files";
import * as packageInstall from "@/utils/plugins/install";
import { previewAccountSkillPackageUpdate } from "@/utils/skills/accountPackageDiff";

type CatalogPackage = typeof skillCatalog[number];
type CatalogVersion = CatalogPackage["versions"][number];

function packageVersion(item: CatalogPackage, version: CatalogVersion) {
  return { ...item, ...version, packageId: item.packageId, skills: version.skills.map(name => ({ name })) };
}

function hash(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

function flattenFileHashes(files: Record<string, Record<string, string>>) {
  return Object.fromEntries(Object.entries(files).flatMap(([name, entries]) => Object.entries(entries).map(([path, digest]) => [name + "/" + path, digest])));
}

function assertBackupMatchesSnapshot(saved: Awaited<ReturnType<typeof saveBackup>>, snapshot: Record<string, string>) {
  const actual = flattenFileHashes(saved.fileHashes);
  if (Object.keys(actual).length !== Object.keys(snapshot).length || Object.entries(actual).some(([path, digest]) => snapshot[path] !== digest)) {
    throw Object.assign(new Error("预览后个人技能文件发生变化，请重新查看差异"), { status: 409 });
  }
}

async function readPackageArchive(userId: string, version: CatalogVersion) {
  const root = accountSkills.existingDirectory(userId);
  if (!root) throw Object.assign(new Error("当前账户没有安装此技能包"), { status: 404 });
  const files: Record<string, Uint8Array> = {};
  let totalBytes = 0;
  for (const name of version.skills) {
    const skillDirectory = join(root, name);
    const info = await lstat(skillDirectory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") throw Object.assign(new Error("找不到个人技能：" + name), { status: 409 });
      throw error;
    });
    if (info.isSymbolicLink() || !info.isDirectory() || !isWithin(root, skillDirectory)) throw Object.assign(new Error("个人技能路径无效：" + name), { status: 403 });
    async function walk(directory: string, prefix: string) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        const child = await lstat(path);
        if (child.isSymbolicLink()) throw Object.assign(new Error("个人技能包含符号链接，不能覆盖或卸载：" + name), { status: 403 });
        const relativePath = prefix ? prefix + "/" + entry.name : entry.name;
        if (child.isDirectory()) await walk(path, relativePath);
        else if (child.isFile()) {
          totalBytes += child.size;
          if (totalBytes > 20 * 1024 * 1024) throw Object.assign(new Error("个人技能包超过 20 MB"), { status: 413 });
          files[name + "/" + relativePath] = new Uint8Array(await readFile(path));
        } else throw Object.assign(new Error("个人技能包含特殊文件：" + name), { status: 403 });
      }
    }
    await walk(skillDirectory, "");
  }
  return { archive: zipSync(files), files };
}

function fileHashes(files: Record<string, Uint8Array>) {
  const result: Record<string, Record<string, string>> = {};
  for (const [path, content] of Object.entries(files)) {
    const slash = path.indexOf("/");
    const name = path.slice(0, slash);
    (result[name] ??= {})[path.slice(slash + 1)] = hash(content);
  }
  return result;
}

async function saveBackup(userId: string, item: CatalogPackage, version: CatalogVersion) {
  const { archive, files } = await readPackageArchive(userId, version);
  if (archive.byteLength > 20 * 1024 * 1024) throw Object.assign(new Error("个人技能备份超过 20 MB"), { status: 413 });
  const id = randomUUID();
  const directory = await accountSkills.ensureBackupDirectory(userId, item.packageId, id);
  const archiveSha256 = hash(archive);
  const metadata: AccountSkillPackageBackup = {
    id,
    version: version.version,
    sourceCommit: version.sourceCommit,
    sourceSha256: version.sha256,
    archiveSha256,
    createdAt: new Date().toISOString(),
  };
  await writeWorkspaceFile(join(directory, "backup.zip"), archive, true);
  await writeWorkspaceFile(join(directory, "backup.json"), JSON.stringify({ packageId: item.packageId, ...metadata }), true);
  return { metadata, fileHashes: fileHashes(files) };
}

async function readBackup(userId: string, item: CatalogPackage, backup: AccountSkillPackageBackup) {
  const directory = await accountSkills.ensureBackupDirectory(userId, item.packageId, backup.id);
  const archivePath = join(directory, "backup.zip");
  const metadataPath = join(directory, "backup.json");
  for (const path of [archivePath, metadataPath]) {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) throw Object.assign(new Error("技能备份文件无效"), { status: 403 });
  }
  const metadata: unknown = JSON.parse(await readFile(metadataPath, "utf8"));
  if (!metadata || typeof metadata !== "object") throw Object.assign(new Error("技能备份清单无效"), { status: 409 });
  const saved = metadata as Record<string, unknown>;
  if (saved.packageId !== item.packageId || saved.id !== backup.id || saved.version !== backup.version
    || saved.sourceCommit !== backup.sourceCommit || saved.sourceSha256 !== backup.sourceSha256
    || saved.archiveSha256 !== backup.archiveSha256 || saved.createdAt !== backup.createdAt) {
    throw Object.assign(new Error("技能备份清单与账户记录不一致"), { status: 409 });
  }
  const archive = new Uint8Array(await readFile(archivePath));
  if (hash(archive) !== backup.archiveSha256) throw Object.assign(new Error("技能备份摘要不匹配"), { status: 409 });
  return archive;
}

async function repairPackageRecord(userId: string, item: CatalogPackage, version: CatalogVersion, backups: AccountSkillPackageBackup[], installedAt: string) {
  const actual = await previewAccountSkillPackageUpdate(item, version.version).catch(() => undefined);
  if (!actual?.cleanFromCatalog || actual.currentVersion !== version.version) return false;
  const currentFiles = await readPackageArchive(userId, version);
  await accountSkills.setPackageRecord(userId, item.packageId, {
    version: version.version, sourceCommit: version.sourceCommit, sha256: version.sha256,
    installedAt, fileHashes: fileHashes(currentFiles.files), installed: true, backups,
  });
  return true;
}

function history(previous?: AccountSkillPackageRecord) {
  return [...previous?.backups ?? []];
}

async function allBackups(userId: string, item: CatalogPackage, previous?: AccountSkillPackageRecord) {
  const disk = await accountSkills.listBackupRecords(userId, item.packageId);
  return [...new Map([...history(previous), ...disk].map(backup => [backup.id, backup])).values()];
}

function appendBackup(backups: readonly AccountSkillPackageBackup[], backup: AccountSkillPackageBackup) {
  return [...new Map([...backups, backup].map(item => [item.id, item])).values()]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-10);
}

async function pruneBackups(userId: string, item: CatalogPackage, previous: readonly AccountSkillPackageBackup[], retained: readonly AccountSkillPackageBackup[]) {
  const keep = new Set(retained.map(backup => backup.id));
  for (const backup of previous) if (!keep.has(backup.id)) await accountSkills.removeBackupDirectory(userId, item.packageId, backup.id);
}

async function withPackageLock<T>(userId: string, item: CatalogPackage, operation: () => Promise<T>) {
  const release = await accountSkills.lockPackageLifecycle(userId, item.packageId);
  try { return await operation(); }
  finally { release(); }
}

function latestCatalogVersion(item: CatalogPackage) {
  return [...item.versions].sort((left, right) => Bun.semver.order(right.version, left.version))[0];
}

async function hasAnyPackageSkills(item: CatalogPackage, userId: string) {
  const directory = accountSkills.existingDirectory(userId);
  if (!directory) return false;
  for (const skill of item.skills) {
    const info = await lstat(join(directory, skill.name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isDirectory()) throw Object.assign(new Error("个人技能路径无效：" + skill.name), { status: 403 });
    return true;
  }
  return false;
}

export async function upgradeAccountSkillPackage(item: CatalogPackage, targetVersion: string) {
  const userId = requireActiveAccount().userId;
  return withPackageLock(userId, item, async () => {
    const preview = await previewAccountSkillPackageUpdate(item, targetVersion);
    if (!preview.updateAvailable) throw Object.assign(new Error("没有可升级的较新版本"), { status: 409 });
    if (!preview.cleanFromCatalog) throw Object.assign(new Error("当前技能包含本地修改，请先导出或处理这些文件后再升级"), { status: 409 });
    const current = item.versions.find(version => version.version === preview.currentVersion);
    const target = item.versions.find(version => version.version === targetVersion);
    if (!current || !target) throw Object.assign(new Error("固定版本目录中缺少当前版本或目标版本"), { status: 409 });
    const saved = await saveBackup(userId, item, current);
    try { assertBackupMatchesSnapshot(saved, preview.currentHashes); }
    catch (error) {
      await accountSkills.removeBackupDirectory(userId, item.packageId, saved.metadata.id);
      throw error;
    }
    const previous = accountSkills.getPackageRecord(userId, item.packageId);
    const previousBackups = await allBackups(userId, item, previous);
    const backups = appendBackup(previousBackups, saved.metadata);
    const installedAt = previous?.installedAt ?? saved.metadata.createdAt;
    await accountSkills.setPackageRecord(userId, item.packageId, {
      version: current.version, sourceCommit: current.sourceCommit, sha256: current.sha256,
      installedAt, fileHashes: saved.fileHashes, installed: true, backups,
    });
    let installed: Awaited<ReturnType<typeof packageInstall.installCatalogSkillPackage>>;
    try {
      installed = await packageInstall.installCatalogSkillPackage(packageVersion(item, target), "account", {
        replaceExisting: true,
        replaceSkillNames: current.skills,
        expectedExistingHashes: preview.currentHashes,
        backups,
      });
    } catch (error) {
      try {
        if (!(await repairPackageRecord(userId, item, target, backups, installedAt))) {
          await repairPackageRecord(userId, item, current, backups, installedAt);
        }
      } catch (repairError) {
        throw new AggregateError([error, repairError], "技能升级失败，账户版本记录修复也失败");
      }
      await pruneBackups(userId, item, previousBackups, backups);
      throw error;
    }
    await pruneBackups(userId, item, previousBackups, backups);
    return { ...installed, currentVersion: current.version, version: target.version, backupId: saved.metadata.id };
  });
}

export async function rollbackAccountSkillPackage(item: CatalogPackage, backupId: string) {
  const userId = requireActiveAccount().userId;
  return withPackageLock(userId, item, async () => {
    const previous = accountSkills.getPackageRecord(userId, item.packageId);
    const backupsBefore = await allBackups(userId, item, previous);
    const backup = backupsBefore.find(value => value.id === backupId);
    if (!backup) throw Object.assign(new Error("找不到此账户的技能备份"), { status: 404 });
    const target = item.versions.find(version => version.version === backup.version && version.sourceCommit === backup.sourceCommit && version.sha256 === backup.sourceSha256);
    if (!target) throw Object.assign(new Error("备份来源不在固定版本目录中，不能自动恢复"), { status: 409 });
    const preview = await previewAccountSkillPackageUpdate(item, target.version);
    if (!preview.cleanFromCatalog) throw Object.assign(new Error("当前技能包含本地修改，不能覆盖回滚"), { status: 409 });
    const currentVersion = item.versions.find(version => version.version === preview.currentVersion);
    if (!currentVersion) throw Object.assign(new Error("当前安装版本不在固定版本目录中，不能安全回滚"), { status: 409 });
    const currentBackup = await saveBackup(userId, item, currentVersion);
    assertBackupMatchesSnapshot(currentBackup, preview.currentHashes);
    const archive = await readBackup(userId, item, backup);
    const backups = appendBackup(backupsBefore, currentBackup.metadata);
    let result: Awaited<ReturnType<typeof packageInstall.restoreAccountSkillPackageArchive>>;
    try {
      result = await packageInstall.restoreAccountSkillPackageArchive(packageVersion(item, target), archive, backups, item.skills.map(skill => skill.name), preview.currentHashes);
    } catch (error) {
      try { await repairPackageRecord(userId, item, target, backups, previous?.installedAt ?? currentBackup.metadata.createdAt); }
      catch (repairError) { throw new AggregateError([error, repairError], "技能回滚失败，账户版本记录修复也失败"); }
      throw error;
    }
    await pruneBackups(userId, item, backupsBefore, backups);
    return result;
  });
}

export async function uninstallAccountSkillPackage(item: CatalogPackage) {
  const userId = requireActiveAccount().userId;
  return withPackageLock(userId, item, async () => {
    const previous = accountSkills.getPackageRecord(userId, item.packageId);
    const latest = latestCatalogVersion(item);
    if (!latest) throw Object.assign(new Error("固定版本目录为空"), { status: 409 });
    const preview = await previewAccountSkillPackageUpdate(item, latest.version);
    if (!preview.cleanFromCatalog) throw Object.assign(new Error("当前技能包含本地修改，请先处理这些文件后再卸载"), { status: 409 });
    const currentVersion = item.versions.find(version => version.version === preview.currentVersion);
    if (!currentVersion) throw Object.assign(new Error("无法确认当前包版本，不能安全卸载"), { status: 409 });
    const saved = await saveBackup(userId, item, currentVersion);
    try { assertBackupMatchesSnapshot(saved, preview.currentHashes); }
    catch (error) {
      await accountSkills.removeBackupDirectory(userId, item.packageId, saved.metadata.id);
      throw error;
    }
    const previousBackups = await allBackups(userId, item, previous);
    const backups = appendBackup(previousBackups, saved.metadata);
    const installedAt = previous?.installedAt ?? saved.metadata.createdAt;
    await accountSkills.setPackageRecord(userId, item.packageId, {
      version: currentVersion.version,
      sourceCommit: currentVersion.sourceCommit,
      sha256: currentVersion.sha256,
      installedAt,
      fileHashes: saved.fileHashes,
      installed: true,
      backups,
    });
    await packageInstall.removeAccountSkillPackage(item.skills.map(skill => skill.name), preview.currentHashes);
    await accountSkills.setPackageRecord(userId, item.packageId, {
      version: currentVersion.version,
      sourceCommit: currentVersion.sourceCommit,
      sha256: currentVersion.sha256,
      installedAt,
      fileHashes: {},
      installed: false,
      backups,
    });
    await pruneBackups(userId, item, previousBackups, backups);
    return { names: currentVersion.skills, backupId: saved.metadata.id };
  });
}

export async function restoreAccountSkillPackage(item: CatalogPackage, backupId: string) {
  const userId = requireActiveAccount().userId;
  return withPackageLock(userId, item, async () => {
    const previous = accountSkills.getPackageRecord(userId, item.packageId);
    const backupsBefore = await allBackups(userId, item, previous);
    const backup = backupsBefore.find(value => value.id === backupId);
    if (!backup) throw Object.assign(new Error("找不到此账户的技能备份"), { status: 404 });
    const target = item.versions.find(version => version.version === backup.version && version.sourceCommit === backup.sourceCommit && version.sha256 === backup.sourceSha256);
    if (!target) throw Object.assign(new Error("备份来源不在固定版本目录中，不能自动恢复"), { status: 409 });
    const hasSkills = await hasAnyPackageSkills(item, userId);
    let current: CatalogVersion | undefined;
    let preview: Awaited<ReturnType<typeof previewAccountSkillPackageUpdate>> | undefined;
    if (hasSkills) {
      const latest = latestCatalogVersion(item);
      if (!latest) throw Object.assign(new Error("固定版本目录为空"), { status: 409 });
      preview = await previewAccountSkillPackageUpdate(item, latest.version);
      if (!preview.cleanFromCatalog) throw Object.assign(new Error("当前技能包含本地修改，不能覆盖恢复"), { status: 409 });
      current = item.versions.find(version => version.version === preview!.currentVersion);
      if (!current) throw Object.assign(new Error("当前安装版本不在固定版本目录中，不能安全恢复"), { status: 409 });
    }
    const archive = await readBackup(userId, item, backup);
    const currentBackup = current ? await saveBackup(userId, item, current) : undefined;
    if (currentBackup && preview) assertBackupMatchesSnapshot(currentBackup, preview.currentHashes);
    const backups = currentBackup ? appendBackup(backupsBefore, currentBackup.metadata) : [...backupsBefore].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).slice(-10);
    let result: Awaited<ReturnType<typeof packageInstall.restoreAccountSkillPackageArchive>>;
    try {
      result = await packageInstall.restoreAccountSkillPackageArchive(
        packageVersion(item, target), archive, backups, item.skills.map(skill => skill.name), preview?.currentHashes ?? {},
      );
    } catch (error) {
      try { await repairPackageRecord(userId, item, target, backups, previous?.installedAt ?? backup.createdAt); }
      catch (repairError) { throw new AggregateError([error, repairError], "技能恢复失败，账户版本记录修复也失败"); }
      throw error;
    }
    await pruneBackups(userId, item, backupsBefore, backups);
    return result;
  });
}

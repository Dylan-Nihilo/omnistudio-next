import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { accountContext } from "@/utils/accountContext";
import { existingDirectory, getPackageRecord } from "@/utils/skills/accountSkills";
import { downloadCatalogSkillPackageFiles } from "@/utils/plugins/install";

type CatalogPackage = {
  packageId: string;
  version: string;
  sourceCommit: string;
  skills: readonly { name: string }[];
  versions: readonly {
    version: string;
    sourceCommit: string;
    packageUrl: string;
    fileName: string;
    sha256: string;
    skills: readonly string[];
  }[];
};

type PackageFiles = Map<string, Uint8Array>;

function digest(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}

async function readCurrentFiles(directory: string, names: readonly string[]): Promise<PackageFiles> {
  const result: PackageFiles = new Map();
  let totalBytes = 0;
  for (const name of names) {
    const root = join(directory, name);
    const rootInfo = await lstat(root);
    if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()) throw Object.assign(new Error(`技能目录“${name}”不是普通目录`), { status: 403 });
    async function walk(current: string, prefix: string) {
      for (const entry of await readdir(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        const info = await lstat(path);
        if (info.isSymbolicLink()) throw Object.assign(new Error(`技能“${name}”包含符号链接，不能安全比较`), { status: 403 });
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        const packagePath = `${name}/${relative}`;
        if (info.isDirectory()) await walk(path, packagePath.slice(name.length + 1));
        else if (info.isFile()) {
          totalBytes += info.size;
          if (totalBytes > 20 * 1024 * 1024) throw Object.assign(new Error("当前技能包超过差异比较的 20 MB 限制"), { status: 413 });
          result.set(packagePath, new Uint8Array(await readFile(path)));
        } else throw Object.assign(new Error(`技能“${name}”包含特殊文件，不能安全比较`), { status: 403 });
      }
    }
    await walk(root, "");
  }
  return result;
}

function compareFiles(current: PackageFiles, target: PackageFiles) {
  const paths = new Set([...current.keys(), ...target.keys()]);
  const changes = [...paths].flatMap(path => {
    const before = current.get(path);
    const after = target.get(path);
    const status = !before ? "added" as const : !after ? "deleted" as const : digest(before) !== digest(after) ? "changed" as const : undefined;
    return status ? [{ path, status, ...(before ? { beforeHash: digest(before) } : {}), ...(after ? { afterHash: digest(after) } : {}) }] : [];
  });
  return changes;
}

export async function previewAccountSkillPackageUpdate(item: CatalogPackage, targetVersion: string) {
  const userId = accountContext.getStore()?.userId;
  if (!userId) throw Object.assign(new Error("请先登录"), { status: 401 });
  const target = item.versions.find(version => version.version === targetVersion);
  if (!target) throw Object.assign(new Error("目标版本不在固定版本目录中"), { status: 404 });
  const directory = existingDirectory(userId);
  if (!directory) throw Object.assign(new Error("当前账户没有安装此技能包"), { status: 404 });
  const installedNames: string[] = [];
  for (const skill of item.skills) {
    const info = await lstat(join(directory, skill.name)).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (info) {
      if (info.isSymbolicLink() || !info.isDirectory()) throw Object.assign(new Error(`技能目录“${skill.name}”无效`), { status: 403 });
      installedNames.push(skill.name);
    }
  }
  if (!installedNames.length) throw Object.assign(new Error("当前账户没有安装此技能包"), { status: 404 });
  const candidates = [...item.versions].sort((left, right) => Bun.semver.order(right.version, left.version));
  const inferredCurrent = candidates.find(version => version.skills.length === installedNames.length
    && version.skills.every(name => installedNames.includes(name)));
  const record = getPackageRecord(userId, item.packageId);
  if (!inferredCurrent && !record?.version) throw Object.assign(new Error("无法确认当前安装版本，请先备份并重新安装官方目录版本"), { status: 409 });
  const [current, next, baselines] = await Promise.all([
    readCurrentFiles(directory, installedNames),
    downloadCatalogSkillPackageFiles({ ...item, ...target, packageId: item.packageId, skills: target.skills.map(name => ({ name })) }),
    Promise.all(candidates.filter(version => version.skills.length === installedNames.length
      && version.skills.every(name => installedNames.includes(name))).map(async version => ({
      version,
      files: await downloadCatalogSkillPackageFiles({ ...item, ...version, packageId: item.packageId, skills: version.skills.map(name => ({ name })) }),
    }))),
  ]);
  const catalogBaseline = baselines.find(candidate => compareFiles(candidate.files, current).length === 0);
  const baselineVersion = catalogBaseline?.version ?? inferredCurrent ?? item.versions.find(version => version.version === record?.version);
  const currentVersion = catalogBaseline?.version.version ?? inferredCurrent?.version ?? record?.version;
  if (!currentVersion || !baselineVersion) throw Object.assign(new Error("当前版本不在固定版本目录中，不能安全升级"), { status: 409 });
  const baselineFiles = catalogBaseline?.files ?? baselines.find(candidate => candidate.version.version === baselineVersion.version)?.files;
  const localModified = catalogBaseline
    ? []
    : baselineFiles
      ? compareFiles(baselineFiles, current).map(change => ({
        path: change.path,
        currentHash: change.afterHash ?? "missing",
        installedHash: change.beforeHash ?? "missing",
      }))
      : record
    ? [...new Set([
      ...current.keys(),
      ...Object.entries(record.fileHashes).flatMap(([name, files]) => Object.keys(files).map(path => `${name}/${path}`)),
    ])].flatMap(path => {
      const name = path.split("/")[0]!;
      const relative = path.slice(name.length + 1);
      const currentHash = current.has(path) ? digest(current.get(path)!) : "missing";
      const installedHash = record.fileHashes[name]?.[relative] ?? "missing";
      return currentHash !== installedHash ? [{ path, currentHash, installedHash }] : [];
    }) : [{ path: "（无法核对安装基线）", currentHash: "unknown", installedHash: "unknown" }];
  return {
    currentVersion,
    targetVersion,
    updateAvailable: Bun.semver.order(targetVersion, currentVersion) > 0,
    cleanFromCatalog: localModified.length === 0,
    localModified,
    currentHashes: Object.fromEntries([...current].map(([path, content]) => [path, digest(content)])),
    changes: compareFiles(current, next),
  };
}

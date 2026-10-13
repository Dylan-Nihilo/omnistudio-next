import { copyFile, cp, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

export default async function initializePlugins(targetDirectory: string, sourceDirectory: string, fileFilter?: RegExp | readonly string[], revision?: string) {
  let effectiveRevision = revision;
  if (!effectiveRevision) {
    const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch(() => null);
    if (entries) {
      const matching = entries.filter(file => fileFilter
        ? file.isFile() && (fileFilter instanceof RegExp ? fileFilter.test(file.name) : fileFilter.includes(file.name))
        : file.isDirectory());
      if (matching.length) {
        const stats = await Promise.all(
          matching.map(async file => {
            const s = await stat(resolve(sourceDirectory, file.name)).catch(() => null);
            return s ? `${file.name}:${s.size}:${s.mtimeMs}` : file.name;
          })
        );
        effectiveRevision = createHash("sha256").update(stats.sort().join(";")).digest("hex").slice(0, 16);
      }
    }
  }

  const marker = resolve(targetDirectory, "initialized");
  const initialized = await readFile(marker, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (initialized !== null && (effectiveRevision === undefined ? true : initialized === effectiveRevision)) return;

  const entries = await readdir(sourceDirectory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!entries) return;
  await mkdir(targetDirectory, { recursive: true });
  const files = entries.filter(file => fileFilter
    ? file.isFile() && (fileFilter instanceof RegExp ? fileFilter.test(file.name) : fileFilter.includes(file.name))
    : file.isDirectory());
  if (!files.length && effectiveRevision === undefined) return;
  for (const file of files) {
    const source = resolve(sourceDirectory, file.name);
    const target = resolve(targetDirectory, file.name);
    if (effectiveRevision === undefined) {
      await cp(source, target, { recursive: true, force: false });
      continue;
    }
    // ACT: 版本同步仅覆盖节点和工具单文件；同目录 rename 保留失败时的旧文件。
    const temporary = resolve(targetDirectory, `.pluginSync${crypto.randomUUID()}`);
    try {
      await copyFile(source, temporary);
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
    }
  }
  // 同一构建只同步一次；安装器移除标记以支持同版本重装，构建变化支持升级和降级。
  await writeFile(marker, effectiveRevision ?? "", { flag: effectiveRevision === undefined ? "wx" : "w" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
}

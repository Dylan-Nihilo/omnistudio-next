import { randomUUID } from "node:crypto";
import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { and, eq } from "drizzle-orm";
import { getDatabase, hashSecret } from "@/db/database";
import type { Database } from "@/db/database";
import { personalProjects, serviceCredentials } from "@/db/schema";
import { getAccountConfig, getAccountDirectory, getDataDirectory, platformConfig } from "@/utils/conf";
import { invalidateAccount, requireAccount, requireActiveAccount, requireRootAccount } from "@/utils/accountContext";

export async function getPersonalProjectRoot(userId = requireAccount().userId) {
  const directory = resolve(getAccountDirectory(userId), "workspaces");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const actual = await realpath(directory);
  if (actual !== directory) throw Object.assign(new Error("个人空间不能使用符号链接"), { status: 403 });
  return actual;
}

function contains(root: string, directory: string) {
  const path = relative(root, directory);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

export async function authorizeProjectDirectory(directory: string) {
  const account = requireActiveAccount();
  const actual = await realpath(directory);
  if (!(await stat(actual)).isDirectory()) throw Object.assign(new Error("工作目录不存在"), { status: 404 });
  const personalRoot = await getPersonalProjectRoot();
  if (contains(personalRoot, actual)) return actual;
  const projects = await getDatabase().select({ directory: personalProjects.directory }).from(personalProjects)
    .where(account.isRoot ? undefined : eq(personalProjects.userId, account.userId));
  if (projects.some(project => contains(project.directory, actual))) return actual;
  if (account.isRoot) {
    const usersRoot = resolve(getDataDirectory(), "users");
    const parts = relative(usersRoot, actual).split(sep);
    if (/^[a-f0-9-]{36}$/i.test(parts[0] ?? "") && parts[1] === "workspaces") {
      const root = await getPersonalProjectRoot(parts[0]);
      if (contains(root, actual)) return actual;
    }
  }
  throw Object.assign(new Error("无权访问这个项目或个人空间"), { status: 403 });
}

export async function registerPersonalProject(directory: string, name = basename(directory)) {
  const account = requireAccount();
  const actual = await authorizeProjectDirectory(directory);
  const now = new Date();
  await getDatabase().insert(personalProjects).values({
    id: randomUUID(), userId: account.userId, directory: actual, directoryHash: hashSecret(actual), name, createdAt: now, updatedAt: now,
  }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
  return actual;
}

export async function initializePersonalSpace(userId: string, isRoot: boolean, database: Pick<Database, "insert"> = getDatabase()) {
  await getPersonalProjectRoot(userId);
  const personal = getAccountConfig(userId);
  if (!isRoot) {
    if (!personal.has("settings")) personal.set("settings", { helloCompleted: true, privacy: { dataCollectionEnabled: false }, stores: {}, mcp: { enabled: false, token: "" } });
    return;
  }
  // Legacy project directories stay in place; assigning ownership preserves every media reference and byte.
  if (!personal.has("settings")) {
    const legacy = structuredClone(platformConfig.store);
    const mcp = legacy.settings?.mcp;
    legacy.settings = { ...legacy.settings, mcp: { ...(mcp && typeof mcp === "object" ? mcp : {}), enabled: false, token: "" } };
    // Shared legacy credentials must never acquire root privileges during account migration.
    if (legacy.a2a) legacy.a2a = { ...legacy.a2a, enabled: false, token: "" };
    personal.store = legacy;
  }
  const legacyRoot = resolve(getDataDirectory(), "workspaces");
  const entries = await readdir(legacyRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const now = new Date();
  for (const entry of entries.filter(entry => entry.isDirectory())) {
    const directory = await realpath(resolve(legacyRoot, entry.name));
    if (!contains(legacyRoot, directory)) throw new Error("旧项目目录包含越界符号链接，未迁移其权限");
    await database.insert(personalProjects).values({ id: randomUUID(), userId, directory, directoryHash: hashSecret(directory), name: entry.name, createdAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { updatedAt: now } });
  }
}

export async function registerSelectedDirectory(directory: string) {
  const account = requireRootAccount();
  const actual = await realpath(directory);
  if (!(await stat(actual)).isDirectory()) throw Object.assign(new Error("请选择文件夹"), { status: 400 });
  const now = new Date();
  await getDatabase().insert(personalProjects).values({ id: randomUUID(), userId: account.userId, directory: actual, directoryHash: hashSecret(actual), name: basename(actual), createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { updatedAt: now } });
  return actual;
}

export async function synchronizeServiceCredentials(userId = requireAccount().userId) {
  const personal = getAccountConfig(userId);
  const revoked: string[] = [];
  await getDatabase().transaction(async tx => {
    for (const kind of ["mcp", "a2a"] as const) {
      const raw = kind === "mcp" ? personal.get("settings", {}).mcp : personal.get("a2a");
      const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
      const token = typeof value.token === "string" ? value.token : "";
      if (token.length < 32) {
        const removed = await tx.select({ id: serviceCredentials.id }).from(serviceCredentials).where(and(eq(serviceCredentials.userId, userId), eq(serviceCredentials.kind, kind)));
        revoked.push(...removed.map(value => value.id));
        await tx.delete(serviceCredentials).where(and(eq(serviceCredentials.userId, userId), eq(serviceCredentials.kind, kind)));
        continue;
      }
      const now = new Date();
      const tokenHash = hashSecret(token);
      const [collision] = await tx.select().from(serviceCredentials).where(eq(serviceCredentials.tokenHash, tokenHash)).limit(1);
      if (collision && (collision.userId !== userId || collision.kind !== kind)) throw Object.assign(new Error("这个服务凭证已被使用，请生成新的凭证"), { status: 409 });
      const [existing] = await tx.select().from(serviceCredentials).where(and(eq(serviceCredentials.userId, userId), eq(serviceCredentials.kind, kind))).limit(1).for("update");
      if (existing) {
        if (existing.tokenHash !== tokenHash || existing.enabled !== (value.enabled === true ? 1 : 0)) revoked.push(existing.id);
        await tx.update(serviceCredentials).set({ tokenHash, enabled: value.enabled === true ? 1 : 0, updatedAt: now }).where(eq(serviceCredentials.id, existing.id));
      }
      else await tx.insert(serviceCredentials).values({ id: randomUUID(), userId, kind, tokenHash, enabled: value.enabled === true ? 1 : 0, createdAt: now, updatedAt: now });
    }
  });
  for (const id of revoked) invalidateAccount(userId, id);
}

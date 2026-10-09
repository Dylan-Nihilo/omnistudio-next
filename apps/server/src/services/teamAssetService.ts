import { randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDatabase } from "@/db/database";
import { auditEvents, teamAssets, teamMembers, teams } from "@/db/schema";
import { requireTeamAccess } from "@/services/teamService";
import { authorizeProjectDirectory } from "@/services/accountService";
import { requireAccount } from "@/utils/accountContext";
import { getDataDirectory } from "@/utils/conf";
import { lockWorkspaceFiles, resolveWorkspacePath } from "@/utils/workspace/files";
import { isSafeSegment } from "@/utils/skills/files";
import { getAssetsDirectory } from "@/utils/assets";

export const maxTeamAssetBytes = 100 * 1024 * 1024;
export const teamAssetNameSchema = z.string().trim().min(1).max(255).refine(isSafeSegment, "文件名不能包含路径、特殊字符或系统保留名称");

async function teamAssetDirectory(teamId: string) {
  const root = resolve(getDataDirectory(), "teamAssets");
  const directory = resolve(root, teamId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (await realpath(root) !== root || await realpath(directory) !== directory) throw Object.assign(new Error("团队资产目录不能使用符号链接"), { status: 403 });
  return directory;
}

export async function listTeamAssets(teamId: string) {
  const access = await requireTeamAccess(teamId);
  const assets = await getDatabase().select({ id: teamAssets.id, teamId: teamAssets.teamId, uploadedBy: teamAssets.uploadedBy, name: teamAssets.name, mimeType: teamAssets.mimeType, bytes: teamAssets.bytes, createdAt: teamAssets.createdAt }).from(teamAssets).where(eq(teamAssets.teamId, teamId)).orderBy(desc(teamAssets.createdAt));
  return { assets, canManage: access.canManage };
}

export async function readTeamAsset(id: string) {
  const [asset] = await getDatabase().select().from(teamAssets).where(eq(teamAssets.id, id)).limit(1);
  if (!asset) throw Object.assign(new Error("团队资产不存在"), { status: 404 });
  await requireTeamAccess(asset.teamId);
  const directory = await teamAssetDirectory(asset.teamId);
  const path = (await resolveWorkspacePath(directory, asset.fileName)).path;
  const info = await lstat(path);
  if (!info.isFile() || info.size !== asset.bytes) throw Object.assign(new Error("团队资产文件不存在或已变化"), { status: 409 });
  return { asset, path };
}

export async function uploadTeamAsset(teamId: string, name: string, mimeType: string, source: Buffer | { directory?: string; path: string }) {
  const account = requireAccount();
  const parsedName = teamAssetNameSchema.safeParse(name);
  if (!parsedName.success) throw Object.assign(new Error("文件名无效，请先重命名后上传"), { status: 400 });
  name = parsedName.data;
  await requireTeamAccess(teamId);
  let sourcePath: string | undefined;
  let bytes: number;
  if (Buffer.isBuffer(source)) bytes = source.byteLength;
  else {
    const root = source.directory ? await authorizeProjectDirectory(source.directory) : await getAssetsDirectory();
    sourcePath = (await resolveWorkspacePath(root, source.path)).path;
    const info = await lstat(sourcePath);
    if (!info.isFile()) throw Object.assign(new Error("只能上传普通文件"), { status: 400 });
    bytes = info.size;
  }
  if (bytes > maxTeamAssetBytes) throw Object.assign(new Error("单个团队资产不能超过 100 MB"), { status: 413 });
  const id = randomUUID();
  const directory = await teamAssetDirectory(teamId);
  const path = resolve(directory, id);
  let completed = false;
  const release = lockWorkspaceFiles([path, ...(sourcePath ? [sourcePath] : [])]);
  try {
    const result = await getDatabase().transaction(async tx => {
      const [team] = await tx.select().from(teams).where(and(eq(teams.id, teamId), eq(teams.status, "active"))).limit(1).for("update");
      const [member] = await tx.select().from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, account.userId))).limit(1);
      if (!team || (!account.isRoot && !member)) throw Object.assign(new Error("当前账户已不属于这个团队"), { status: 403 });
      if (sourcePath) await copyFile(sourcePath, path);
      else await writeFile(path, source as Buffer, { flag: "wx", mode: 0o600 });
      if ((await lstat(path)).size !== bytes) throw new Error("上传期间源文件发生变化，团队副本未保存");
      const now = new Date();
      const asset = { id, teamId, uploadedBy: account.userId, name, mimeType, bytes, fileName: id, createdAt: now, updatedAt: now };
      await tx.insert(teamAssets).values(asset);
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: teamId, action: "team.asset.upload", metadata: { assetId: id, name, bytes }, createdAt: now, updatedAt: now });
      return { id, teamId, name, mimeType, bytes };
    });
    completed = true;
    return result;
  } finally {
    try {
      if (!completed) {
        const saved = await getDatabase().select({ id: teamAssets.id }).from(teamAssets).where(eq(teamAssets.id, id)).limit(1).catch(() => undefined);
        if (saved && saved.length === 0) await unlink(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
      }
    }
    finally { release(); }
  }
}

export async function importTeamAsset(id: string, directory?: string, targetDirectory = directory ? "assets" : "") {
  const { asset, path } = await readTeamAsset(id);
  const personal = directory ? await authorizeProjectDirectory(directory) : await getAssetsDirectory();
  const target = `${targetDirectory ? targetDirectory + "/" : ""}${randomUUID()}/${asset.name}`;
  const result = await resolveWorkspacePath(personal, target, true);
  const release = lockWorkspaceFiles([result.path]);
  try {
    await mkdir(dirname(result.path), { recursive: true, mode: 0o700 });
    const verified = await resolveWorkspacePath(personal, target);
    await copyFile(path, verified.path);
    return { path: target, name: asset.name, mimeType: asset.mimeType };
  } finally { release(); }
}

export async function renameTeamAsset(id: string, name: string) {
  const { asset } = await readTeamAsset(id);
  const account = requireAccount();
  await getDatabase().transaction(async tx => {
    const [team] = await tx.select().from(teams).where(eq(teams.id, asset.teamId)).limit(1).for("update");
    if (!team || (!account.isRoot && (team.status !== "active" || team.ownerUserId !== account.userId))) throw Object.assign(new Error("只有 owner 或 root 可以管理团队资产"), { status: 403 });
    const now = new Date();
    await tx.update(teamAssets).set({ name, updatedAt: now }).where(eq(teamAssets.id, id));
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: team.id, action: "team.asset.rename", metadata: { assetId: id, name }, createdAt: now, updatedAt: now });
  });
}

export async function removeTeamAsset(id: string) {
  const { asset, path } = await readTeamAsset(id);
  const account = requireAccount();
  const temporary = `${path}.deleted${randomUUID()}`;
  const release = lockWorkspaceFiles([path]);
  let moved = false;
  let completed = false;
  try {
    await getDatabase().transaction(async tx => {
      const [team] = await tx.select().from(teams).where(eq(teams.id, asset.teamId)).limit(1).for("update");
      if (!team || (!account.isRoot && (team.status !== "active" || team.ownerUserId !== account.userId))) throw Object.assign(new Error("只有 owner 或 root 可以删除团队资产"), { status: 403 });
      await rename(path, temporary);
      moved = true;
      await tx.delete(teamAssets).where(eq(teamAssets.id, id));
      await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, workspaceId: team.id, action: "team.asset.remove", metadata: { assetId: id, name: asset.name }, createdAt: new Date(), updatedAt: new Date() });
    });
    completed = true;
  } finally {
    try { if (moved && !completed) await rename(temporary, path); }
    finally { release(); }
  }
  await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") console.error("清理已删除团队资产失败", error); });
}

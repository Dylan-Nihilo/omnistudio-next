import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { basename, extname, join, relative, sep } from "node:path";
import { getAccountConfig, getAccountDirectory } from "@/utils/conf";
import { requireAccount } from "@/utils/accountContext";
import { getPlatformProviderRuntimeConfig } from "@/services/modelService";
import { lockWorkspaceFiles, protectWorkspaceRoot, renameWorkspaceFile, resolveWorkspacePath, writeWorkspaceFile } from "@/utils/workspace/files";

type AssetRecord = { id: string; path: string; hash: string; mimeType: string };
export type SeedanceLibrary = { groupId?: string; tokenHash?: string; assets: AssetRecord[] };
export type AssetEntry = { name: string; path: string; type: "file" | "directory"; children?: AssetEntry[]; status?: string; error?: string; mimeType?: string };
const mediaFormats: Record<string, { mimeType: string; assetType: string; maxBytes: number }> = {
  jpg: { mimeType: "image/jpeg", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  jpeg: { mimeType: "image/jpeg", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  png: { mimeType: "image/png", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  webp: { mimeType: "image/webp", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  bmp: { mimeType: "image/bmp", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  tiff: { mimeType: "image/tiff", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  tif: { mimeType: "image/tiff", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  gif: { mimeType: "image/gif", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  heic: { mimeType: "image/heic", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  heif: { mimeType: "image/heif", assetType: "Image", maxBytes: 30 * 1024 * 1024 },
  mp4: { mimeType: "video/mp4", assetType: "Video", maxBytes: 200 * 1024 * 1024 },
  mov: { mimeType: "video/quicktime", assetType: "Video", maxBytes: 200 * 1024 * 1024 },
  mp3: { mimeType: "audio/mpeg", assetType: "Audio", maxBytes: 15 * 1024 * 1024 },
  wav: { mimeType: "audio/wav", assetType: "Audio", maxBytes: 15 * 1024 * 1024 },
};

function invalid(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function library() {
  return getAccountConfig().get("seedanceLibrary", { assets: [] });
}

async function credentials() {
  const config: Record<string, unknown> = await getPlatformProviderRuntimeConfig("utoooSeedance");
  const apiKey = String(config.apiKey ?? "").trim();
  const baseUrl = String(config.baseUrl ?? config.apiUrl ?? "https://ai-gateway.utooo.com").replace(/\/+$/, "");
  return { apiKey, baseUrl, tokenHash: createHash("sha256").update(apiKey).digest("hex") };
}

async function request(action: string, body: Record<string, unknown>) {
  const { apiKey, baseUrl, tokenHash } = await credentials();
  const account = requireAccount();
  if (library().tokenHash && library().tokenHash !== tokenHash) invalid("素材库绑定的 Seedance 凭据已变化，请恢复原凭据后操作", 409);
  const response = await fetch(`${baseUrl}/api/v3/asset?Action=${action}&Version=2024-01-01`, {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.any([AbortSignal.timeout(30000), ...(account.signal ? [account.signal] : [])]),
  });
  const data = await response.json() as { ResponseMetadata?: { Error?: { Code?: string; Message?: string } }; Result?: Record<string, unknown> };
  if (!response.ok || data.ResponseMetadata?.Error) {
    const failure = data.ResponseMetadata?.Error;
    invalid(`Seedance 素材接口失败：${failure?.Code ?? response.status} ${failure?.Message ?? "请稍后重试"}`.replaceAll(apiKey, "[隐藏]"), response.status >= 400 && response.status < 500 ? response.status : 502);
  }
  if (!data.Result || typeof data.Result !== "object" || Array.isArray(data.Result)) invalid("Seedance 素材接口响应无效", 502);
  return data.Result;
}

export async function getAssetsDirectory(userId = requireAccount().userId) {
  // ACT: 此目录只保存官方素材上传源和画布导入缓存；旧 assets 目录不再参与素材库操作。
  const directory = join(getAccountDirectory(userId), "seedanceAssets");
  await mkdir(directory, { recursive: true });
  return realpath(directory);
}

async function assetPath(path: string) {
  const root = await getAssetsDirectory();
  const result = await resolveWorkspacePath(root, path);
  protectWorkspaceRoot(root, result.path);
  return { ...result, relativePath: relative(root, result.path).split(sep).join("/") };
}

function assetFailure(asset: Record<string, unknown>) {
  const failure = asset.Error as { Code?: string; Message?: string } | undefined;
  return [failure?.Code, failure?.Message].filter(Boolean).join("：") || "素材审核未通过";
}

export async function getAsset(path: string) {
  const { relativePath } = await assetPath(path);
  const store = library();
  const record = store.assets.find(item => item.path === relativePath);
  if (!record || !store.groupId) invalid("该素材未登记到字节素材库", 404);
  const asset = await request("GetAsset", { Id: record.id });
  if (asset.Id !== record.id || asset.GroupId !== store.groupId) invalid("素材不属于当前账户", 403);
  if (asset.Status !== "Active") invalid(asset.Status === "Failed" ? assetFailure(asset) : "素材正在入库处理，请等待审核完成", 409);
  return record;
}

export async function listAssets(): Promise<AssetEntry[]> {
  const root = await getAssetsDirectory();
  const store = library();
  const remote = new Map<string, Record<string, unknown>>();
  if (store.groupId) {
    let nextToken: string | undefined;
    do {
      const result = await request("ListAssets", { Filter: { GroupType: "AIGC", GroupIds: [store.groupId] }, MaxResults: 100, ...(nextToken ? { NextToken: nextToken } : {}) });
      if (!Array.isArray(result.Items)) invalid("Seedance 素材列表响应无效", 502);
      for (const item of result.Items as Record<string, unknown>[]) if (item.GroupId === store.groupId && typeof item.Id === "string") remote.set(item.Id, item);
      nextToken = typeof result.NextToken === "string" && result.NextToken ? result.NextToken : undefined;
    } while (nextToken);
  } else {
    // 尚未入库时也验证网关连接，不静默回退到旧文件素材库。
    await request("ListAssetGroups", { Filter: { GroupType: "AIGC", Name: `omnistudio${requireAccount().userId}` }, MaxResults: 1 });
  }
  async function entries(directory: string): Promise<AssetEntry[]> {
    const files = await readdir(directory, { withFileTypes: true });
    const items = await Promise.all(files.filter(file => file.isDirectory() || file.isFile()).map(async file => {
      const fullPath = join(directory, file.name);
      const path = relative(root, fullPath).split(sep).join("/");
      if (file.isDirectory()) return { name: file.name, path, type: "directory" as const, children: await entries(fullPath) };
      const record = store.assets.find(item => item.path === path);
      if (!record) return undefined;
      const asset = remote.get(record.id);
      return { name: file.name, path, type: "file" as const, mimeType: record.mimeType, status: String(asset?.Status ?? "Failed"),
        ...(asset?.Status === "Failed" ? { error: assetFailure(asset) } : !asset ? { error: "远端素材不存在" } : {}) };
    }));
    return items.filter((item): item is NonNullable<typeof item> => !!item).sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
  }
  return entries(root);
}

export async function createDirectory(path: string) {
  const target = await assetPath(path);
  const release = lockWorkspaceFiles([target.directory]);
  try { await mkdir(target.path); }
  finally { release(); }
}

function sourceSignature(userId: string, path: string, hash: string, expires: string, secret: string) {
  return createHmac("sha256", secret).update(JSON.stringify([userId, path, hash, expires])).digest("hex");
}

async function sourceUrl(path: string, hash: string, origin?: string) {
  let base: URL;
  try { base = new URL(process.env.OMNISTUDIO_NEXT_PUBLIC_URL || origin || ""); }
  catch { return invalid("字节入库需要公网素材地址，请配置 OMNISTUDIO_NEXT_PUBLIC_URL", 503); }
  if (!/^https?:$/.test(base.protocol) || base.username || base.password || /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i.test(base.hostname)) invalid("当前本地地址无法由字节访问，入库需要指向本服务的公网地址", 503);
  const { apiKey } = await credentials();
  if (!apiKey) invalid("素材源地址暂不可用", 503);
  const userId = requireAccount().userId;
  const expires = String(Date.now() + 24 * 60 * 60 * 1000);
  const url = new URL("/api/assets/source", base);
  url.search = new URLSearchParams({ userId, path, hash, expires, signature: await sourceSignature(userId, path, hash, expires, apiKey) }).toString();
  return url.href;
}

export async function readSource(userId: string, path: string, hash: string, expires: string, signature: string) {
  const deadline = Number(expires);
  if (!Number.isSafeInteger(deadline) || deadline <= Date.now() || deadline > Date.now() + 24 * 60 * 60 * 1000) invalid("素材源地址已失效", 403);
  const { apiKey } = await credentials();
  if (!apiKey) invalid("素材源地址暂不可用", 503);
  const expected = await sourceSignature(userId, path, hash, expires, apiKey);
  if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) invalid("素材源地址签名无效", 403);
  const root = await getAssetsDirectory(userId);
  const result = await resolveWorkspacePath(root, path);
  protectWorkspaceRoot(root, result.path);
  if (!(await lstat(result.path)).isFile()) invalid("只能读取素材文件");
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(result.path)) digest.update(chunk);
  if (digest.digest("hex") !== hash) invalid("素材源文件已变化，原签名地址已失效", 403);
  return result.path;
}

export async function saveAsset(path: string, content: Uint8Array, origin?: string) {
  const target = await assetPath(path);
  const name = basename(target.path);
  if (name.length > 64) invalid("字节素材名称不能超过 64 个字符");
  const format = mediaFormats[extname(name).slice(1).toLowerCase()];
  if (!format) invalid("字节素材库仅支持 JPEG、PNG、WebP、BMP、TIFF、GIF、HEIC、HEIF 图片，MP4/MOV 视频和 MP3/WAV 音频");
  if (!content.byteLength || content.byteLength > format.maxBytes || (format.assetType === "Image" && content.byteLength === format.maxBytes)) invalid(`素材不能为空，大小须${format.assetType === "Image" ? "小于" : "不超过"} ${format.maxBytes / 1024 / 1024} MB`);
  const hash = createHash("sha256").update(content).digest("hex");
  const url = await sourceUrl(target.relativePath, hash, origin);
  const release = lockWorkspaceFiles([target.directory]);
  let written = false;
  let assetId: string | undefined;
  try {
    await writeWorkspaceFile(target.path, content, true);
    written = true;
    const config = getAccountConfig();
    let store = library();
    if (!store.groupId) {
      const result = await request("CreateAssetGroup", { Name: `omnistudio${requireAccount().userId}`, GroupType: "AIGC" });
      if (typeof result.Id !== "string" || !result.Id) invalid("字节未返回素材组 ID", 502);
      store = { ...store, groupId: result.Id, tokenHash: (await credentials()).tokenHash };
      config.set("seedanceLibrary", store);
    }
    const result = await request("CreateAsset", { GroupId: store.groupId, URL: url, AssetType: format.assetType, Name: name });
    if (typeof result.Id !== "string" || !result.Id) invalid("字节未返回素材 ID", 502);
    assetId = result.Id;
    const asset = { id: assetId, path: target.relativePath, hash, mimeType: format.mimeType };
    config.set("seedanceLibrary", { ...store, assets: [...store.assets, asset] });
    return { path: asset.path, name, mimeType: asset.mimeType, status: "Processing" };
  } catch (error) {
    if (assetId) await request("DeleteAsset", { Id: assetId });
    if (written) await unlink(target.path);
    throw error;
  } finally { release(); }
}

export async function renameAsset(path: string, target: string) {
  const source = await assetPath(path);
  const destination = await assetPath(target);
  const release = lockWorkspaceFiles([source.directory]);
  try {
    const store = library();
    const record = store.assets.find(item => item.path === source.relativePath);
    if (record && basename(destination.path).length > 64) invalid("字节素材名称不能超过 64 个字符");
    if (record && extname(source.path).toLowerCase() !== extname(destination.path).toLowerCase()) invalid("重命名素材不能改变媒体扩展名");
    // 入库期间源 URL 仍指向原路径，不能移动后让网关拉取失败。
    for (const asset of store.assets.filter(item => item.path === source.relativePath || item.path.startsWith(source.relativePath + "/"))) await getAsset(asset.path);
    if (record) await request("UpdateAsset", { Id: record.id, Name: basename(destination.path) });
    let moved = false;
    try {
      await renameWorkspaceFile(source.path, destination.path);
      moved = true;
      getAccountConfig().set("seedanceLibrary", { ...store, assets: store.assets.map(item => item.path === source.relativePath || item.path.startsWith(source.relativePath + "/")
        ? { ...item, path: destination.relativePath + item.path.slice(source.relativePath.length) } : item) });
    } catch (error) {
      if (moved) await renameWorkspaceFile(destination.path, source.path);
      if (record) await request("UpdateAsset", { Id: record.id, Name: basename(source.path) });
      throw error;
    }
  } finally { release(); }
}

export async function removeAsset(path: string) {
  const target = await assetPath(path);
  const release = lockWorkspaceFiles([target.directory]);
  try {
    if ((await lstat(target.path)).isDirectory()) return await rmdir(target.path);
    const store = library();
    const record = store.assets.find(item => item.path === target.relativePath);
    if (!record) invalid("该素材未登记到字节素材库", 404);
    await request("DeleteAsset", { Id: record.id });
    getAccountConfig().set("seedanceLibrary", { ...store, assets: store.assets.filter(item => item.id !== record.id) });
    await unlink(target.path);
  } finally { release(); }
}

export async function referenceForBytes(bytes: Uint8Array, mimeType: string) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const record = library().assets.find(item => item.hash === hash && item.mimeType.split("/")[0] === mimeType.split("/")[0]);
  if (!record) return;
  await getAsset(record.path);
  return { type: "url" as const, url: `asset://${record.id}`, mimeType };
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const serverConfigKeys = ["DATABASE_URL", "MYSQL_CONNECTION_LIMIT", "MYSQL_CONNECT_TIMEOUT_MS"] as const;
const serverConfigTemplate = "# 桌面服务数据库配置；不要分享此文件。\n# 先创建独立 MySQL 8.0+ 数据库，再填写完整 mysql:// 连接地址。\nDATABASE_URL=\nMYSQL_CONNECTION_LIMIT=10\nMYSQL_CONNECT_TIMEOUT_MS=10000\n";

export class DesktopServerConfigError extends Error {}

export async function loadDesktopServerConfig(dataDirectory: string): Promise<string> {
  const configPath = resolve(dataDirectory, "server.env");
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  let content: string;
  try { content = await readFile(configPath, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try { await writeFile(configPath, serverConfigTemplate, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    content = await readFile(configPath, "utf8");
  }
  let values: Record<string, string | undefined>;
  try { values = parseEnv(content); }
  catch { throw new DesktopServerConfigError("server.env 格式无效，请按文件中的说明填写。"); }
  if (Object.keys(values).some(key => !serverConfigKeys.includes(key as typeof serverConfigKeys[number]))) {
    throw new DesktopServerConfigError("server.env 只支持 DATABASE_URL、MYSQL_CONNECTION_LIMIT 和 MYSQL_CONNECT_TIMEOUT_MS。");
  }
  const selected = Object.fromEntries(serverConfigKeys.map(key => [key, process.env[key] ?? values[key]]));
  const databaseUrl = selected.DATABASE_URL?.trim();
  if (!databaseUrl) throw new DesktopServerConfigError("数据库连接尚未配置，请填写 server.env 中的 DATABASE_URL。");
  let url: URL;
  try { url = new URL(databaseUrl); }
  catch { throw new DesktopServerConfigError("DATABASE_URL 格式无效，需要 mysql:// 连接地址。"); }
  if (url.protocol !== "mysql:" || !url.hostname || !url.pathname.slice(1)) {
    throw new DesktopServerConfigError("DATABASE_URL 必须包含 MySQL 主机和独立数据库名。");
  }
  for (const [key, maximum] of [["MYSQL_CONNECTION_LIMIT", 100], ["MYSQL_CONNECT_TIMEOUT_MS", 600000]] as const) {
    const value = selected[key];
    if (value !== undefined && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > maximum)) {
      throw new DesktopServerConfigError(`${key} 必须为 1 至 ${maximum} 的整数。`);
    }
  }
  for (const key of serverConfigKeys) {
    if (process.env[key] === undefined && selected[key] !== undefined) process.env[key] = selected[key];
  }
  return configPath;
}

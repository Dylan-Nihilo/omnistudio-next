import { createHash, randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createPool, type Pool, type PoolConnection } from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import schema from "@/db/schema";

export type Database = MySql2Database<typeof schema>;

let pool: Pool | undefined;
let database: Database | undefined;
let serverLease: PoolConnection | undefined;
let leaseHealthy = false;
let leaseHeartbeat: ReturnType<typeof setInterval> | undefined;
const serverController = new AbortController();
export const serverInstanceId = randomUUID();
export const serverSignal = serverController.signal;

export async function acquireServerLease() {
  if (serverLease) return;
  const connection = await getPool().getConnection();
  const name = `omnistudio_server_${hashSecret(new URL(requireDatabaseUrl()).pathname).slice(0, 32)}`;
  const [rows] = await connection.query("SELECT GET_LOCK(?, 0) AS acquired", [name]);
  if (!Array.isArray(rows) || (rows[0] as { acquired?: number })?.acquired !== 1) {
    connection.release();
    throw new Error("该数据库已有运行中的服务，请先停止旧实例，不能并行写入同一数据目录");
  }
  serverLease = connection;
  leaseHealthy = true;
  const lost = () => { leaseHealthy = false; clearInterval(leaseHeartbeat); serverController.abort(new Error("数据库连接已中断，当前任务已取消")); };
  connection.once("error", lost);
  connection.once("end", lost);
  leaseHeartbeat = setInterval(() => { void connection.ping().catch(lost); }, 60000);
  leaseHeartbeat.unref();
}

export function hasServerLease() { return leaseHealthy; }

export function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL 未配置，认证和积分服务必须连接 MySQL 8.0+");
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("DATABASE_URL 不是有效的 MySQL URL"); }
  if (parsed.protocol !== "mysql:") throw new Error("DATABASE_URL 必须使用 mysql://，不支持 SQLite 或其他数据库");
  if (!parsed.hostname || !parsed.pathname.slice(1)) throw new Error("DATABASE_URL 必须包含 MySQL 主机和数据库名");
  return value;
}

export function getPool() {
  if (pool) return pool;
  const url = new URL(requireDatabaseUrl());
  pool = createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.slice(1)),
    charset: "utf8mb4",
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    connectTimeout: Number(process.env.MYSQL_CONNECT_TIMEOUT_MS || 10000),
    enableKeepAlive: true,
  });
  return pool;
}

export function getDatabase() {
  return database ??= drizzle(getPool(), { schema, mode: "default" });
}

export async function checkDatabase() {
  const connection = await getPool().getConnection();
  try {
    await connection.query("SELECT 1");
  } finally {
    connection.release();
  }
}

export async function closeDatabase() {
  if (!pool) return;
  clearInterval(leaseHeartbeat);
  serverLease?.destroy();
  serverLease = undefined;
  leaseHealthy = false;
  await pool.end();
  pool = undefined;
  database = undefined;
}

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function runSqlMigrations() {
  const databasePool = getPool();
  const connection = await databasePool.getConnection();
  try {
    const [locks] = await connection.query("SELECT GET_LOCK('omnistudio_schema_migration', 30) AS acquired");
    if (!Array.isArray(locks) || (locks[0] as { acquired?: number })?.acquired !== 1) throw new Error("另一进程正在迁移数据库，请稍后重试");
    // 使用平台专用迁移表，避免与旧版 omnistudio-next 的 schema_migrations 结构相互覆盖。
    await connection.query(`CREATE TABLE IF NOT EXISTS omnistudio_schema_migrations (
      id VARCHAR(180) NOT NULL PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const migrationsDirectory = resolve(import.meta.dirname, "migrations");
    const files = (await readdir(migrationsDirectory)).filter(file => /^[a-z][a-zA-Z0-9]*\.sql$/.test(file)).sort();
    for (const file of files) {
      const id = file.slice(0, -4);
      const sql = await readFile(resolve(migrationsDirectory, file), "utf8");
      const checksum = hashSecret(sql);
      const [rows] = await connection.query("SELECT checksum FROM omnistudio_schema_migrations WHERE id = ?", [id]);
      const applied = Array.isArray(rows) && rows[0] as { checksum?: string } | undefined;
      if (applied) {
        if (applied.checksum !== checksum) throw new Error(`数据库迁移 ${id} 已被修改，请创建新的 migration 文件`);
        continue;
      }
      if (id === "userIdentity") {
        const [wallets] = await connection.query("SELECT id FROM wallets WHERE balance <> 0 OR frozen <> 0 LIMIT 1");
        const [jobs] = await connection.query("SELECT id FROM generation_jobs WHERE status IN ('reserved', 'running') LIMIT 1");
        if ((Array.isArray(wallets) && wallets.length) || (Array.isArray(jobs) && jobs.length)) {
          throw new Error("旧版团队钱包仍有积分或运行任务，请先明确余额归属并结束任务后再迁移；原钱包和流水保持原样");
        }
      }
      if (id === "initial") {
        const [databaseRows] = await connection.query("SELECT DATABASE() AS name");
        const databaseName = Array.isArray(databaseRows) ? (databaseRows[0] as { name?: string } | undefined)?.name : undefined;
        if (!databaseName) throw new Error("无法确认当前 MySQL 数据库");
        for (const [table, column] of [["users", "password_hash"], ["workspaces", "created_by"], ["wallets", "frozen"], ["generation_jobs", "idempotency_key"]] as const) {
          const [columns] = await connection.query(
            "SELECT 1 AS present FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1",
            [databaseName, table, column],
          );
          if (Array.isArray(columns) && columns.length === 0) {
            const [tables] = await connection.query("SELECT 1 AS present FROM information_schema.tables WHERE table_schema = ? AND table_name = ? LIMIT 1", [databaseName, table]);
            if (Array.isArray(tables) && tables.length > 0) throw new Error(`数据库表 ${table} 已存在但不是 omnistudio-next 新版结构，请使用独立数据库或先完成备份后重命名`);
          }
        }
      }
      // MySQL DDL commits implicitly; every migration is restartable and checksum-recorded only after all statements succeed.
      for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(item => item.trim()).filter(Boolean)) await connection.query(statement);
      await connection.query("INSERT INTO omnistudio_schema_migrations (id, checksum, applied_at) VALUES (?, ?, UTC_TIMESTAMP())", [id, checksum]);
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK('omnistudio_schema_migration')").catch(() => {});
    connection.release();
  }
}

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
      const migrateAccountData = id === "userIdentityData";
      if (migrateAccountData) await connection.beginTransaction();
      try {
        if (migrateAccountData) await validateLegacyAccounts(connection);
        // MySQL DDL 隐式提交；账户数据迁移仅含 DML，与迁移记录一起提交，失败时不会重复入账。
        for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map(item => item.trim()).filter(Boolean)) await connection.query(statement);
        await connection.query("INSERT INTO omnistudio_schema_migrations (id, checksum, applied_at) VALUES (?, ?, UTC_TIMESTAMP())", [id, checksum]);
        if (migrateAccountData) await connection.commit();
      } catch (error) {
        if (migrateAccountData) await connection.rollback();
        throw error;
      }
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK('omnistudio_schema_migration')").catch(() => {});
    connection.release();
  }
}

async function validateLegacyAccounts(connection: PoolConnection) {
  const checks = [
    ["旧工作区无法确定积分归属用户", `SELECT w.id FROM workspaces w
      LEFT JOIN users u ON u.id = w.created_by WHERE u.id IS NULL LIMIT 1`],
    ["旧工作区所有者与创建者不一致，无法自动归属积分", `SELECT m.id FROM workspace_memberships m
      INNER JOIN workspaces w ON w.id = m.workspace_id
      WHERE m.role = 'owner' AND m.user_id <> w.created_by LIMIT 1`],
    ["旧钱包缺少工作区", `SELECT a.id FROM wallets a
      LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE w.id IS NULL LIMIT 1`],
    ["合并后的积分超出安全范围", `SELECT w.created_by FROM wallets a
      INNER JOIN workspaces w ON w.id = a.workspace_id
      INNER JOIN user_wallets n ON n.user_id = w.created_by
      GROUP BY w.created_by, n.balance, n.frozen
      HAVING SUM(a.balance) + n.balance > 9007199254740991
        OR SUM(a.frozen) + n.frozen > SUM(a.balance) + n.balance LIMIT 1`],
    ["旧流水与钱包归属不一致", `SELECT l.id FROM credit_ledger l
      LEFT JOIN wallets a ON a.id = l.wallet_id AND a.workspace_id = l.workspace_id
      WHERE a.id IS NULL LIMIT 1`],
    ["旧任务缺少用户或钱包", `SELECT g.id FROM generation_jobs g
      LEFT JOIN users u ON u.id = g.user_id
      LEFT JOIN wallets a ON a.workspace_id = g.workspace_id
      WHERE u.id IS NULL OR a.id IS NULL LIMIT 1`],
    ["旧冻结积分与未完成任务不一致", `SELECT a.id FROM wallets a
      LEFT JOIN generation_jobs g ON g.workspace_id = a.workspace_id AND g.status IN ('reserved', 'running')
      GROUP BY a.id, a.frozen HAVING a.frozen <> COALESCE(SUM(g.quoted_credits), 0) LIMIT 1`],
    ["旧任务无法确定供应商", `SELECT g.id FROM generation_jobs g
      WHERE JSON_TYPE(g.request_snapshot) <> 'OBJECT' OR
        COALESCE(NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(g.request_snapshot, '$.providerId')), 'null'), ''),
          (SELECT IF(COUNT(*) = 1, MIN(m.provider_id), NULL) FROM platform_models m
            WHERE m.model_id = g.model_id AND m.media_type = g.media_type)) IS NULL LIMIT 1`],
    ["旧价格缺少版本或对应平台模型", `SELECT p.id FROM pricing_items p
      LEFT JOIN price_book_versions v ON v.id = p.price_book_version_id
      WHERE v.id IS NULL OR NOT EXISTS (SELECT 1 FROM platform_models m
        WHERE m.model_id = p.model_id AND m.media_type = p.media_type) LIMIT 1`],
    ["旧活动价格簿不唯一或已丢失", `SELECT s.id FROM pricing_settings s
      LEFT JOIN price_book_versions v ON v.id = s.active_price_book_version_id
      WHERE s.active_price_book_version_id IS NOT NULL AND (v.id IS NULL OR
        (SELECT COUNT(DISTINCT active_price_book_version_id) FROM pricing_settings) > 1) LIMIT 1`],
    ["旧邀请令牌长度不兼容", "SELECT id FROM invitations WHERE CHAR_LENGTH(token_hash) > 64 LIMIT 1"],
  ] as const;
  for (const [message, sql] of checks) {
    const [rows] = await connection.query(sql);
    if (Array.isArray(rows) && rows.length) throw new Error(`${message}，迁移已停止，旧数据保持原样`);
  }
}

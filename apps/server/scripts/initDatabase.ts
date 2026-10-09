import { acquireServerLease, checkDatabase, closeDatabase, runSqlMigrations } from "@/db/database";

try {
  await acquireServerLease();
  await runSqlMigrations();
  await checkDatabase();
  console.log("MySQL 数据库迁移完成，连接健康检查通过。");
} finally {
  await closeDatabase();
}

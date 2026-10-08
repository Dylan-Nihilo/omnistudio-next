import { checkDatabase, closeDatabase, runSqlMigrations } from "@/db/database";

await runSqlMigrations();
await checkDatabase();
console.log("MySQL 数据库迁移完成，连接健康检查通过。");
await closeDatabase();

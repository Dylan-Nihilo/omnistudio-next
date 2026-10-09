import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/database";
import { platformSecrets } from "@/db/schema";
import { platformConfig } from "@/utils/conf";
import { requireRootAccount } from "@/utils/accountContext";

function encryptionKey(create = false) {
  const file = resolve(dirname(platformConfig.path), "platformSecret.key");
  if (create) {
    try { writeFileSync(file, randomBytes(32), { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
  }
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) throw new Error("平台凭据加密文件权限无效");
  const key = readFileSync(file);
  if (key.length !== 32) throw new Error("平台凭据加密文件无效");
  return key;
}

export async function readPlatformSecret(providerId: string) {
  const [value] = await getDatabase().select().from(platformSecrets).where(eq(platformSecrets.id, providerId)).limit(1);
  if (!value) return undefined;
  try {
    const [version, nonce, tag, encrypted] = value.ciphertext.split(":");
    if (version !== "v1" || !nonce || !tag || encrypted === undefined) throw new Error("Invalid ciphertext");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(nonce, "hex"));
    decipher.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "hex")), decipher.final()]).toString("utf8");
  } catch { throw Object.assign(new Error("平台 API 凭据无法读取，请由 root 重新配置"), { status: 503 }); }
}

export function encryptPlatformSecret(value: string) {
  requireRootAccount();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(true), nonce);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const ciphertext = `v1:${nonce.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
  return ciphertext;
}

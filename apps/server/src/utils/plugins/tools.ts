import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as zod from "zod";
import { toolMetadataSchema, toolNameSchema, type ToolMetadata, type ToolPlugin } from "@omnistudio-next/tools-scaffold/runtime";
import conf from "@/utils/conf";
import { platformConfig } from "@/utils/conf";
import { getDatabase, hashSecret } from "@/db/database";
import { auditEvents, platformSecrets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptPlatformSecret, readPlatformSecret } from "@/utils/platformSecrets";
import { requireRootAccount } from "@/utils/accountContext";

export { toolNameSchema } from "@omnistudio-next/tools-scaffold/runtime";

const { z } = zod;

// ACT: 工具复用宿主 Zod 4；虚拟模块不依赖安装目录中的 node_modules。
Bun.plugin({
  name: "toolHost",
  setup(build) {
    build.module("toonflow:tool-zod", () => ({ exports: zod, loader: "object" }));
  },
});

export const toolsDirectory = resolve(dirname(conf.path), "tools");

export function parseTool(source: string, name: string) {
  let metadata: zod.infer<typeof toolMetadataSchema>;
  try {
    const header = source.match(/^\/\*! toonflowTool:([^\r\n]*) \*\/(?:\r?\n|$)/)?.[1];
    metadata = toolMetadataSchema.parse(JSON.parse(header ?? ""));
    if (metadata.author === "Toonflow") metadata.author = "omnistudio-next";
    if (metadata.name !== name) throw new Error("name");
  } catch {
    throw Object.assign(new Error("工具元数据无效，或文件名与工具名称不一致"), { status: 400 });
  }
  const client = parseToolClient(source);
  if (metadata.components.length && !client) throw Object.assign(new Error("工具声明了组件但缺少客户端界面"), { status: 400 });
  return { metadata, client };
}

function parseToolClient(source: string) {
  const line = source.split(/\r?\n/, 2)[1];
  if (!line?.startsWith("/*! toonflowToolClient:")) return;
  try {
    const data = line.match(/^\/\*! toonflowToolClient:([^\r\n]*) \*\/$/)?.[1];
    const client = z.strictObject({ code: z.string().min(1).refine(code => !!code.trim()), css: z.string() }).parse(JSON.parse(data ?? ""));
    new Bun.Transpiler({ loader: "js" }).scan(client.code);
    return client;
  } catch {
    throw Object.assign(new Error("工具客户端界面格式或脚本语法无效"), { status: 400 });
  }
}

export async function readTool(name: string, directory = toolsDirectory) {
  toolNameSchema.parse(name);
  const path = resolve(directory, `${name}.tool.js`);
  const file = await lstat(path);
  if (!file.isFile()) throw Object.assign(new Error("工具文件无效"), { status: 400 });
  if (file.size > 20 * 1024 * 1024) throw Object.assign(new Error("工具文件不能超过 20 MB"), { status: 400 });
  const source = await readFile(path, "utf8");
  return { path, source, revision: createHash("sha256").update(source).digest("hex"), ...parseTool(source, name) };
}

function configSecretId(name: string) { return `tool:${hashSecret(name)}`; }

function secretFields(metadata: ToolMetadata) {
  return metadata.configRules.filter(rule => typeof rule.field === "string" && (rule.props?.type === "password" || /(?:api.?key|token|password|secret|authorization)$/i.test(rule.field))).map(rule => String(rule.field));
}

export function publicToolConfig(metadata: ToolMetadata, config: Record<string, unknown>) {
  const fields = new Set(secretFields(metadata));
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, fields.has(key) && value ? "[REDACTED]" : value]));
}

export async function getToolConfig(metadata: ToolMetadata): Promise<Record<string, unknown>> {
  const defaults = Object.fromEntries(metadata.configRules
    .filter(rule => typeof rule.field === "string" && rule.value !== undefined)
    .map(rule => [rule.field, rule.value]));
  const encrypted = await readPlatformSecret(configSecretId(metadata.name));
  const legacy = platformConfig.get("toolConfigs", {});
  const saved = encrypted ? JSON.parse(encrypted) as Record<string, unknown> : Object.hasOwn(legacy, metadata.name) ? legacy[metadata.name] : {};
  return { ...defaults, ...saved };
}

export async function saveToolConfig(name: string, config: Record<string, unknown>) {
  const account = requireRootAccount();
  const { metadata, plugin } = await loadTool(name);
  const previous = await getToolConfig(metadata);
  const fields = new Set(secretFields(metadata));
  const input = { ...config };
  for (const field of fields) if (input[field] === "[REDACTED]" || input[field] === undefined) input[field] = previous[field];
  if (Object.entries(input).some(([key, value]) => value === "[REDACTED]" && !fields.has(key))) throw Object.assign(new Error("不能保存脱敏占位符"), { status: 400 });
  const parsed = validateToolConfig(plugin, input);
  const ciphertext = encryptPlatformSecret(JSON.stringify(parsed));
  const now = new Date();
  await getDatabase().transaction(async tx => {
    await tx.insert(platformSecrets).values({ id: configSecretId(name), ciphertext, createdAt: now, updatedAt: now }).onDuplicateKeyUpdate({ set: { ciphertext, updatedAt: now } });
    await tx.insert(auditEvents).values({ id: randomUUID(), actorUserId: account.userId, action: "platform.tool.configure", metadata: { name }, createdAt: now, updatedAt: now });
  });
  const legacy = platformConfig.get("toolConfigs", {});
  if (Object.hasOwn(legacy, name)) { delete legacy[name]; platformConfig.set("toolConfigs", legacy); }
  return publicToolConfig(metadata, parsed);
}

export async function removeToolConfig(name: string) {
  requireRootAccount();
  await getDatabase().delete(platformSecrets).where(eq(platformSecrets.id, configSecretId(name)));
  const legacy = platformConfig.get("toolConfigs", {});
  delete legacy[name];
  platformConfig.set("toolConfigs", legacy);
}

export async function listTools() {
  const files = await readdir(toolsDirectory, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return [];
    throw err;
  });
  return Promise.all(files.filter(file => file.isFile() && /^[a-z][a-zA-Z0-9]*\.tool\.js$/.test(file.name))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async file => {
      const name = file.name.slice(0, -8);
      const enabled = !files.some(entry => entry.name === `${name}.disabled`);
      try {
        const { metadata, revision } = await readTool(name);
        return { ...metadata, enabled, config: await getToolConfig(metadata), revision, loadError: "" };
      } catch (err) {
        const loadError = err instanceof Error ? err.message : "工具文件无法读取";
        return { name, version: "", displayName: name, description: loadError, author: "", github: "", components: [], configRules: [], enabled, config: {}, revision: "", loadError };
      }
    }));
}

export async function loadTool(name: string, directory = toolsDirectory) {
  const { path, metadata } = await readTool(name, directory);
  // ACT: 工具是可信的服务端代码，不是沙箱；安装成功后由安装器清除模块缓存。
  const { default: plugin } = await import(pathToFileURL(path).href) as { default: ToolPlugin };
  if (typeof plugin?.createTools !== "function" || typeof plugin.validateConfig !== "function") {
    throw Object.assign(new Error(`${metadata.displayName} 未导出有效的工具插件`), { status: 400 });
  }
  return { plugin, metadata };
}

export function validateToolConfig(plugin: ToolPlugin, config: Record<string, unknown>) {
  try {
    return plugin.validateConfig(config);
  } catch (err) {
    throw Object.assign(new Error(err instanceof Error ? err.message : "工具配置无效"), { status: 400 });
  }
}

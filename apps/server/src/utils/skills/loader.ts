import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { loadSkills, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import type { ResourceDiagnostic, Skill } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { isWithin } from "@/utils/workspace/files";

const manifestSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-zA-Z0-9]*(?:-[a-zA-Z0-9]+)*$/).refine(value => value === value.trim()),
  description: z.string().max(1024).refine(value => Boolean(value.trim())),
  "disable-model-invocation": z.boolean().optional(),
}).passthrough();

export function parseSkillManifest(content: string) {
  if (content.includes("\u0000")) throw new Error("技能主文件不能包含空字符");
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!/^---\n[\s\S]*?\n---(?:\n|$)/.test(normalized)) throw new Error("SKILL.md 缺少完整的 YAML 前言");
  let frontmatter: Record<string, unknown>;
  try { ({ frontmatter } = parseFrontmatter(normalized)); }
  catch { throw new Error("SKILL.md 的 YAML 前言无效"); }
  const parsed = manifestSchema.safeParse(frontmatter);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map(issue => String(issue.path[0] ?? "YAML 前言")))];
    throw new Error(`SKILL.md 字段无效：${fields.join("、")}；name 应为小驼峰或短横线名称，description 应为 1–1024 字符`);
  }
  return parsed.data;
}

export function getSkillVersion(frontmatter: Record<string, unknown>) {
  const metadata = frontmatter.metadata;
  const version = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>).version : undefined;
  return typeof version === "string" ? version.trim() : typeof frontmatter.version === "string" ? frontmatter.version.trim() : "";
}

export type LoadedSkill = Skill & { frontmatter: ReturnType<typeof parseSkillManifest>; warnings: string[] };

export function loadSkillDirectory(directory: string) {
  // shortcut: synchronous discovery is bounded to 2000 entries and 20 MB of manifests; use an async index for larger catalogs.
  const skills: LoadedSkill[] = [];
  const diagnostics: ResourceDiagnostic[] = [];
  const root = resolve(directory);
  const names = new Map<string, LoadedSkill>();
  let entries = 0;
  let bytes = 0;
  const diagnose = (path: string, message: string, type: "error" | "warning" = "error") => {
    diagnostics.push({ type, path, message });
  };
  if (!existsSync(root)) return { skills, diagnostics };

  function load(path: string) {
    try {
      const info = lstatSync(path);
      if (!info.isFile()) throw new Error("技能主文件必须为普通文件，不能使用符号链接");
      bytes += info.size;
      if (bytes > 20 * 1024 * 1024) throw new Error("技能主文件总大小超过 20 MB，请减少加载的技能");
      const content = readFileSync(path, "utf8");
      if (basename(path) !== "SKILL.md" && !content.replace(/^\uFEFF/, "").startsWith("---")) return;
      const frontmatter = parseSkillManifest(content);
      const result = loadSkills({ cwd: root, agentDir: root, includeDefaults: false, skillPaths: [path] });
      const skill = result.skills[0];
      if (!skill) throw new Error("技能主文件无法加载");
      const existing = names.get(skill.name.toLowerCase());
      if (existing) {
        diagnose(path, `技能“${skill.name}”重名，已使用 ${relative(root, existing.filePath)}`);
        return;
      }
      const warnings: string[] = [];
      const warn = (message: string) => { if (!warnings.includes(message)) { warnings.push(message); diagnose(path, message, "warning"); } };
      const metadata = frontmatter.metadata;
      if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
        const record = metadata as Record<string, unknown>;
        const openclaw = record.openclaw;
        const requires = record.requires ?? (openclaw && typeof openclaw === "object" ? (openclaw as Record<string, unknown>).requires : undefined);
        if (requires && typeof requires === "object" && !Array.isArray(requires)) {
          const dependencies = requires as Record<string, unknown>;
          for (const bin of Array.isArray(dependencies.bins) ? dependencies.bins.slice(0, 100) : []) {
            if (typeof bin === "string" && bin.length <= 128 && !Bun.which(bin)) warn(`缺少依赖程序：${bin}；相关执行能力尚未就绪`);
          }
          for (const variable of Array.isArray(dependencies.env) ? dependencies.env.slice(0, 100) : []) {
            if (typeof variable === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/.test(variable) && !process.env[variable]) warn(`缺少环境变量：${variable}`);
          }
        }
      }
      const references = new Set<string>();
      for (const match of content.matchAll(/\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)) {
        const link = (match[1] ?? match[2] ?? "").split("#", 1)[0]!;
        if (/^(?:\.\/)?(?:references|scripts|assets|templates|examples)\//.test(link)) references.add(link);
      }
      for (const link of references) {
        try {
          const target = resolve(dirname(path), decodeURIComponent(link));
          if (!isWithin(dirname(path), target)) throw new Error();
          let current = dirname(path);
          for (const part of relative(current, target).split(/[\\/]/)) {
            current = join(current, part);
            const reference = lstatSync(current);
            if (reference.isSymbolicLink() || !reference.isDirectory() && !reference.isFile()) throw new Error();
            if (current === target && reference.isFile() && reference.size === 0) warn(`附属文件为空：${link}`);
          }
        } catch { warn(`附属文件不存在或路径不可用：${link}`); }
      }
      function inspectResources(resourceDirectory: string, depth = 0) {
        if (depth > 32 || entries >= 2000) { warn("附属文件超过检查范围，请减少文件数量或目录层级"); return; }
        try {
          if (!lstatSync(resourceDirectory).isDirectory()) { warn(`附属目录不可用：${relative(dirname(path), resourceDirectory)}`); return; }
          for (const entry of readdirSync(resourceDirectory, { withFileTypes: true })) {
            if (entry.name.startsWith(".")) continue;
            if (++entries > 2000) { warn("附属文件超过检查范围，请减少文件数量"); return; }
            const target = join(resourceDirectory, entry.name);
            const info = lstatSync(target);
            const label = relative(dirname(path), target);
            if (info.isSymbolicLink()) warn(`附属文件不能使用符号链接：${label}`);
            else if (info.isDirectory()) inspectResources(target, depth + 1);
            else if (info.isFile() && info.size === 0) warn(`附属文件为空：${label}`);
          }
        } catch { warn(`无法检查附属目录：${relative(dirname(path), resourceDirectory)}`); }
      }
      for (const name of ["references", "scripts", "templates"]) {
        const target = join(dirname(path), name);
        if (existsSync(target)) inspectResources(target);
      }
      const loaded = { ...skill, frontmatter, warnings };
      skills.push(loaded);
      names.set(skill.name.toLowerCase(), loaded);
    } catch (error) { diagnose(path, error instanceof Error ? error.message : "技能加载失败"); }
  }

  function scan(path: string, depth: number) {
    try {
      const info = lstatSync(path);
      if (!info.isDirectory()) { diagnose(path, "技能目录必须为普通目录，不能使用符号链接"); return; }
      if (depth > 32) { diagnose(path, "技能目录层级超过 32 层"); return; }
      const children = readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
      entries += children.length;
      if (entries > 2000) { diagnose(path, "技能目录超过 2000 个条目，请减少加载的技能"); return; }
      const manifest = children.find(entry => entry.name === "SKILL.md");
      if (manifest) { load(join(path, manifest.name)); return; }
      for (const entry of children) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const target = join(path, entry.name);
        if (entry.isSymbolicLink()) diagnose(target, "不加载符号链接中的技能");
        else if (entry.isDirectory()) scan(target, depth + 1);
        else if (depth === 0 && entry.isFile() && entry.name.endsWith(".md")) load(target);
      }
    } catch { diagnose(path, "无法读取技能目录，请检查目录权限"); }
  }
  scan(root, 0);
  return { skills, diagnostics };
}

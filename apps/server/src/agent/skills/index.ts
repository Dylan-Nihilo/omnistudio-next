import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import type { SkillContext, SkillLocation, SkillScope } from "@omnistudio-next/tools-scaffold/runtime";
import conf from "@/utils/conf";
import { accountContext, requireActiveAccount, requireRootAccount } from "@/utils/accountContext";
import * as accountSkills from "@/utils/skills/accountSkills";
import { findSkillCatalogSkill } from "@/utils/skills/catalog";
import { isWithin, lockWorkspaceFiles, resolveWorkspacePath, writeWorkspaceFile } from "@/utils/workspace/files";
import { loadSkillDirectory, parseSkillManifest } from "@/utils/skills/loader";

export type SkillSelectionRequest = { mode: "none" } | { mode: "auto" } | { mode: "fixed"; name: string };
export type SkillSelectionRecord = {
  mode: "auto" | "fixed";
  name: string;
  scope: SkillScope;
  version: string;
  reason: string;
};

function skillMetadata(skill: ReturnType<typeof loadSkillDirectory>["skills"][number]) {
  const metadata = skill.frontmatter.metadata && typeof skill.frontmatter.metadata === "object" && !Array.isArray(skill.frontmatter.metadata)
    ? skill.frontmatter.metadata as Record<string, unknown> : {};
  const catalog = findSkillCatalogSkill(skill.name);
  const rawTriggers = metadata.triggers ?? skill.frontmatter.triggers;
  const triggers = Array.isArray(rawTriggers)
    ? rawTriggers.filter((value): value is string => typeof value === "string")
    : typeof rawTriggers === "string" ? rawTriggers.split(/[，,、;；]/) : [];
  return {
    displayName: typeof metadata.displayName === "string" && metadata.displayName.trim() ? metadata.displayName.trim() : catalog?.displayName ?? skill.name,
    description: catalog?.description ?? skill.description,
    stage: typeof metadata.stage === "string" ? metadata.stage : catalog?.stage ?? "",
    version: typeof metadata.version === "string" ? metadata.version : typeof skill.frontmatter.version === "string" ? skill.frontmatter.version : "",
    triggers: [...new Set(triggers.map(value => value.trim()).filter(value => value.length >= 2))],
    disableModelInvocation: skill.disableModelInvocation,
  };
}

function skillScope(cwd: string, filePath: string): SkillScope {
  if (isWithin(join(cwd, "skill"), filePath)) return "workspace";
  const userId = accountContext.getStore()?.userId;
  if (userId && isWithin(accountSkills.directory(userId), filePath)) return "account";
  return "global";
}

export function listAgentSkills(cwd: string) {
  return loadAgentSkills(cwd).skills.map(skill => {
    const metadata = skillMetadata(skill);
    return { name: skill.name, scope: skillScope(cwd, skill.filePath), warnings: skill.warnings, ...metadata };
  });
}

export function recommendAgentSkill(cwd: string, prompt: string) {
  const normalized = prompt.toLocaleLowerCase();
  const userId = accountContext.getStore()?.userId;
  const autoPaused = new Set(userId ? accountSkills.autoPausedNames(userId) : []);
  const candidates = loadAgentSkills(cwd).skills.filter(skill => !skill.disableModelInvocation).flatMap(skill => {
    const metadata = skillMetadata(skill);
    if (skillScope(cwd, skill.filePath) === "account" && autoPaused.has(skill.name)) return [];
    const matchedTriggers = metadata.triggers.filter(trigger => normalized.includes(trigger.toLocaleLowerCase()));
    if (!matchedTriggers.length) return [];
    return [{
      name: skill.name,
      displayName: metadata.displayName,
      description: metadata.description,
      scope: skillScope(cwd, skill.filePath),
      version: metadata.version,
      stage: metadata.stage,
      matchedTriggers,
      reason: `命中触发词：${matchedTriggers.join("、")}`,
    }];
  });
  candidates.sort((left, right) => {
    const triggerCount = right.matchedTriggers.length - left.matchedTriggers.length;
    if (triggerCount) return triggerCount;
    const matchedLength = right.matchedTriggers.reduce((sum, value) => sum + value.length, 0)
      - left.matchedTriggers.reduce((sum, value) => sum + value.length, 0);
    if (matchedLength) return matchedLength;
    return left.name.localeCompare(right.name);
  });
  return candidates[0];
}

export function resolveSkillSelection(cwd: string, prompt: string, selection: SkillSelectionRequest = { mode: "none" }) {
  const explicitName = /^\/skill:(\S+)/.exec(prompt.trimStart())?.[1];
  if (explicitName) selection = { mode: "fixed", name: explicitName };
  if (selection.mode === "none") return { prompt, record: undefined };

  const skills = loadAgentSkills(cwd).skills;
  const recommendation = selection.mode === "auto" ? recommendAgentSkill(cwd, prompt) : undefined;
  const skill = selection.mode === "fixed" ? skills.find(item => item.name === selection.name)
    : recommendation ? skills.find(item => item.name === recommendation.name) : undefined;
  if (!skill) {
    if (selection.mode === "fixed") throw Object.assign(new Error(`技能“${selection.name}”未加载，请刷新技能列表后重试`), { status: 400 });
    return { prompt, record: undefined };
  }
  const metadata = skillMetadata(skill);
  const scope = skillScope(cwd, skill.filePath);
  const reason = selection.mode === "auto" ? recommendation?.reason ?? "" : "用户在技能菜单中手动选择";
  const normalizedPrompt = prompt.trimStart().startsWith(`/skill:${skill.name}`)
    ? prompt
    : `/skill:${skill.name} ${prompt}`;
  return {
    prompt: normalizedPrompt,
    record: { mode: selection.mode, name: skill.name, scope, version: metadata.version, reason } satisfies SkillSelectionRecord,
  };
}

export function loadAgentSkills(cwd: string, scope?: SkillScope) {
  if (scope !== undefined && scope !== "workspace" && scope !== "account" && scope !== "global") throw new Error("技能范围无效");
  const userId = accountContext.getStore()?.userId;
  const personalDirectory = userId ? accountSkills.existingDirectory(userId) : undefined;
  const directories = [
    { scope: "workspace" as const, path: join(cwd, "skill") },
    ...(personalDirectory ? [{ scope: "account" as const, path: personalDirectory }] : []),
    { scope: "global" as const, path: join(dirname(conf.path), "skills") },
  ].filter(item => scope === undefined || item.scope === scope);
  const result: ReturnType<typeof loadSkillDirectory> = { skills: [], diagnostics: [] };
  const names = new Map<string, SkillScope>();
  for (const directory of directories) {
    const loaded = loadSkillDirectory(directory.path);
    result.diagnostics.push(...loaded.diagnostics);
    for (const skill of loaded.skills) {
      const existingScope = names.get(skill.name.toLowerCase());
      if (existingScope) {
        const scopeLabels = { workspace: "工作区", account: "个人", global: "全局" };
        result.diagnostics.push({ type: "warning", path: skill.filePath, message: `技能“${skill.name}”与${scopeLabels[existingScope]}技能重名，已使用${scopeLabels[existingScope]}版本` });
      } else { names.set(skill.name.toLowerCase(), directory.scope); result.skills.push(skill); }
    }
  }
  return result;
}

export function createSkillContext(cwd: string): SkillContext {
  const getSkillScope = (filePath: string): SkillScope => skillScope(cwd, filePath);

  async function locate(request: SkillLocation, create = false) {
    const scope = create ? request.scope ?? "workspace" : request.scope;
    const skill = loadAgentSkills(cwd, scope).skills.find(skill => skill.name === request.name);
    if (!skill && !create) throw new Error(`技能不存在：${request.name}`);
    if (!skill && (request.name.length > 64 || !/^[a-z][a-zA-Z0-9]*$/.test(request.name))) throw new Error("新技能名称必须为不超过 64 字符的小驼峰");
    const targetScope = scope ?? getSkillScope(skill!.filePath);
    const scopeDirectory = targetScope === "account"
      ? await accountSkills.ensureDirectory(requireActiveAccount().userId)
      : (await resolveWorkspacePath(await realpath(targetScope === "workspace" ? cwd : dirname(conf.path)), targetScope === "workspace" ? "skill" : "skills", true)).path;
    const baseDirectory = skill?.baseDir ?? join(scopeDirectory, request.name);
    if (!isWithin(scopeDirectory, baseDirectory)) throw new Error("技能目录超出指定范围");
    const { path: skillDirectory } = await resolveWorkspacePath(scopeDirectory, relative(scopeDirectory, baseDirectory), true);
    const path = request.path ?? (skill ? basename(skill.filePath) : "SKILL.md");
    const { path: target } = await resolveWorkspacePath(skillDirectory, path, true);
    const filePath = relative(skillDirectory, target).split(sep).join("/");
    if (!skill && filePath !== "SKILL.md") throw new Error("请先创建技能的 SKILL.md，再添加参考资料");
    return { name: request.name, scope: targetScope, path: filePath, target, scopeDirectory, manifest: basename(target).toLowerCase() === "skill.md" || target === skill?.filePath };
  }

  async function write(request: SkillLocation & { content: string }, create: boolean, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const { target, scopeDirectory, manifest, ...document } = await locate(request, create);
    if (document.scope === "global") requireRootAccount();
    if (manifest) {
      const frontmatter = parseSkillManifest(request.content);
      if (frontmatter.name !== request.name || typeof frontmatter.description !== "string" || !frontmatter.description.trim()) {
        throw new Error("SKILL.md 必须包含匹配的 name 和非空 description");
      }
    }
    const release = lockWorkspaceFiles([scopeDirectory, target]);
    try {
      if (!create && !(await stat(target)).isFile()) throw new Error("只能修改已有的普通文件");
      signal?.throwIfAborted();
      if (create) await mkdir(dirname(target), { recursive: true });
      signal?.throwIfAborted();
      await writeWorkspaceFile(target, request.content, create);
      return document;
    } finally { release(); }
  }

  return {
    list: scope => loadAgentSkills(cwd, scope).skills.map(({ name, description, filePath, disableModelInvocation, warnings }) => ({
      name, description, filePath, disableModelInvocation, warnings, scope: getSkillScope(filePath),
    })),
    async read(request, signal) {
      signal?.throwIfAborted();
      const { target, manifest, ...document } = await locate(request);
      if (!(await stat(target)).isFile()) throw new Error("只能读取普通文件");
      return { ...document, content: await readFile(target, { encoding: "utf8", signal }) };
    },
    create: (request, signal) => write(request, true, signal),
    update: (request, signal) => write(request, false, signal),
  };
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { DefaultResourceLoader, SettingsManager, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { agentConfidentialPolicy, buildSystemPrompt } from "@/agent/runtime/prompt";
import { loadAgentSkills } from "@/agent/skills";
import { resolveWorkspacePath } from "@/utils/workspace/files";
import { isMemoryEnabled, readDocument } from "@/utils/personalization";
import { getPlatformDefaultModels } from "@/services/platformService";
import conf from "@/utils/conf";

export async function createAgentResources(cwd: string, tools: ToolDefinition[], settings = SettingsManager.inMemory({
  // ACT: 失败后交给用户重试；SDK 的整轮重试会把重复错误写入主会话和委派子会话。
  retry: { enabled: false, provider: { maxRetries: 0 } },
}), instructions = "") {
  const savedPrompt = conf.get("settings", {}).agentSystemPrompt;
  const systemPrompt = typeof savedPrompt === "string" ? savedPrompt : undefined;
  const agentDir = join(cwd, ".agent");
  const { path: agentsPath } = await resolveWorkspacePath(cwd, "AGENTS.md");
  const agentsContent = await readFile(agentsPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw new Error(`读取工作区 AGENTS.md 失败：${error.message}`, { cause: error });
  });
  const [globalAgents, memory] = await Promise.all([readDocument("agents"), isMemoryEnabled() ? readDocument("memory") : { content: "" }]);
  const defaultModels = getPlatformDefaultModels();
  const defaultModelsSummary = [
    defaultModels.text ? `- 默认文本模型：providerId="${defaultModels.text.providerId}", modelId="${defaultModels.text.modelId}"` : "",
    defaultModels.image ? `- 默认图片模型：providerId="${defaultModels.image.providerId}", modelId="${defaultModels.image.modelId}"` : "",
    defaultModels.video ? `- 默认视频模型：providerId="${defaultModels.video.providerId}", modelId="${defaultModels.video.modelId}"` : "",
  ].filter(Boolean);
  const skills = loadAgentSkills(cwd);
  const sdkSkills = tools.some(tool => tool.name === "skillOperator")
    ? { ...skills, skills: skills.skills.map(skill => ({ ...skill, disableModelInvocation: true })) }
    : skills;
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager: settings,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    // ACT: 仅自动载入工作区根目录的 AGENTS.md，关闭 SDK 向父目录和其他指令文件的自动扫描。
    noContextFiles: true,
    agentsFilesOverride: () => ({ agentsFiles: agentsContent.trim() ? [{ path: agentsPath, content: agentsContent.replace(/^\uFEFF/, "") }] : [] }),
    // ACT: 技能正文按需读取；每个会话独立创建 loader，避免 SDK 的会话绑定互相覆盖。
    skillsOverride: () => sdkSkills,
    systemPrompt: "",
    systemPromptOverride: () => [buildSystemPrompt({ systemPrompt, tools, skills: skills.skills, platform: process.platform, defaultModels }), instructions].filter(Boolean).join("\n\n"),
    appendSystemPrompt: [
      globalAgents.content.trim() ? `## 全局协作规范（AGENTS.md）\n${globalAgents.content}` : "",
      defaultModelsSummary.length ? `## 平台默认模型执行规范（强制）\n${defaultModelsSummary.join("\n")}\n当用户未明确指定模型时，文本、图片、视频任务必须直接采用上述平台默认模型，严禁主动发起提问卡片或中断询问模型。` : "",
      memory.content.trim() ? `## 全局长期记忆\n以下是跨对话保存的偏好与事实，使用前核对适用项目，以用户本轮要求为准。\n<global_memory>\n${memory.content}\n</global_memory>` : "",
      agentConfidentialPolicy,
    ].filter(Boolean),
  });
  await resourceLoader.reload();
  return { agentDir, settingsManager: settings, resourceLoader };
}

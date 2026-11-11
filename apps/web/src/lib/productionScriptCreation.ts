import { reactive } from "vue";
import type { Context } from "@earendil-works/pi-ai";
import { unzipSync } from "fflate";
import { findProductionGenre } from "@/lib/productionGenres";
import { generateText } from "@/lib/textGeneration";
import { findProductionStyle } from "@/lib/productionStyles";
import { getSessionSnapshot } from "@/lib/sessionState";
import { saveProductionDraft, type ProductionDramaDraft, type ProductionDraftGeneration } from "@/lib/productionDraft";

export type ScriptOutlineShot = {
  shotNumber: number;
  durationMs: number;
  shotType: string;
  camera: string;
  lighting: string;
  characterNames: string[];
  propNames: string[];
  soundEffects: string;
  prompt: string;
  dialogue: string;
  narration: string;
};

export type ScriptOutlineScene = {
  sceneNumber: number;
  title: string;
  continuityNotes: string;
  shots: ScriptOutlineShot[];
};

export type ScriptOutlineEpisode = {
  episodeNumber: number;
  title: string;
  body: string;
  targetDurationMs: number;
  scenes: ScriptOutlineScene[];
};

export type ScriptOutlineAsset = {
  assetType: "character" | "scene" | "prop";
  name: string;
  description: string;
  visualDescription: string;
};

export type ScriptGenerationResult = {
  logline: string;
  episodes: ScriptOutlineEpisode[];
  assets: ScriptOutlineAsset[];
};

export type ParsedScriptGeneration = {
  result: ScriptGenerationResult;
  repaired: boolean;
};

export type ProductionScriptModel = {
  providerId: string;
  modelId: string;
};

export type ProductionScriptGenerationJob = {
  status: "generating" | "succeeded" | "failed";
  generation: ProductionDraftGeneration | null;
  error: string;
  textLength: number;
  promise: Promise<ProductionDraftGeneration | null>;
};

const productionScriptJobs = reactive(new Map<string, ProductionScriptGenerationJob>());

function jobKey(projectId: string, userId: string) {
  return JSON.stringify([userId, projectId]);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "剧本模型生成失败";
}

export function productionScriptTokenLimit(episodeCount: number) {
  const count = Number.isFinite(episodeCount) ? episodeCount : 1;
  return Math.min(24000, Math.max(4200, Math.round(count * 2000)));
}

export function productionScriptDraftSignature(draft: ProductionDramaDraft) {
  return JSON.stringify([
    draft.mode,
    draft.instruction,
    draft.pastedScript,
    draft.files.map(file => [file.id, file.name, file.size, file.type, file.lastModified, file.storageKey]),
    draft.style,
    draft.genre,
    draft.fusionGenres,
    draft.aspectRatio,
    draft.episodeCount,
    draft.textModel,
    draft.adaptType,
    draft.outputLanguage,
  ]);
}

export function productionScriptDraftSignatureMatches(signature: string, draft: ProductionDramaDraft) {
  const currentSignature = productionScriptDraftSignature(draft);
  if (signature === currentSignature) return true;
  try {
    const previousDraft = JSON.parse(signature) as unknown;
    return Boolean(previousDraft && typeof previousDraft === "object" && !Array.isArray(previousDraft)
      && productionScriptDraftSignature(previousDraft as ProductionDramaDraft) === currentSignature);
  } catch { return false; }
}

export function buildProductionScriptRequest(draft: ProductionDramaDraft, referenceText: string, model: ProductionScriptModel) {
  if (!model.providerId || !model.modelId) throw new Error("请先选择可用的文本模型");
  const genre = findProductionGenre(draft.genre);
  const style = findProductionStyle(draft.style);
  if (!genre || !style) throw new Error("当前题材或风格预设不存在，请重新选择");

  const adaptationTask = ({
    rewrite: "剧本改写：保留原稿的核心人物关系、因果和主题，按用户要求重构节奏与表达。",
    continue: "剧本续写：从原稿已有冲突和人物目标自然续写，不重置人物、不跳过已有伏笔。",
    localize: "出海改编：保留原稿主题与人物动机，将语言、场景和文化语境调整为目标市场可理解的表达。",
  } as Record<string, string>)[draft.adaptType] ?? "剧本改写：保留原稿核心设定，按用户要求优化节奏与表达。";
  const taskPrompt = draft.mode === "create"
    ? "你是原创漫剧编剧 Agent。根据创作要求写出完整的新故事；参考附件只补充人物、世界观或素材，不得把参考原文直接当成最终剧本。创作要求为空时，从参考附件归纳核心创意后再创作。"
    : draft.mode === "adapt"
      ? `你是剧本改编 Agent。必须以 sourceScript 为原稿，执行以下改编任务：${adaptationTask} 保留原稿可辨认的核心冲突与人物动机；用户要求优先于题材预设。`
      : "你是剧本拆分 Agent。忠实读取 sourceScript，将已有剧本拆分为指定集数、场景与可执行镜头；不新增主线、不改写人物关系、不把梗概冒充剧本。剧本信息不足时仅补齐拍摄所需的场景和镜头表达。";
  const fusionPrompts = draft.fusionGenres.map(name => {
    const preset = findProductionGenre(name);
    return preset ? `${name}: ${preset.storyPrompt.replaceAll("{{story}}", "用户创作输入").replaceAll("{{episodeCount}}", String(draft.episodeCount))}` : "";
  }).filter(Boolean);
  const sourceScript = [draft.pastedScript.trim() ? `【粘贴的原稿】\n${draft.pastedScript.trim()}` : "", referenceText].filter(Boolean).join("\n\n");
  const systemPrompt = [
    taskPrompt,
    draft.mode === "create"
      ? `主叙事题材约束：${genre.storyPrompt.replaceAll("{{story}}", "用户创作输入").replaceAll("{{episodeCount}}", String(draft.episodeCount))}`
      : `题材设定为「${genre.nameZh}」，只用于理解和呈现原稿；不得借题材设定替换原稿主线。`,
    fusionPrompts.length ? `融合题材仅作为补充约束，不得覆盖原稿或主线：\n${fusionPrompts.join("\n")}` : "不附加融合题材。",
    `视觉风格约定：${style.positivePrompt}`,
    `视觉排除约定：${style.negativePrompt}`,
    `画幅比例为 ${draft.aspectRatio}。将视觉约定落实到每个镜头画面提示和资产 visualDescription，不要把视觉词代替剧情动作。目标 ${draft.episodeCount} 集。用户在创作要求或原稿中明确给出的每集时长、总镜头数优先，必须按其数值设计；没有明确时长要求时，才以每集约 60 秒为默认目标。`,
    "必须精确输出指定集数，剧情应形成起因、推进、冲突和结尾钩子。每集至少 1 个场景；每个场景至少 1 个镜头，单集镜头合计不超过 12 个；镜头时长为 2 到 15 秒。对白、旁白、音效可以为空字符串。主体资产至少包含 1 个角色和 1 个场景，可按剧情增加道具。同类型资产名称必须唯一；镜头 characterNames、propNames 只填 assets 中对应类型的精确名称，没有则填空数组。为保证完整 JSON，字符串使用简洁中文，不得输出额外说明。",
    "每集 body 必须是可独立阅读和拍摄的完整剧本正文，按场景依次写场次、地点、内外景、日夜、出场人物、动作、对白和必要旁白，以换行分段。不得用梗概、镜头提示词或 JSON 代替正文。scenes 与 shots 必须忠实拆分该集 body，人物、动作、对白和事件顺序保持一致。",
    "JSON 顶层只能包含 logline、episodes、assets 三个键。assets 必须是与 episodes 同级的数组，至少含 1 个角色和 1 个场景；禁止遗漏 assets，禁止把 assets 或其 JSON 文本放入任何剧情、对白、旁白字段。严格遵守结构：{\"logline\":string,\"episodes\":[{\"title\":string,\"body\":string,\"targetDurationSeconds\":number,\"scenes\":[{\"title\":string,\"continuityNotes\":string,\"shots\":[{\"durationSeconds\":number,\"shotType\":string,\"camera\":string,\"lighting\":string,\"characterNames\":string[],\"propNames\":string[],\"soundEffects\":string,\"prompt\":string,\"dialogue\":string,\"narration\":string}]}]}],\"assets\":[{\"assetType\":\"character\"|\"scene\"|\"prop\",\"name\":string,\"description\":string,\"visualDescription\":string}]}。不得输出 episodeNumber、sceneNumber、shotNumber，它们会按顺序自动编号。",
  ].join("\n\n");
  const userContent = JSON.stringify({
    mode: draft.mode,
    creativeInstruction: draft.instruction.trim(),
    adaptType: draft.mode === "adapt" ? draft.adaptType || "rewrite" : undefined,
    referenceMaterial: draft.mode === "create" ? referenceText || undefined : undefined,
    sourceScript: draft.mode === "adapt" || draft.mode === "produce" ? sourceScript || undefined : undefined,
    genre: genre.nameZh,
    fusionGenres: draft.fusionGenres,
    style: style.nameZh,
    aspectRatio: draft.aspectRatio,
    episodeCount: draft.episodeCount,
    outputLanguage: draft.outputLanguage,
  });
  const context: Context = { systemPrompt, messages: [{ role: "user", content: userContent, timestamp: Date.now() }] };
  return { providerId: model.providerId, modelId: model.modelId, systemPrompt, userContent, context };
}

export async function readProductionScriptReference(file: { name: string }, blob: Blob | null) {
  if (!blob || !/\.(txt|md|docx)$/i.test(file.name)) return "";
  let value = "";
  if (/\.docx$/i.test(file.name)) {
    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()), { filter: entry => entry.name === "word/document.xml" && entry.originalSize <= 2 * 1024 * 1024 });
    const documentXml = archive["word/document.xml"];
    if (!documentXml) throw new Error(`${file.name} 的正文超过 2 MB 或无法读取`);
    const document = new DOMParser().parseFromString(new TextDecoder().decode(documentXml), "application/xml");
    if (document.querySelector("parsererror")) throw new Error(`${file.name} 不是可读取的 DOCX 文档`);
    const wordNamespace = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    value = Array.from(document.getElementsByTagNameNS(wordNamespace, "p"))
      .map(paragraph => Array.from(paragraph.getElementsByTagNameNS(wordNamespace, "t")).map(node => node.textContent ?? "").join(""))
      .filter(Boolean)
      .join("\n");
  } else {
    value = await blob.slice(0, 480000).text();
  }
  value = value.replace(/\u0000/g, "").trim().slice(0, 120000);
  return value ? `【参考剧本：${file.name}】\n${value}` : "";
}

export function startProductionScriptGeneration(input: {
  projectId: string;
  userId: string;
  draft: ProductionDramaDraft;
  referenceText: string;
  model: ProductionScriptModel;
}) {
  const key = jobKey(input.projectId, input.userId);
  const existing = productionScriptJobs.get(key);
  if (existing?.status === "generating") return existing;

  const job: ProductionScriptGenerationJob = reactive({
    status: "generating",
    generation: null,
    error: "",
    textLength: 0,
    promise: Promise.resolve(null),
  });
  productionScriptJobs.set(key, job);

  job.promise = (async () => {
    try {
      if (!input.projectId.trim() || !input.userId.trim()) throw new Error("缺少剧本生成的项目或账号标识");
      if (getSessionSnapshot().userId !== input.userId) throw new Error("账户已切换，剧本生成已取消");
      const draft = { ...input.draft, files: input.draft.files.map(file => ({ ...file })), fusionGenres: [...input.draft.fusionGenres] };
      const request = buildProductionScriptRequest(draft, input.referenceText, input.model);
      const message = await generateText({
        providerId: request.providerId,
        modelId: request.modelId,
        projectId: input.projectId,
        maxTokens: productionScriptTokenLimit(draft.episodeCount),
        context: request.context,
      }, {
        onText: text => {
          if (productionScriptJobs.get(key) === job && job.status === "generating") job.textLength = text.length;
        },
      });
      const responseText = message.content.filter(part => part.type === "text").map(part => part.text).join("");
      const usage = message.usage;
      const generation: ProductionDraftGeneration = {
        rawText: responseText,
        generatedAt: new Date().toISOString(),
        providerId: request.providerId,
        modelId: request.modelId,
        stopReason: message.stopReason,
        status: "raw",
        result: { draftSignature: productionScriptDraftSignature(draft) },
        usage: usage ? { input: usage.input, output: usage.output, total: usage.totalTokens, cost: usage.cost.total } : null,
      };
      job.generation = generation;
      job.textLength = responseText.length;
      try {
        if (getSessionSnapshot().userId !== input.userId) throw new Error("账户已切换，模型原文未能保存");
        await saveProductionDraft(input.projectId, input.userId, draft, generation);
      } catch (error) {
        job.error = `模型已生成，但原文暂未保存：${errorText(error)}`;
      }
      job.status = "succeeded";
      return generation;
    } catch (error) {
      job.status = "failed";
      job.error = errorText(error);
      return null;
    }
  })();

  return job;
}

export function getProductionScriptJob(projectId: string, userId: string) {
  return productionScriptJobs.get(jobKey(projectId, userId));
}

export function clearProductionScriptJob(projectId: string, userId: string) {
  productionScriptJobs.delete(jobKey(projectId, userId));
}

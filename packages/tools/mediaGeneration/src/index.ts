import { z } from "zod";
import type { ToolDefinition, ToolPlugin } from "@omnistudio-next/tools-scaffold/runtime";
import { imageGenerationSchema, listMediaModelsSchema, videoGenerationSchema, estimateCreditsSchema } from "./runtime";

const configSchema = z.object({
  allowImage: z.boolean().default(true),
  allowVideo: z.boolean().default(true),
});

const plugin: ToolPlugin = {
  validateConfig: config => configSchema.parse(config),
  createTools({ media, config }) {
    if (!media) return [];
    const permissions = configSchema.parse(config);
    const generationTools = ([
      { name: "generateImage", mediaType: "image", enabled: permissions.allowImage, label: "生成图片", parameters: imageGenerationSchema, description: "根据提示词和可选的工作区参考图生成图片。" },
      { name: "generateVideo", mediaType: "video", enabled: permissions.allowVideo, label: "生成视频", parameters: videoGenerationSchema, description: "根据提示词和可选的工作区图片、视频、音频、首尾帧生成视频。按模型能力设置生成模式、时长、分辨率和音频。" },
    ] as const).filter(operation => operation.enabled);
    if (!generationTools.length) return [];
    const listTool: ToolDefinition = {
      name: "listMediaModels",
      label: "查询媒体模型",
      description: "查询已允许生成的媒体模型，返回 providerId、modelId、类型、模式、画幅、时长、分辨率、原生音频能力及公开积分定价。生成前先查询，不能猜测模型 ID。",
      parameters: z.toJSONSchema(listMediaModelsSchema, { io: "input", target: "draft-07" }),
      async execute(_id, params, signal) {
        listMediaModelsSchema.parse(params);
        signal?.throwIfAborted();
        const result = (await media.listModels()).filter(model => generationTools.some(operation => operation.mediaType === model.type));
        return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
      },
    };
    const estimateTool: ToolDefinition = {
      name: "estimateMediaCredits",
      label: "预估算力消耗",
      description: "查询指定模型在对应规格（如图片分辨率、视频时长或分辨率）下单次生成预计消耗的积分。生成前用于向用户明确说明预估算力，不含任何底价或成本。",
      parameters: z.toJSONSchema(estimateCreditsSchema, { io: "input", target: "draft-07" }),
      async execute(_id, params) {
        const input = estimateCreditsSchema.parse(params);
        if (!media.estimateCredits) return { content: [{ type: "text", text: "当前无法查询积分预估" }], details: undefined };
        const result = await media.estimateCredits(input);
        if (!result) return { content: [{ type: "text", text: "该模型尚未配置公开积分价格，算力消耗未知" }], details: undefined };
        return { content: [{ type: "text", text: `预计消耗 ${result.credits} 积分（${result.formatted}）` }], details: result };
      },
    };
    return [listTool, estimateTool, ...generationTools.map<ToolDefinition>(operation => ({
      name: operation.name,
      label: operation.label,
      description: `${operation.description}providerId 和 modelId 必须来自 listMediaModels。引用素材的 path 及 outputDirectory 均为工作区相对路径；省略输出目录使用默认媒体目录。等待生成完成后返回已保存的文件路径，不返回 Base64。`,
      promptSnippet: "生成媒体前先查询 listMediaModels，复用实际模型和工作区参考素材。",
      parameters: z.toJSONSchema(operation.parameters, { io: "input", target: "draft-07" }),
      executionMode: "sequential",
      async execute(_id, params, signal) {
        signal?.throwIfAborted();
        const result = await media[operation.name](operation.parameters.parse(params), signal);
        const text = result.map(asset => {
          const url = asset.path.replaceAll("\\", "/").split("/").map(encodeURIComponent).join("/");
          const preview = asset.mediaType === "image" ? `![生成图片](<${url}>)` : `[查看生成视频](<${url}>)`;
          return `${preview}\n工作区文件：${asset.path}`;
        }).join("\n\n");
        return { content: [{ type: "text", text }], details: result };
      },
    }))];
  },
};

export default plugin;

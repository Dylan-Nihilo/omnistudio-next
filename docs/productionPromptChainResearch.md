# 漫剧题材与风格提示词链调研

核查日期：2026-11-05

## 结论

题材与风格不能只作为表单字段保存，也不宜把一段完整题材提示词无差别拼进每个模型请求。可追溯的做法是按生产阶段编译提示词；把剧情语义、视觉约定、角色/场景参考素材作为不同输入；根据供应商能力映射；保存每次实际请求的完整快照和来源版本。

## 竞品与开源依据

### RunningHub

前序实际操作确认题材设置中的“主题材 / 融合题材”和分类选择。可据此参考显式创作设置与阶段化界面，但没有公开源码或请求载荷可证明它内部怎样把题材、风格注入 Agent。因此不能把它描述成已核实的隐藏提示词方案。

### Toonflow 上游开源工作流

公开工作流文档明确区分叙事类型和视觉风格：前者组织情节、情绪和镜头；后者控制形态、材质和色光。剧本、资产、导演规划、分镜图、视频分别有阶段任务和产物约定：[v118workflow 工作流](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/packages/skills/v118workflow/SKILL.md#L52)。

视觉风格进一步成为共享的项目视觉约定，而不只是“风格名”：媒介、色彩、角色轮廓、光源和材质可供后续阶段引用：[基础资产约定](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/packages/skills/v118workflow/references/baseAssets.md#L15)、[视觉风格知识](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/packages/skills/v118workflow/references/knowledge/visualStyles.md#L5)。

资产图生成提示按主体、结构/材质、必要风格和排除项组合；衍生资产把父图作为真实图像输入，并记录提示词与参数：[资产图生成流程](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/packages/skills/v118workflow/references/generateAssets.md#L8)。视频阶段保留完整提示词、资产版本和媒体输入映射：[视频制作流程](https://github.com/HBAI-Ltd/Toonflow-app/blob/master/packages/skills/v118workflow/references/videoProduction.md#L18)。这些是开源流程文档中的方法，不代表本项目当前实现已具备全部能力。

### ComfyUI

ComfyUI 官方文档将文本提示编码成扩散模型使用的 conditioning，并通过节点将正向/负向 conditioning 接入采样器；[CLIPTextEncode 节点源码](https://github.com/comfyanonymous/ComfyUI/blob/master/nodes.py#L63-L94)展示了文本条件的编码和组合。参考图也可以作为独立条件输入，IPAdapter 项目说明它能用图像参考传递主体或风格：[ComfyUI_IPAdapter_plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus#readme)。

这说明“风格”可能由文本、LoRA、参考图或模型专用条件提供，不应假定所有供应商都支持同一种负向提示词或图像控制字段。ComfyUI 是通用节点工作流，不是漫剧产品的商业能力对比样本。

## 本项目实际链路

1. 首页入口将 `style`、`genre`、`fusionGenres` 写入本地生产草稿：[productionProjects/index.vue:189](../apps/web/src/pages/productionProjects/index.vue#L189)。题材模板目前仅由选择器读取、展示或复制：[productionVisualPicker.vue](../apps/web/src/components/account/productionVisualPicker.vue)。题材提示词没有进入生产生成请求。
2. 剧本结构预览依赖用户输入文本，`parseScriptOutline` 做本地文本拆分，不调用模型：[productionProjects/detail.vue:387](../apps/web/src/pages/productionProjects/detail.vue#L387)。创建剧集时保存拆分出的标题、场景和原始镜头文本：[productionProjects/detail.vue:461](../apps/web/src/pages/productionProjects/detail.vue#L461)。
3. 主体资产有单独的 `visualDescription` 字段，由用户编辑后保存；当前没有自动读取题材或风格提示词来生成该字段：[productionProjects/detail.vue:122](../apps/web/src/pages/productionProjects/detail.vue#L122)、[productionProjectService.ts:125](../apps/server/src/services/productionProjectService.ts#L125)。
4. 镜头生成请求提交页面上的 `generationForm.prompt`；路由校验后把该请求交给媒体生成服务，没有自动合入主题材、融合题材、风格或资产视觉设定：[productionProjects/detail.vue:513](../apps/web/src/pages/productionProjects/detail.vue#L513)、[shots/generate.ts:28](../apps/server/src/routes/productionProjects/shots/generate.ts#L28)、[productionProjectService.ts:274](../apps/server/src/services/productionProjectService.ts#L274)。

当前状态是“题材/风格已选择并保存为草稿 + 提示词可查看/复制”，不是“提示词链已接通”。

## 建议的数据流

| 阶段 | 提示词/条件组成 | 输出与快照 |
| --- | --- | --- |
| 剧本创作 | 用户故事 + 主题材叙事约束 + 融合题材补充约束 + 固定剧本结构 schema；不加入画面词 | 故事设定、人物动机、分集大纲、场景/对白剧本；记录题材 ID 与模板版本 |
| 项目视觉约定 | 单独选择的视觉风格 + 项目画面比例/受众约束 | 可复用的 visual bible：媒介、轮廓、色彩、光线、材质；记录 style ID/版本 |
| 主体资产 | 剧本 canon + 角色/场景资产描述 + visual bible；衍生图另传父资产图片 | 带版本的角色/场景/道具说明和生成记录 |
| 分镜 | 已确认剧本 + 单镜头意图 + 适用资产 canon + visual bible | 镜头提示词和结构化运镜/时长字段；镜头 revision 绑定资产版本 |
| 图片/视频生成 | 当前 shot + 实际资产引用图 + visual bible；按 provider 能力拆成文本/负向文本/参考图/LoRA 等 | 保存模型、供应商、编译后的真实请求、源 revision、资产 ID/版本、参考文件映射、任务与费用 |

融合题材应作为有限、可检查的附加叙事约束；视觉风格应作为独立视觉约定。不能直接拼接多个完整模板后假定结果稳定，也不能对不支持对应字段的供应商伪传 `negativePrompt`。

## 推进建议

先建立确定性的、带版本的阶段提示词编译边界（stage + provider capabilities），并让每个生成任务持久化不可变的有效提示词快照。首轮接剧本创作与镜头出图两个阶段，验证预览请求和实际供应商请求一致；随后接主体资产与分镜，再补审计、重试和资产版本引用。实现前先列清四种供应商能力，避免通用接口承诺供应商做不到的负向提示或参考图控制。

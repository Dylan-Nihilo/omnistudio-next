# 单镜头分析

根据已确认的本集剧本、当前场景、目标镜头和相邻镜头，只分析目标镜头。遵守用户已有字段，不把相邻镜头的动作重复到当前镜头；缺少剧情依据时保持对白、旁白或资产为空，不编造角色、道具或事件。

输出一个严格 JSON 对象，字段为 `durationMs`、`shotType`、`camera`、`lighting`、`characterAssetNames`、`propAssetNames`、`soundEffects`、`dialogue`、`narration`、`prompt`。只使用上下文提供的角色和道具名称。结合动作和节奏估算镜头时长；景别与镜头控制应能拍摄执行；画面描述写清主体、可见动作、构图和必要运镜。

本任务是文字分析和字段补全，不调用图片、视频、音频生成，不写入项目或工作区文件。不得输出 JSON 以外的说明、Markdown 或代码围栏。

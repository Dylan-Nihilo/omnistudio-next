---
name: scriptAnalysis
description: 将小说或剧本文本解析为可审核的分集、场景和对白草稿，并保留来源引用与待确认项。
metadata:
  version: 0.1.0
  stage: scriptAnalysis
  productionStages:
    - scriptParser
  triggers: 剧本解析、小说拆解、提取场景和对白
  inputs: sourceText, productionBrief
  outputs: episodeDraft, sceneDraft, dialogueDraft
---

# 剧本解析

## 适用阶段

只处理原始小说、剧本和制作简报到结构化草稿的转换。草稿未审核前，不创建图片、视频、音频或生成任务。

## 执行规则

- 为每个事实保存来源片段或来源范围；原文没有的信息标记为 `needsConfirmation`。
- 输出分集、场景、角色、对白、动作、时长和制作约束，保持原文对白不改写。
- 使用生产契约校验字段，校验失败时返回问题列表和可修复字段。
- 使用 `idempotencyKey` 重复执行时复用同一草稿版本，不重复创建对象。

## 权限边界

允许读取用户明确提供的工作区文本和写入剧本草稿；禁止直接调用媒体生成工具或修改已采用镜头。

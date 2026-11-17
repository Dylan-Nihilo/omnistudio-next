---
name: mediaGeneration
description: 将已审核镜头和资产版本转换为可取消、可重试、可追踪的图片或视频生成任务。
metadata:
  version: 0.1.0
  stage: mediaGeneration
  productionStages:
    - mediaGeneration
  triggers: 图片生成、视频生成、批量生成、局部重跑、媒体任务
  inputs: approvedShots, assetVersions, generationSpec
  outputs: task, take
---

# 媒体生成

## 前置条件

只接受已审核镜头、实际资产版本和明确的生成规格。生成前冻结模型、提示词、参数、参考素材、数量和幂等键。

## 任务规则

- 每次请求创建独立任务和生成尝试，不覆盖已有采用结果。
- 记录供应商 requestId、状态、错误、重试次数和用户侧可见的积分消耗。
- 失败只重试受影响镜头，支持取消、恢复和局部重跑。
- 相同幂等键复用已有任务，不能重复计费。

## 确认与采用

图片、视频和音频生成前需要展示具体批次并取得算力授权。生成完成后先进入 QA 或人工采用，不能直接标记为最终交付。

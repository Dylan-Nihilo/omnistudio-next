---
name: continuity
description: 检查角色、场景、道具、空间和时间在镜头之间的连续性，并把问题定位到镜头和资产版本。
metadata:
  version: 0.1.0
  stage: continuity
  productionStages:
    - continuity
  triggers: 连续性检查、角色一致性、场景衔接、道具穿帮
  inputs: shots, assetVersions, continuityState
  outputs: continuityReport, affectedShots
---

# 连续性检查

## 检查范围

检查角色外观、服装、伤势、持物、位置、朝向、出镜状态、场景空间、门窗家具、时间和光线。只比较分镜标记为连续关联的镜头。

## 输出规则

每个问题必须包含严重级别、问题依据、受影响镜头、相关资产版本和建议回退阶段。没有可靠依据时标记为 `uncertain`，不能直接判定通过。

## 回退规则

问题只回退到受影响的分镜、资产或生成任务；不得因为单个镜头失败而无条件重做整集。检查结果通过结构化契约校验后才允许进入下一阶段。

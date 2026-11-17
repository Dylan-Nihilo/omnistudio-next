---
name: assetDesign
description: 管理角色、场景和道具实体及其版本、参考素材和镜头使用关系，支持连续性追踪。
metadata:
  version: 0.1.0
  stage: assetDesign
  productionStages:
    - assetDesign
  triggers: 角色设计、场景设计、道具资产、资产版本
  inputs: assetBrief, referenceFiles, shots
  outputs: asset, assetVersion, usageRefs
---

# 资产设计

## 数据规则

资产以稳定实体 ID 表示，文件名不能作为身份。每次外观、服装、状态或参考图变化都创建新版本，并保留来源引用和采用状态。

## 使用关系

镜头必须引用实际使用的资产版本。资产版本变更时计算受影响镜头，旧采用版本保持可回溯，不覆盖历史生成结果。

## 权限边界

允许创建候选资产和版本；只有用户采用或审核通过后，才能作为媒体生成输入。禁止隐式替换已采用资产。

---
name: reviewQa
description: 对生成结果执行技术、叙事、视觉和连续性质量门，输出可解释问题并支持定向回退。
metadata:
  version: 0.1.0
  stage: reviewQa
  productionStages:
    - qa
  triggers: 质量检查、生成结果审核、成片验收、QA
  inputs: takes, shots, continuityReport, deliverySpec
  outputs: qaReport, reviewDecision, rollbackTargets
---

# 质量门

## 检查项

- 技术：文件可读性、分辨率、时长、音轨、字幕和编码。
- 叙事：剧情覆盖、对白归属、镜头顺序和目标时长。
- 视觉：角色、服装、道具、姿态、画面稳定性和文字穿帮。
- 连续性：镜头前后状态、空间方向、光线和资产版本。

## 决策

只输出 `pass`、`fail` 或 `pendingHumanReview`。异常必须记录依据、严重级别和受影响范围，不能捕获异常后默认通过。

## 回退

QA 失败时只生成具体的分镜、资产或任务回退目标；用户采用前，生成结果不能进入正式时间线。

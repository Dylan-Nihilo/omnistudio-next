<template>
  <aside v-if="visible" class="questHud" aria-label="新手导演任务引导">
    <div class="hudCard">
      <header class="hudHeader">
        <div class="questInfo">
          <span class="questTag">{{ currentStepBadge }}</span>
          <span class="themeName">{{ activeTheme.title }}</span>
        </div>
        <button class="skipButton" type="button" @click="handleSkip">
          跳过引导
        </button>
      </header>

      <div class="hudBody">
        <h4 class="stepTitle">{{ currentStepTitle }}</h4>
        <p class="stepDesc">{{ currentStepDesc }}</p>
      </div>

      <div class="stepIndicator">
        <div class="stepDot" :class="{ isActive: isStepActive('promptNode'), isDone: isStepDone('promptNode') }">
          <span class="dotIndex">1</span>
          <span class="dotLabel">分镜</span>
        </div>
        <div class="stepLine" :class="{ isDone: isStepDone('promptNode') }" />
        <div class="stepDot" :class="{ isActive: isStepActive('imageNode'), isDone: isStepDone('imageNode') }">
          <span class="dotIndex">2</span>
          <span class="dotLabel">定妆</span>
        </div>
        <div class="stepLine" :class="{ isDone: isStepDone('imageNode') }" />
        <div class="stepDot" :class="{ isActive: isStepActive('videoNode'), isDone: isStepDone('videoNode') }">
          <span class="dotIndex">3</span>
          <span class="dotLabel">出片</span>
        </div>
      </div>

      <footer class="hudFooter">
        <div class="costHint">
          <span>本次扣减：</span>
          <strong>{{ currentStepCost }}</strong>
        </div>
        <uiButton size="small" variant="primary" @click="handleAdvance">
          {{ actionButtonText }}
        </uiButton>
      </footer>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { uiButton } from "@omnistudio-next/ui";
import { useOnboardingStore, type OnboardingStep } from "@/stores/onboardingStore";

const onboardingStore = useOnboardingStore();
const visible = computed(() => onboardingStore.isGuiding && onboardingStore.currentStep !== "completed");
const activeTheme = computed(() => onboardingStore.activeTheme);
const currentStep = computed(() => onboardingStore.currentStep);

const currentStepBadge = computed(() => {
  switch (currentStep.value) {
    case "promptNode": return "关卡 1/3";
    case "imageNode": return "关卡 2/3";
    case "videoNode": return "关卡 3/3";
    default: return "实战任务";
  }
});

const currentStepTitle = computed(() => {
  switch (currentStep.value) {
    case "promptNode": return "锁定故事分镜";
    case "imageNode": return "生成首个关键帧画面";
    case "videoNode": return "驱动镜头，生成动态漫剧";
    default: return "";
  }
});

const currentStepDesc = computed(() => {
  switch (currentStep.value) {
    case "promptNode":
      return `画布左侧已为您注入【${activeTheme.value.title}】经典分镜，点击确认分镜进入出图。`;
    case "imageNode":
      return "分镜文案已连线至生图节点，已配置最优模型参数，点击生成唤醒画面。";
    case "videoNode":
      return "画面已连接至视频生成节点，运镜已配置，点击一键渲染你的 4 秒漫剧镜头！";
    default:
      return "";
  }
});

const currentStepCost = computed(() => {
  switch (currentStep.value) {
    case "promptNode": return "0 积分";
    case "imageNode": return `~${activeTheme.value.estimatedCredits.image} 积分`;
    case "videoNode": return `~${activeTheme.value.estimatedCredits.video} 积分`;
    default: return "-";
  }
});

const actionButtonText = computed(() => {
  switch (currentStep.value) {
    case "promptNode": return "下一步：生图";
    case "imageNode": return "下一步：生视频";
    case "videoNode": return "完成生成";
    default: return "下一步";
  }
});

function isStepActive(step: OnboardingStep) {
  return currentStep.value === step;
}

function isStepDone(step: OnboardingStep) {
  const order: OnboardingStep[] = ["promptNode", "imageNode", "videoNode", "completed"];
  const currentIdx = order.indexOf(currentStep.value);
  const targetIdx = order.indexOf(step);
  return currentIdx > targetIdx;
}

function handleAdvance() {
  if (currentStep.value === "promptNode") {
    onboardingStore.advanceToStep("imageNode");
  } else if (currentStep.value === "imageNode") {
    onboardingStore.advanceToStep("videoNode");
  } else if (currentStep.value === "videoNode") {
    onboardingStore.completeOnboarding();
  }
}

async function handleSkip() {
  await onboardingStore.skipOnboarding();
}
</script>

<style lang="scss" scoped>
.questHud {
  position: absolute;
  top: 84px;
  right: 24px;
  z-index: 100;
  width: 320px;
  pointer-events: auto;

  .hudCard {
    background: rgba(20, 20, 20, 0.88);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(255, 122, 69, 0.35);
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 24px rgba(255, 122, 69, 0.1);
    display: flex;
    flex-direction: column;
    gap: 14px;

    .hudHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;

      .questInfo {
        display: flex;
        align-items: center;
        gap: 8px;

        .questTag {
          font-size: 11px;
          font-weight: 600;
          color: #ff7a45;
          background: rgba(255, 122, 69, 0.15);
          padding: 2px 7px;
          border-radius: 4px;
        }

        .themeName {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.85);
          font-weight: 500;
        }
      }

      .skipButton {
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.45);
        font-size: 11px;
        cursor: pointer;
        padding: 2px 4px;
        transition: color 0.18s ease;

        &:hover {
          color: rgba(255, 255, 255, 0.85);
        }
      }
    }

    .hudBody {
      display: flex;
      flex-direction: column;
      gap: 6px;

      .stepTitle {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: #ffffff;
      }

      .stepDesc {
        margin: 0;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.65);
        line-height: 1.5;
      }
    }

    .stepIndicator {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 4px;

      .stepDot {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;

        .dotIndex {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.5);
          font-size: 11px;
          font-weight: 600;
          display: grid;
          place-items: center;
          transition: all 0.2s ease;
        }

        .dotLabel {
          font-size: 11px;
          color: rgba(255, 255, 255, 0.45);
        }

        &.isActive {
          .dotIndex {
            background: #ff7a45;
            color: #ffffff;
            box-shadow: 0 0 10px rgba(255, 122, 69, 0.6);
          }
          .dotLabel {
            color: #ff9a75;
            font-weight: 500;
          }
        }

        &.isDone {
          .dotIndex {
            background: rgba(255, 122, 69, 0.25);
            color: #ff9a75;
          }
          .dotLabel {
            color: rgba(255, 255, 255, 0.7);
          }
        }
      }

      .stepLine {
        flex: 1;
        height: 2px;
        background: rgba(255, 255, 255, 0.1);
        margin: 0 6px 16px;
        transition: background 0.2s ease;

        &.isDone {
          background: #ff7a45;
        }
      }
    }

    .hudFooter {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding-top: 10px;

      .costHint {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);

        strong {
          color: #ff9a75;
          font-weight: 600;
        }
      }
    }
  }
}
</style>

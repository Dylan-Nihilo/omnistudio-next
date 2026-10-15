<template>
  <div v-if="visible" class="celebrationModal" role="dialog" aria-modal="true" aria-labelledby="celebrationTitle">
    <div class="modalBackdrop" />
    <div class="celebrationCard">
      <header class="celebrationHeader">
        <span class="achievementBadge">🏆 新人成就解锁</span>
        <h2 id="celebrationTitle">恭喜通关！首个漫剧镜头已诞生</h2>
        <p class="celebrationSubtitle">你已亲手打通了从「剧本分镜」到「画面定妆」再到「动态运镜」的完整漫剧创作闭环。</p>
      </header>

      <div class="resultPreview">
        <div v-if="videoUrl" class="videoBox">
          <video :src="videoUrl" autoplay loop muted playsinline />
        </div>
        <div v-else class="previewFallback">
          <div class="filmIcon">🎬</div>
          <span>镜头渲染已就绪 · 雨夜拔刀</span>
        </div>
      </div>

      <div class="billingSummary">
        <div class="billingRow">
          <span>注册赠送体验金</span>
          <strong>100 积分</strong>
        </div>
        <div class="billingRow costRow">
          <span>本次实战出片消耗</span>
          <strong>-21 积分</strong>
        </div>
        <div class="billingRow balanceRow">
          <span>当前可用余额</span>
          <span class="finalBalance">~79 积分</span>
        </div>
      </div>

      <footer class="celebrationFooter">
        <uiButton variant="secondary" @click="handleStay">
          留在画布自由探索
        </uiButton>
        <uiButton variant="primary" @click="handleCreateOwn">
          开始创作我的漫剧
        </uiButton>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { uiButton } from "@omnistudio-next/ui";
import { useOnboardingStore } from "@/stores/onboardingStore";

const router = useRouter();
const onboardingStore = useOnboardingStore();
const visible = computed(() => onboardingStore.showCelebration);
const videoUrl = computed(() => onboardingStore.generatedVideoUrl);

function handleStay() {
  onboardingStore.closeCelebration();
}

async function handleCreateOwn() {
  onboardingStore.closeCelebration();
  await router.push("/home");
}
</script>

<style lang="scss" scoped>
.celebrationModal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;

  .modalBackdrop {
    position: absolute;
    inset: 0;
    background: rgba(8, 8, 8, 0.85);
    backdrop-filter: blur(14px);
  }

  .celebrationCard {
    position: relative;
    width: 100%;
    max-width: 580px;
    background: #141414;
    border: 1px solid rgba(255, 122, 69, 0.35);
    border-radius: 18px;
    padding: 36px 32px 28px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.8), 0 0 48px rgba(255, 122, 69, 0.15);
    display: flex;
    flex-direction: column;
    gap: 22px;

    .celebrationHeader {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;

      .achievementBadge {
        display: inline-block;
        padding: 3px 12px;
        background: rgba(255, 122, 69, 0.15);
        color: #ff7a45;
        border: 1px solid rgba(255, 122, 69, 0.35);
        border-radius: 16px;
        font-size: 12px;
        font-weight: 600;
      }

      h2 {
        margin: 0;
        font-size: 22px;
        font-weight: 700;
        color: #ffffff;
      }

      .celebrationSubtitle {
        margin: 0;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.65);
        line-height: 1.5;
      }
    }

    .resultPreview {
      width: 100%;
      height: 200px;
      background: #0d0d0d;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      overflow: hidden;
      display: grid;
      place-items: center;

      .videoBox {
        width: 100%;
        height: 100%;
        video {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
      }

      .previewFallback {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        color: rgba(255, 255, 255, 0.6);
        font-size: 13px;

        .filmIcon {
          font-size: 32px;
        }
      }
    }

    .billingSummary {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 13px;

      .billingRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        color: rgba(255, 255, 255, 0.6);

        strong {
          color: #ffffff;
          font-weight: 500;
        }

        &.costRow strong {
          color: #ff9a75;
        }

        &.balanceRow {
          padding-top: 6px;
          border-top: 1px dashed rgba(255, 255, 255, 0.08);
          font-weight: 600;

          .finalBalance {
            color: #52c41a;
            font-size: 14px;
          }
        }
      }
    }

    .celebrationFooter {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding-top: 4px;
    }
  }
}
</style>

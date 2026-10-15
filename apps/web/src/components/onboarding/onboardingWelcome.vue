<template>
  <div v-if="onboardingStore.welcomeModalVisible" class="onboardingWelcome" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle">
    <div class="welcomeBackdrop" />
    <div class="welcomeCard">
      <header class="welcomeHeader">
        <span class="welcomeTag">新手导演启航</span>
        <h2 id="welcomeTitle">挑选你的首部漫剧题材</h2>
        <p class="welcomeSubtitle">挑选你喜爱的风格，我们将为你备好分镜与模型参数，带你 2 分钟亲手出片。</p>
      </header>
      <div class="themeGrid">
        <article
          v-for="theme in themes"
          :key="theme.key"
          class="themeCard"
          :class="{ isSelected: selectedKey === theme.key }"
          tabindex="0"
          role="button"
          :aria-pressed="selectedKey === theme.key"
          @click="selectedKey = theme.key"
          @keydown.enter.space.prevent="selectedKey = theme.key"
        >
          <div class="cardBadge">{{ theme.tag }}</div>
          <h3 class="cardTitle">{{ theme.title }}</h3>
          <p class="cardSubtitle">{{ theme.subtitle }}</p>
          <div class="cardCost">
            <span>实战预估：</span>
            <strong>赠送积分免费体验</strong>
          </div>
        </article>
      </div>
      <footer class="welcomeFooter">
        <uiButton variant="ghost" @click="handleSkip">
          我是老手，跳过引导
        </uiButton>
        <uiButton variant="primary" @click="handleStart">
          以此题材启航（约2分钟）
        </uiButton>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { uiButton } from "@omnistudio-next/ui";
import { useOnboardingStore, onboardingThemes, type OnboardingThemeKey, type OnboardingTheme } from "@/stores/onboardingStore";

const emit = defineEmits<{
  selectTheme: [theme: OnboardingTheme];
}>();

const onboardingStore = useOnboardingStore();
const selectedKey = ref<OnboardingThemeKey>(onboardingStore.selectedThemeKey);
const themes = computed(() => Object.values(onboardingThemes));

function handleStart() {
  onboardingStore.startGuidedOnboarding(selectedKey.value);
  emit("selectTheme", onboardingThemes[selectedKey.value]);
}

async function handleSkip() {
  await onboardingStore.skipAllOnboarding();
}
</script>

<style lang="scss" scoped>
.onboardingWelcome {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;

  .welcomeBackdrop {
    position: absolute;
    inset: 0;
    background: rgba(8, 8, 8, 0.82);
    backdrop-filter: blur(12px);
  }

  .welcomeCard {
    position: relative;
    width: 100%;
    max-width: 820px;
    background: #141414;
    border: 1px solid rgba(255, 122, 69, 0.25);
    border-radius: 16px;
    padding: 40px 36px 32px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.7), 0 0 40px rgba(255, 122, 69, 0.12);
    display: flex;
    flex-direction: column;
    gap: 28px;

    .welcomeHeader {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;

      .welcomeTag {
        display: inline-block;
        padding: 4px 12px;
        background: rgba(255, 122, 69, 0.15);
        color: #ff7a45;
        border: 1px solid rgba(255, 122, 69, 0.35);
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.08em;
      }

      h2 {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
        color: #ffffff;
      }

      .welcomeSubtitle {
        margin: 0;
        font-size: 14px;
        color: rgba(255, 255, 255, 0.65);
        max-width: 540px;
        line-height: 1.6;
      }
    }

    .themeGrid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;

      .themeCard {
        position: relative;
        padding: 22px 18px 18px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.22s ease;
        display: flex;
        flex-direction: column;
        gap: 10px;
        outline: none;

        &:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 122, 69, 0.45);
          transform: translateY(-2px);
        }

        &.isSelected {
          background: rgba(255, 122, 69, 0.08);
          border-color: #ff7a45;
          box-shadow: 0 0 20px rgba(255, 122, 69, 0.2);
        }

        .cardBadge {
          align-self: flex-start;
          font-size: 11px;
          color: #ff9a75;
          background: rgba(255, 122, 69, 0.12);
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: 500;
        }

        .cardTitle {
          margin: 0;
          font-size: 17px;
          font-weight: 600;
          color: #ffffff;
        }

        .cardSubtitle {
          margin: 0;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.55);
          line-height: 1.5;
          min-height: 36px;
        }

        .cardCost {
          margin-top: auto;
          padding-top: 10px;
          border-top: 1px dashed rgba(255, 255, 255, 0.08);
          font-size: 12px;
          color: rgba(255, 255, 255, 0.45);
          display: flex;
          align-items: baseline;
          justify-content: space-between;

          strong {
            color: #ff9a75;
            font-weight: 600;
          }
        }
      }
    }

    .welcomeFooter {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-top: 8px;
    }
  }
}

@media (max-width: 720px) {
  .onboardingWelcome .welcomeCard {
    padding: 24px 20px;

    .themeGrid {
      grid-template-columns: 1fr;
    }

    .welcomeFooter {
      flex-direction: column-reverse;
      align-items: stretch;
    }
  }
}
</style>

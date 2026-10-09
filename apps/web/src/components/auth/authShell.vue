<template>
  <main class="authPage">
    <header class="authBrand"><a :href="brandHref" aria-label="万象点点首页"><img :src="logoUrl" alt="万象点点" /></a><span>OmniStudio Next</span></header>
    <div class="authLayout">
      <aside class="storyPanel" aria-label="漫剧创作">
        <span class="storyLabel">你的故事，从这里开始</span>
        <h2>让灵感，<br /><span>落成作品。</span></h2>
        <p>从第一句构想，到最后一个镜头。<br />在自己的创作空间里，慢慢把故事做出来。</p>
        <img class="storyArtwork" :src="heroInk" alt="" />
        <div class="storyCaption"><span>创作属于你</span><span>协作，由你选择</span></div>
      </aside>
      <section class="formPanel" :aria-labelledby="headingId">
        <div class="formHeading"><span class="formEyebrow">{{ eyebrow }}</span><h1 :id="headingId"><slot name="title">{{ title }}</slot></h1><p>{{ description }}</p></div>
        <div class="authContent"><slot /></div>
      </section>
    </div>
    <footer class="authFooter"><span>© {{ new Date().getFullYear() }} 万象点点</span><span>把故事交给创作，把账户握在自己手里。</span></footer>
  </main>
</template>

<script setup lang="ts">
import { useId } from "vue";
import logoUrl from "@omnistudio-next/assets/omniStudioNextLogo.svg";
import heroInk from "@omnistudio-next/assets/illustrations/heroInk.png";
const headingId = useId();
withDefaults(defineProps<{ title: string; description: string; eyebrow?: string; brandHref?: string }>(), { eyebrow: "创作账户", brandHref: "#/auth" });
</script>

<style lang="scss" scoped>
.authPage {
  min-height: 100dvh; display: flex; flex-direction: column; background: var(--uiBackgroundBase); color: var(--uiTextPrimary); padding: clamp(12px, 2.5dvh, 24px) clamp(24px, 5vw, 80px); box-sizing: border-box;
  .authBrand { display: flex; align-items: center; justify-content: space-between; gap: 20px; min-height: 40px; a { display: flex; align-items: center; } img { width: 170px; height: auto; } > span { color: var(--uiTextMuted); font-size: 12px; letter-spacing: .08em; } }
  .authLayout { flex: 1; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(340px, .85fr); gap: clamp(48px, 7vw, 112px); width: min(1280px, 100%); margin: auto; align-items: center; padding: clamp(12px, 2.4dvh, 24px) 0;
    .storyPanel { position: relative; min-width: 0;
      .storyLabel { display: inline-block; border-left: 3px solid var(--uiActionPrimary); padding-left: 12px; color: var(--uiTextBody); font-size: var(--uiFontControl); }
      h2 { margin: clamp(12px, 2dvh, 24px) 0 12px; font-size: clamp(40px, min(5.2vw, 7dvh), 76px); font-weight: 800; line-height: 1.12; letter-spacing: -.045em; span { color: var(--uiActionPrimary); } }
      > p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontBody); line-height: 1.7; }
      .storyArtwork { display: block; width: min(100%, 640px); max-height: 32dvh; margin: clamp(12px, 2dvh, 20px) 0 12px; aspect-ratio: 3 / 2; object-fit: contain; object-position: left center; }
      .storyCaption { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid var(--uiBorderDefault); padding-top: 12px; color: var(--uiTextMuted); font-size: 12px; }
    }
    .formPanel { min-width: 0; width: 100%; max-width: 440px; justify-self: end;
      .formHeading { margin-bottom: clamp(14px, 2dvh, 24px); .formEyebrow { color: var(--uiActionPrimary); font-size: 12px; letter-spacing: .12em; } h1 { margin: 8px 0; font-size: clamp(26px, 3vw, 34px); line-height: 1.3; letter-spacing: -.025em; } p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.6; } }
      .authContent { display: grid; gap: clamp(12px, 1.6dvh, 20px);
        :deep(.authForm) { display: grid; gap: clamp(10px, 1.6dvh, 18px); > fieldset { gap: inherit; } }
        :deep(.authInput) { min-height: 44px; width: 100%; border-radius: var(--uiRadiusBase, 8px); }
        :deep(.submitButton) { width: 100%; min-height: 44px; margin-top: 4px; font-weight: 600; }
        :deep(.authHint) { margin: 4px 0 0; color: var(--uiTextMuted); font-size: 12px; line-height: 1.5; }
        :deep(.authLinks) { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; color: var(--uiTextMuted); font-size: var(--uiFontControl); a { color: var(--uiActionPrimary); text-decoration: none; } a:hover { text-decoration: underline; } }
        :deep(.errorMessage) { margin: 0; padding: 12px; border: 1px solid color-mix(in srgb, var(--uiStatusError) 40%, transparent); border-radius: 8px; color: var(--uiStatusError); background: color-mix(in srgb, var(--uiStatusError) 8%, transparent); font-size: var(--uiFontControl); line-height: 1.65; }
        :deep(.invitationNote) { margin: 0; padding: 12px; border-left: 3px solid var(--uiActionPrimary); color: var(--uiTextBody); background: var(--uiBackgroundSubtle); font-size: var(--uiFontControl); line-height: 1.6; }
      }
    }
  }
  .authFooter { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid var(--uiBorderDefault); padding-top: clamp(8px, 1.5dvh, 16px); color: var(--uiTextMuted); font-size: 12px; }
  @media (max-height: 800px) { padding-block: 12px; .authBrand { min-height: 36px; } .authLayout { padding-block: 12px; .formPanel { .formHeading { margin-bottom: 12px; } .authContent { gap: 10px; :deep(.authForm) { gap: 10px; } } } } .authFooter { padding-top: 8px; } }
  @media (max-width: 900px) { .authLayout { grid-template-columns: minmax(0, 1fr) minmax(320px, 1fr); gap: 40px; .storyPanel h2 { font-size: 48px; } } }
  @media (max-width: 700px) { padding-inline: 20px; .authBrand > span { display: none; } .authLayout { display: block; .storyPanel { display: none; } .formPanel { max-width: 440px; margin: 0 auto; } } .authFooter { justify-content: center; > span:last-child { display: none; } } }
}
</style>

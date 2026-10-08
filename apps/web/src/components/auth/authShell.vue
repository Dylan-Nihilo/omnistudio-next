<template>
  <main class="hello">
    <section class="welcomePanel" aria-labelledby="welcomeTitle">
      <a class="welcomeBrand" :href="brandHref" aria-label="OmniStudio"><img :src="logoUrl" alt="OmniStudio" /></a>
      <div class="welcomeContent">
        <span class="welcomeLabel">{{ eyebrow }}</span>
        <h1 id="welcomeTitle"><slot name="title">{{ title }}</slot></h1>
        <p class="description">{{ description }}</p>
        <div class="authContent"><slot /></div>
      </div>
      <footer class="pageFooter"><p>© {{ new Date().getFullYear() }} Toonflow · 保留所有权利。</p></footer>
    </section>
    <aside class="artPanel" aria-hidden="true"><img class="artwork" :src="heroInk" alt="" /></aside>
  </main>
</template>

<script setup lang="ts">
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
import heroInk from "@toonflow/assets/illustrations/heroInk.png";

withDefaults(defineProps<{
  title: string;
  description: string;
  eyebrow?: string;
  brandHref?: string;
}>(), { eyebrow: "漫剧创作", brandHref: "#/auth" });
</script>

<style lang="scss" scoped>
.hello {
  display: grid; grid-template-columns: minmax(420px, 0.95fr) minmax(0, 1.05fr); min-height: 100dvh; background: var(--uiBackgroundBase); color: var(--uiTextPrimary);
  .welcomePanel {
    display: flex; flex-direction: column; min-width: 0; min-height: 720px; gap: 32px; padding: 28px clamp(32px, 4.4vw, 72px) 32px; border-right: 1px solid var(--uiBorderDefault);
    .welcomeBrand { display: block; width: 196px; max-width: 100%; img { display: block; width: 100%; height: auto; border-radius: 8px; background: #101010; } }
    .welcomeContent { width: 100%; max-width: 460px; margin: auto 0;
      .welcomeLabel { display: inline-flex; min-height: 28px; align-items: center; padding: 4px 12px; margin-bottom: 28px; transform: rotate(-2deg); border-radius: 2px; color: var(--uiTextOnAccent); background: var(--uiActionPrimary); font-size: var(--uiFontControl); font-weight: 600; }
      h1 { margin: 0 0 20px; font-size: clamp(36px, 3.8vw, 48px); line-height: 1.2; font-weight: 900; letter-spacing: -1px; }
      .description { max-width: 40ch; margin: 0 0 32px; color: var(--uiTextBody); font-size: var(--uiFontBody); line-height: 1.8; }
      .authContent { display: grid; gap: 16px; :deep(.authForm) { display: grid; gap: 16px; } :deep(.loginButton) { width: 100%; } :deep(.secondaryActions) { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 4px; } :deep(.secondaryActions a) { color: var(--uiActionPrimary); font-size: var(--uiFontControl); text-decoration: none; } :deep(.secondaryActions a:hover) { text-decoration: underline; } :deep(.errorMessage) { margin: 0; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--uiStatusError) 45%, transparent); border-radius: var(--uiRadiusControl); color: var(--uiStatusError); background: color-mix(in srgb, var(--uiStatusError) 10%, transparent); font-size: var(--uiFontControl); line-height: 1.5; } }
    }
    .pageFooter { color: var(--uiTextMuted); font-size: var(--uiFontControl); p { margin: 0; line-height: 1.6; } }
  }
  .artPanel { display: flex; align-items: center; justify-content: center; min-width: 0; padding: 28px; background: #101010; overflow: hidden; .artwork { display: block; width: 100%; height: auto; object-fit: contain; aspect-ratio: 3 / 2; } }
  @media (max-width: 1100px) { grid-template-columns: minmax(420px, 1.1fr) minmax(0, 0.9fr); .welcomePanel { padding-inline: 32px; } .artPanel { padding: 12px; } }
  @media (max-width: 760px) { grid-template-columns: minmax(0, 1fr); .welcomePanel { min-height: 100dvh; padding: 24px 20px; border: 0; .welcomeContent { margin: auto; } } .artPanel { display: none; } }
}
</style>

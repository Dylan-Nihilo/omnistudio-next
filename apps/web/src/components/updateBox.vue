<template>
  <uiDialog v-model="visible" title="更新说明" :width="680" destroyOnClose :closeOnClickModal="false" @opened="emit('opened')" @close="emit('close')">
    <div class="updateBody"><header class="updateHeader"><img class="brandLogo" :src="logoUrl" alt="omnistudio-next" /><div class="versionInfo"><strong>v{{ version }}</strong><div class="buildInfo"><span>构建代码</span><code>{{ buildCode }}</code></div></div></header><img class="buildArtwork" :src="heroInk" alt="" aria-hidden="true" /><section class="releaseSection" aria-label="更新内容"><h3>更新内容</h3><div class="releaseContent" tabindex="0" role="region" aria-label="Markdown 更新说明"><messageMarkdown v-if="markdown.trim()" :content="markdown" /></div></section></div>
    <template #footer><uiButton :icon="IconArrowRight" @click="visible = false">开始使用</uiButton></template>
  </uiDialog>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { uiDialog, uiButton } from "@omnistudio-next/ui";
import { IconArrowRight } from "@tabler/icons-vue";
import logoUrl from "@omnistudio-next/assets/omniStudioNextLogo.svg";
import heroInk from "@omnistudio-next/assets/illustrations/heroInk.png";
import updateNotes from "./updateBox.md?raw";

const visible = defineModel<boolean>({ default: false });
const emit = defineEmits<{ opened: []; close: [] }>();
const { version, buildCode, markdown = updateNotes } = defineProps<{ version: string; buildCode: string; markdown?: string }>();
const messageMarkdown = defineAsyncComponent(() => import("./messageMarkdown.vue"));
</script>

<style lang="scss" scoped>
.updateBody { display: flex; flex-direction: column; gap: 24px; min-width: 0; .updateHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 20px; .brandLogo { display: block; width: 168px; height: auto; max-width: 100%; background: #101010; border-radius: var(--uiRadiusControl); } .versionInfo { min-width: 0; strong { color: var(--uiTextPrimary); font-size: var(--uiFontTitle); font-weight: 600; } .buildInfo { display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px; margin-top: 8px; color: var(--uiTextMuted); font-size: var(--uiFontControl); code { overflow-wrap: anywhere; } } } } .buildArtwork { display: block; width: 100%; height: 180px; object-fit: cover; background: #101010; border-radius: var(--uiRadiusCard); } .releaseSection { min-width: 0; h3 { margin: 0 0 16px; font-size: var(--uiFontLabel); font-weight: 600; } .releaseContent { max-height: 30dvh; min-height: 120px; overflow: auto; overscroll-behavior: contain; color: var(--uiTextBody); font-size: var(--uiFontControl); line-height: 1.8; :deep(h1), :deep(h2), :deep(h3), :deep(h4) { font-size: var(--uiFontLabel); line-height: 1.7; } :deep(img) { max-width: 100%; } } } }
</style>

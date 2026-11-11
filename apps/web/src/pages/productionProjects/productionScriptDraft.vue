<template>
  <section class="scriptDraft" aria-label="模型生成草案">
    <header class="draftHeader">
      <div><span class="draftEyebrow">模型生成草案 · 可编辑</span><h3>检查你的故事</h3></div>
      <div class="draftSummary"><span>{{ draft.episodes.length }} 集</span><span>{{ sceneCount }} 场景</span><span>{{ shotCount }} 镜头</span><span>{{ draft.assets.length }} 项资产</span><small v-if="props.usage">{{ props.usage.total }} tokens</small></div>
    </header>

    <div class="draftWorkspace">
      <aside class="draftSidebar">
        <div class="draftSidebarHeading"><strong>草案目录</strong><span>{{ draft.episodes.length }} 集</span></div>
        <nav class="draftNavigation" aria-label="草案集数与镜头目录">
          <button type="button" class="draftNavItem" :class="{ active: activeSection === 'draftOutline' }" :aria-current="activeSection === 'draftOutline' ? 'location' : undefined" @click="scrollToSection('draftOutline')"><icon-align-left :size="16" aria-hidden="true" /><span>全剧梗概</span></button>
          <section v-for="group in episodeGroups" :key="group.episode.episodeNumber" class="draftEpisodeGroup">
            <div class="draftEpisodeHeading" :class="{ active: activeSection === episodeSectionId(group.episode.episodeNumber) }">
              <button type="button" class="draftEpisodeToggle" :aria-label="`${collapsedEpisodes[group.episode.episodeNumber] ? '展开' : '收起'}第 ${group.episode.episodeNumber} 集镜头`" :aria-expanded="!collapsedEpisodes[group.episode.episodeNumber]" :aria-controls="`draftNavEpisode${group.episode.episodeNumber}`" @click="collapsedEpisodes[group.episode.episodeNumber] = !collapsedEpisodes[group.episode.episodeNumber]"><icon-chevron-down :size="14" :class="{ collapsed: collapsedEpisodes[group.episode.episodeNumber] }" aria-hidden="true" /></button>
              <button type="button" class="draftEpisodeLink" :aria-current="activeSection === episodeSectionId(group.episode.episodeNumber) ? 'location' : undefined" @click="scrollToSection(episodeSectionId(group.episode.episodeNumber))"><strong>第 {{ group.episode.episodeNumber }} 集</strong><small>{{ group.episode.title }}</small></button>
              <span class="draftEpisodeCount">{{ group.shots.length }}</span>
            </div>
            <div v-show="!collapsedEpisodes[group.episode.episodeNumber]" :id="`draftNavEpisode${group.episode.episodeNumber}`" class="draftShotNavigation">
              <button v-for="item in group.shots" :key="item.sectionId" type="button" class="draftShotLink" :class="{ active: activeSection === item.sectionId }" :aria-current="activeSection === item.sectionId ? 'location' : undefined" :aria-label="`第 ${group.episode.episodeNumber} 集 镜头 ${item.index} 场 ${item.sceneNumber}`" @click="scrollToSection(item.sectionId)"><span class="draftShotNumber">{{ String(item.index).padStart(2, '0') }}</span><span>镜头 {{ item.index }}<small>场 {{ String(item.sceneNumber).padStart(2, '0') }} · {{ item.shot.shotType }}</small></span><small>{{ formatSeconds(item.shot.durationMs) }}s</small></button>
            </div>
          </section>
          <button type="button" class="draftNavItem assetNavItem" :class="{ active: activeSection === 'draftAssets' }" :aria-current="activeSection === 'draftAssets' ? 'location' : undefined" @click="scrollToSection('draftAssets')"><icon-box :size="16" aria-hidden="true" /><span>主体资产</span><small>{{ draft.assets.length }}</small></button>
        </nav>
      </aside>

      <div ref="contentElement" class="draftContent" role="region" aria-label="可编辑剧本草案" tabindex="0" @scroll="updateActiveSection">
        <article id="draftOutline" :ref="element => setSectionElement('draftOutline', element)" class="draftOutline">
          <div class="draftSectionHeading"><span class="draftEyebrow">故事总览</span><h4>全剧梗概</h4></div>
          <uiField label="全剧梗概"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="logline" :rows="4" resize="vertical" /></template></uiField>
        </article>

        <article v-for="group in episodeGroups" :key="group.episode.episodeNumber" class="draftEpisode">
          <div :id="episodeSectionId(group.episode.episodeNumber)" :ref="element => setSectionElement(episodeSectionId(group.episode.episodeNumber), element)" class="draftEpisodeBody">
            <div class="draftSectionHeading"><span class="draftEyebrow">第 {{ group.episode.episodeNumber }} 集</span><h4>{{ group.episode.title }}</h4><small>{{ group.shots.length }} 个镜头 · {{ formatSeconds(group.episode.targetDurationMs) }} 秒</small></div>
            <uiField :label="`第 ${group.episode.episodeNumber} 集标题`"><template #default="{ id }"><uiInput :id="id" v-model.trim="group.episode.title" /></template></uiField>
            <uiField :label="`第 ${group.episode.episodeNumber} 集 · 剧本正文`"><template #default="{ id }"><uiTextarea :id="id" v-model="group.episode.body" :rows="12" resize="vertical" placeholder="场景、出场人物、动作、对白和旁白。旧草稿可在此补充完整正文。" /></template></uiField>
          </div>
          <section v-for="scene in group.episode.scenes" :key="scene.sceneNumber" class="draftScene">
            <div class="draftSceneHeading"><span>场 {{ String(scene.sceneNumber).padStart(2, '0') }}</span><strong>{{ scene.title }}</strong><small>{{ scene.shots.length }} 个镜头</small></div>
            <div class="draftSceneFields"><uiField :label="`第 ${group.episode.episodeNumber} 集场景 ${scene.sceneNumber}`"><template #default="{ id }"><uiInput :id="id" v-model.trim="scene.title" /></template></uiField><uiField label="场景与连续性"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="scene.continuityNotes" :rows="2" resize="vertical" /></template></uiField></div>
            <article v-for="shot in scene.shots" :id="shotSectionId(group.episode.episodeNumber, scene.sceneNumber, shot.shotNumber)" :key="shot.shotNumber" :ref="element => setSectionElement(shotSectionId(group.episode.episodeNumber, scene.sceneNumber, shot.shotNumber), element)" class="draftShot" :class="{ selected: activeSection === shotSectionId(group.episode.episodeNumber, scene.sceneNumber, shot.shotNumber) }">
              <header class="draftShotHeading"><strong>镜头 {{ shotIndex(group.episode.episodeNumber, scene.sceneNumber, shot.shotNumber) }}</strong><span>{{ shot.shotType }}</span><small>{{ formatSeconds(shot.durationMs) }} 秒</small></header>
              <div class="draftShotAssetFields"><uiField label="角色"><template #default="{ id }"><uiSelect :id="id" :modelValue="shot.characterNames" :options="assetOptions('character')" multiple filterable placeholder="选择本镜头角色" @update:modelValue="value => updateNames(shot.characterNames, value)" /></template></uiField><uiField label="道具"><template #default="{ id }"><uiSelect :id="id" :modelValue="shot.propNames" :options="assetOptions('prop')" multiple filterable placeholder="选择本镜头道具" @update:modelValue="value => updateNames(shot.propNames, value)" /></template></uiField></div>
              <uiField label="画面提示"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shot.prompt" :rows="4" resize="vertical" /></template></uiField>
              <div class="draftShotTextFields"><uiField label="对白"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shot.dialogue" :rows="3" resize="vertical" /></template></uiField><uiField label="旁白"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shot.narration" :rows="3" resize="vertical" /></template></uiField></div>
              <uiField label="音效"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="shot.soundEffects" :rows="2" resize="vertical" placeholder="环境声、动作声或配乐提示" /></template></uiField>
            </article>
          </section>
        </article>

        <section id="draftAssets" :ref="element => setSectionElement('draftAssets', element)" class="draftAssets">
          <div class="draftSectionHeading"><span class="draftEyebrow">一致性资料</span><h4>主体资产草案</h4></div>
          <div class="draftAssetList"><article v-for="(asset, index) in draft.assets" :key="index" class="draftAsset"><header><span>{{ assetTypeLabel(asset.assetType) }}</span><strong>{{ asset.name }}</strong></header><uiField label="名称"><template #default="{ id }"><uiInput :id="id" v-model.trim="asset.name" /></template></uiField><uiField label="设定"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="asset.description" :rows="3" resize="vertical" /></template></uiField><uiField label="视觉约定"><template #default="{ id }"><uiTextarea :id="id" v-model.trim="asset.visualDescription" :rows="4" resize="vertical" /></template></uiField></article></div>
        </section>
      </div>
    </div>

    <footer class="draftFooter"><span>确认后一次性写入生产项目；模型任务按实际 token 用量结算。</span><uiButton :loading="props.confirming" :disabled="props.confirming || props.canConfirm === false || !draft.episodes.length" @click="emit('confirm')">确认并进入主体资产</uiButton></footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, type ComponentPublicInstance } from "vue";
import { IconAlignLeft, IconBox, IconChevronDown } from "@tabler/icons-vue";
import { uiButton, uiField, uiInput, uiSelect, uiTextarea } from "@omnistudio-next/ui";
import type { ScriptGenerationResult } from "@/lib/productionScriptCreation";

const props = defineProps<{ usage: { total: number } | null; confirming: boolean; canConfirm?: boolean }>();
const emit = defineEmits<{ confirm: [] }>();
const draft = defineModel<ScriptGenerationResult>({ required: true });
const logline = computed({ get: () => draft.value.logline, set: (value: string) => { draft.value = { ...draft.value, logline: value }; } });
const contentElement = ref<HTMLElement>();
const sectionElements = new Map<string, HTMLElement>();
const activeSection = ref("draftOutline");
const collapsedEpisodes = reactive<Record<number, boolean>>({});
const sceneCount = computed(() => draft.value.episodes.reduce((count, episode) => count + episode.scenes.length, 0));
const episodeGroups = computed(() => draft.value.episodes.map(episode => ({
  episode,
  shots: episode.scenes.flatMap(scene => scene.shots.map(shot => ({ shot, sceneNumber: scene.sceneNumber, sectionId: shotSectionId(episode.episodeNumber, scene.sceneNumber, shot.shotNumber) }))).map((shot, index) => ({ ...shot, index: index + 1 })),
})));
const shotCount = computed(() => episodeGroups.value.reduce((count, group) => count + group.shots.length, 0));

function episodeSectionId(episodeNumber: number) { return `draftEpisode${episodeNumber}`; }
function shotSectionId(episodeNumber: number, sceneNumber: number, shotNumber: number) { return `draftEpisode${episodeNumber}Scene${sceneNumber}Shot${shotNumber}`; }
function shotIndex(episodeNumber: number, sceneNumber: number, shotNumber: number) {
  return episodeGroups.value.find(group => group.episode.episodeNumber === episodeNumber)?.shots.find(item => item.sceneNumber === sceneNumber && item.shot.shotNumber === shotNumber)?.index ?? shotNumber;
}
function formatSeconds(value: number) { return (value / 1000).toFixed(2); }
function assetTypeLabel(value: string) { return value === "character" ? "角色" : value === "scene" ? "场景" : "道具"; }
function assetOptions(assetType: "character" | "prop") { return draft.value.assets.filter(asset => asset.assetType === assetType).map(asset => ({ label: asset.name, value: asset.name })); }
function updateNames(target: string[], value: unknown) { target.splice(0, target.length, ...(Array.isArray(value) ? value.filter((name): name is string => typeof name === "string") : [])); }
function setSectionElement(id: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) sectionElements.set(id, element);
  else sectionElements.delete(id);
}
function scrollToSection(id: string) {
  const content = contentElement.value;
  const section = sectionElements.get(id);
  if (!content || !section) return;
  const top = section.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 20;
  content.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  activeSection.value = id;
}
function updateActiveSection() {
  const content = contentElement.value;
  if (!content) return;
  const top = content.getBoundingClientRect().top + 65;
  const sections = [...sectionElements.entries()].sort((left, right) => left[1].getBoundingClientRect().top - right[1].getBoundingClientRect().top);
  const visible = sections.filter(([, element]) => element.getBoundingClientRect().top <= top).at(-1);
  if (visible) activeSection.value = visible[0];
}
</script>

<style scoped lang="scss">
.scriptDraft {
  overflow: hidden;
  border: 1px solid var(--uiBorderDefault);
  border-radius: 14px;
  color: var(--uiTextBody);
  background: var(--uiSurfaceRaised);
  .draftEyebrow { color: var(--uiTextMuted); font-size: 11px; letter-spacing: .04em; }
  .draftHeader {
    display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 21px 24px; border-bottom: 1px solid var(--uiBorderDefault);
    h3 { margin: 6px 0 0; color: var(--uiTextPrimary); font-size: 19px; font-weight: 600; }
    .draftSummary { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; font-size: 12px; span { padding: 5px 8px; border-radius: 5px; background: var(--uiBackgroundSubtle); } small { width: 100%; color: var(--uiTextMuted); text-align: right; font-size: 10px; } }
  }
  .draftWorkspace {
    display: grid; grid-template-columns: 210px minmax(0, 1fr); min-height: 450px;
    .draftSidebar {
      min-width: 0; max-height: 75vh; overflow-y: auto; border-right: 1px solid var(--uiBorderDefault); background: var(--uiBackgroundSubtle); scrollbar-width: thin;
      .draftSidebarHeading { display: flex; align-items: center; justify-content: space-between; padding: 19px 16px 14px; strong { font-size: 12px; } span { color: var(--uiTextMuted); font-size: 10px; } }
      .draftNavigation {
        display: grid; gap: 8px; padding: 0 8px 18px;
        button { color: var(--uiTextBody); cursor: pointer; font: inherit; &:focus-visible { outline: 2px solid var(--uiActionPrimary); outline-offset: -2px; } }
        .draftNavItem { display: flex; align-items: center; gap: 9px; width: 100%; padding: 11px 10px; border: 0; border-radius: 7px; background: transparent; text-align: left; font-size: 12px; &:hover { background: var(--uiSurfaceRaised); } &.active { color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 9%, transparent); } small { margin-left: auto; color: var(--uiTextMuted); font-size: 10px; } }
        .draftEpisodeGroup {
          min-width: 0;
          .draftEpisodeHeading { display: flex; align-items: center; min-width: 0; border-radius: 7px; &.active { background: color-mix(in srgb, var(--uiActionPrimary) 9%, transparent); } .draftEpisodeToggle { display: grid; place-items: center; align-self: stretch; flex: 0 0 26px; padding: 0; border: 0; border-radius: 5px; color: var(--uiTextMuted); background: transparent; svg { transition: transform .15s; &.collapsed { transform: rotate(-90deg); } } } .draftEpisodeLink { display: grid; gap: 4px; flex: 1; min-width: 0; padding: 10px 0; border: 0; background: transparent; text-align: left; strong { font-size: 12px; font-weight: 600; } small { overflow: hidden; color: var(--uiTextMuted); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; } } .draftEpisodeCount { margin: 0 9px; color: var(--uiTextMuted); font-size: 10px; } }
          .draftShotNavigation { display: grid; gap: 3px; margin: 3px 0 6px 18px; padding-left: 7px; border-left: 1px solid var(--uiBorderDefault); .draftShotLink { display: flex; align-items: center; gap: 8px; width: 100%; min-width: 0; padding: 9px 6px; border: 0; border-radius: 6px; background: transparent; text-align: left; font-size: 11px; &:hover { background: var(--uiSurfaceRaised); } &.active { color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 10%, transparent); } .draftShotNumber { flex: 0 0 19px; color: var(--uiTextMuted); font-family: ui-monospace, monospace; font-size: 10px; } > span:nth-child(2) { display: grid; gap: 4px; min-width: 0; small { overflow: hidden; color: var(--uiTextMuted); text-overflow: ellipsis; white-space: nowrap; font-size: 9px; } } > small { flex: 0 0 auto; margin-left: auto; color: var(--uiTextMuted); font-size: 9px; font-variant-numeric: tabular-nums; } } }
        }
        .assetNavItem { margin-top: 6px; border-top: 1px solid var(--uiBorderDefault); border-radius: 0; }
      }
    }
    .draftContent {
      min-width: 0; height: 75vh; min-height: 450px; overflow-y: auto; padding: 24px; scrollbar-width: thin; scrollbar-color: var(--uiBorderDefault) transparent;
      &:focus-visible { outline: 2px solid var(--uiActionPrimary); outline-offset: -2px; }
      .draftSectionHeading { display: grid; gap: 6px; margin-bottom: 18px; h4 { margin: 0; color: var(--uiTextPrimary); font-size: 21px; line-height: 1.4; overflow-wrap: anywhere; } > small { color: var(--uiTextMuted); font-size: 11px; } }
      .draftOutline { padding-bottom: 24px; }
      .draftEpisode {
        padding-top: 24px; border-top: 1px solid var(--uiBorderDefault);
        .draftEpisodeBody { display: grid; gap: 14px; padding-bottom: 24px; .draftSectionHeading { margin-bottom: 2px; } }
        .draftScene {
          padding-top: 10px;
          .draftSceneHeading { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; margin-bottom: 14px; > span { padding: 4px 7px; border-radius: 4px; color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 9%, transparent); font-size: 10px; } > strong { color: var(--uiTextPrimary); font-size: 13px; } > small { margin-left: auto; color: var(--uiTextMuted); font-size: 10px; } }
          .draftSceneFields { display: grid; gap: 12px; padding: 0 0 18px; }
          .draftShot {
            display: grid; gap: 14px; margin-bottom: 18px; padding: 20px; border: 1px solid var(--uiBorderDefault); border-radius: 10px; background: var(--uiBackgroundSubtle); transition: border-color .15s;
            &.selected { border-color: color-mix(in srgb, var(--uiActionPrimary) 55%, var(--uiBorderDefault)); }
            .draftShotHeading { display: flex; align-items: center; gap: 10px; padding-bottom: 13px; border-bottom: 1px solid var(--uiBorderDefault); strong { color: var(--uiActionPrimary); font-size: 13px; } span, small { color: var(--uiTextMuted); font-size: 11px; } small { margin-left: auto; font-variant-numeric: tabular-nums; } }
            .draftShotAssetFields, .draftShotTextFields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
          }
        }
      }
      .draftAssets {
        padding-top: 24px; border-top: 1px solid var(--uiBorderDefault);
        .draftAssetList { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; .draftAsset { display: grid; align-content: start; gap: 13px; min-width: 0; padding: 18px; border: 1px solid var(--uiBorderDefault); border-radius: 9px; header { display: flex; align-items: center; gap: 8px; span { color: var(--uiActionPrimary); font-size: 10px; } strong { color: var(--uiTextPrimary); font-size: 13px; overflow-wrap: anywhere; } } } }
      }
      :deep(textarea) { line-height: 1.75; }
    }
  }
  .draftFooter { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 16px 24px; border-top: 1px solid var(--uiBorderDefault); span { color: var(--uiTextMuted); font-size: 11px; line-height: 1.7; } .uiButton { flex: 0 0 auto; } }
}
@media (max-width: 860px) {
  .scriptDraft .draftWorkspace { grid-template-columns: 180px minmax(0, 1fr); .draftContent { padding: 18px; .draftAssets .draftAssetList { grid-template-columns: minmax(0, 1fr); } .draftEpisode .draftScene .draftShot { padding: 16px; .draftShotTextFields { grid-template-columns: minmax(0, 1fr); } } } }
}
@media (max-width: 620px) {
  .scriptDraft {
    .draftHeader { align-items: flex-start; flex-direction: column; padding: 18px; .draftSummary { justify-content: flex-start; small { width: auto; } } }
    .draftWorkspace { grid-template-columns: minmax(0, 1fr); .draftSidebar { max-height: 220px; border-right: 0; border-bottom: 1px solid var(--uiBorderDefault); } .draftContent { min-height: 420px; height: 70vh; padding: 16px; .draftEpisode .draftScene .draftShot { padding: 12px; .draftShotAssetFields { grid-template-columns: minmax(0, 1fr); } } } }
    .draftFooter { align-items: stretch; flex-direction: column; gap: 12px; padding: 16px; }
  }
}
@media (prefers-reduced-motion: reduce) { .scriptDraft .draftWorkspace .draftSidebar .draftNavigation .draftEpisodeGroup .draftEpisodeHeading .draftEpisodeToggle svg, .scriptDraft .draftWorkspace .draftContent .draftEpisode .draftScene .draftShot { transition: none; } }
</style>

<template>
  <uiPopover v-model:visible="visible" class="productionPicker" placement="top-start" :width="760" :block="block" :disabled="disabled" role="dialog" :aria-label="kind === 'style' ? '风格选择' : '题材设定'">
    <template #reference="{ triggerAttrs }">
      <button :id="id" type="button" class="pickerTrigger" :class="{ block }" :disabled="disabled" v-bind="triggerAttrs"><span class="settingGlyph" aria-hidden="true"><icon-palette v-if="kind === 'style'" :size="16" /><icon-category-2 v-else :size="16" /></span><span>{{ summary }}</span><icon-chevron-down :size="14" aria-hidden="true" /></button>
    </template>
    <div class="visualPicker">
      <div class="pickerHeader">
        <div class="pickerTabs" role="tablist" :aria-label="kind === 'style' ? '风格分类' : '题材类别'">
          <template v-if="kind === 'genre'"><button type="button" role="tab" :aria-selected="genreTab === 'main'" :class="{ active: genreTab === 'main' }" @click="genreTab = 'main'; detailGenre = undefined">主题材</button><button type="button" role="tab" :aria-selected="genreTab === 'fusion'" :aria-disabled="isDefaultGenre" :class="{ active: genreTab === 'fusion' }" :disabled="isDefaultGenre" :title="isDefaultGenre ? '默认题材不支持融合，请先选择具体主题材' : undefined" @click="openFusionTab">融合题材</button></template>
          <template v-else><button v-for="tab in styleTabs" :key="tab.value" type="button" role="tab" :aria-selected="styleTab === tab.value" :class="{ active: styleTab === tab.value }" @click="styleTab = tab.value; detailStyle = undefined">{{ tab.label }}</button></template>
        </div>
        <uiIconButton size="small" :icon="IconX" :label="kind === 'style' ? '关闭风格选择' : '关闭题材选择'" @click="visible = false" />
      </div>
      <template v-if="kind === 'genre' ? !detailGenre : !detailStyle">
      <div class="pickerFilters">
        <div v-if="kind === 'style'" class="pickerTabs compact"><button v-for="filter in styleFilters" :key="filter.value" type="button" :class="{ active: styleFilter === filter.value }" :aria-pressed="styleFilter === filter.value" @click="styleFilter = filter.value">{{ filter.label }}</button></div>
        <div class="pickerSearch"><icon-search :size="17" aria-hidden="true" /><input v-model.trim="query" class="pickerSearchInput" type="search" :aria-label="kind === 'style' ? '搜索风格' : '搜索题材'" :placeholder="kind === 'style' ? '搜索风格、题材或关键词' : '搜索题材名称或关键词'" autocomplete="off" /><uiIconButton v-if="query" class="clearSearchButton" size="small" :icon="IconX" label="清空搜索" @click="query = ''" /></div>
      </div>
      <div v-if="kind === 'genre'" class="pickerFilters genreFilters">
        <div class="pickerTabs compact genreCategoryFilters" role="group" aria-label="题材分类"><button v-for="filter in genreFilters" :key="filter.value" type="button" :class="{ active: genreFilter === filter.value }" :aria-pressed="genreFilter === filter.value" @click="genreFilter = filter.value">{{ filter.label }}</button></div>
        <p v-if="isDefaultGenre && genreTab === 'main'" class="fusionHint">默认题材按用户故事自由分析，不能与融合题材组合。</p>
        <p v-else-if="genreTab === 'fusion'" class="fusionHint">可多选，与主题材共同保存为创作设定。</p>
      </div>
      <div class="optionCardGrid">
        <div v-for="option in filteredOptions" :key="option.value" class="optionCardWrap">
          <button type="button" class="imageOptionCard" :class="{ selected: isSelected(option.value) }" :aria-pressed="isSelected(option.value)" @click="chooseOption(option.value)"><img :src="option.image" :alt="option.label" :style="{ objectPosition: option.objectPosition }" loading="lazy" /><span>{{ option.label }}</span><small v-if="option.subtitle">{{ option.subtitle }}</small><icon-check v-if="isSelected(option.value)" class="optionCheck" :size="16" aria-hidden="true" /></button>
          <uiIconButton v-if="kind === 'style'" class="favoriteButton" size="small" :icon="favorites.includes(option.value) ? IconStarFilled : IconStar" :label="favorites.includes(option.value) ? `取消收藏 ${option.label}` : `收藏 ${option.label}`" @click="toggleFavorite(option.value)" />
          <button v-if="kind === 'style'" type="button" class="promptButton" :aria-label="`查看 ${option.label} 提示词`" @click="detailStyle = findProductionStyle(option.value)">查看提示词 <span aria-hidden="true">↗</span></button>
          <button v-if="kind === 'genre'" type="button" class="promptButton" :aria-label="`查看 ${option.label} 提示词`" @click="openGenreDetail(option.value)">查看提示词 <span aria-hidden="true">↗</span></button>
        </div>
      </div>
      <p v-if="!filteredOptions.length" class="pickerEmpty">{{ kind === 'style' ? '当前分类暂无风格。' : '没有匹配的题材。' }}</p>
      <div v-if="kind === 'genre'" class="pickerFooter"><span>{{ summary }}</span><uiButton size="small" @click="visible = false">确认</uiButton></div>
      </template>
      <template v-else>
        <div v-if="kind === 'style' && detailStyle" class="styleDetail">
          <div class="detailIntro">
            <img :src="detailStyle.thumbnail" :alt="detailStyle.nameZh" :style="{ objectPosition: detailStyle.objectPosition }" />
            <div><span class="detailCategory">{{ productionStyleCategories.find(category => category.id === detailStyle?.category)?.nameZh }}</span><h3>{{ detailStyle.nameZh }}</h3><small>{{ detailStyle.name }}</small><p>{{ detailStyle.description }}</p></div>
          </div>
          <div class="styleSuitability"><p><strong>适用题材</strong>{{ detailStyle.bestFor.join('、') }}</p><p><strong>不建议用于</strong>{{ detailStyle.avoidFor.join('、') }}</p></div>
          <div class="promptSection"><h4>正向提示词</h4><p lang="en">{{ detailStyle.positivePrompt }}</p></div>
          <div class="promptSection"><h4>负向提示词</h4><p lang="en">{{ detailStyle.negativePrompt }}</p></div>
          <div class="promptSection"><h4>示例提示词</h4><p lang="en">{{ detailStyle.samplePrompt }}</p></div>
        </div>
        <div v-else-if="kind === 'genre' && detailGenre" class="styleDetail genreDetail">
          <div class="detailIntro">
            <img :src="detailGenre.thumbnail" :alt="detailGenre.nameZh" />
            <div><span class="detailCategory">{{ genreCategoryName(detailGenre.category) }} · {{ detailGenre.nameZh }}</span><h3>{{ detailGenre.nameZh }}</h3><small>{{ detailGenre.subtitleZh }}</small><p>{{ detailGenre.description }}</p><p class="sourceNote">配图由 GPT Image 2 原创生成；提示词为原创模板。</p></div>
          </div>
          <div class="genreKeywords"><span v-for="keyword in detailGenre.keywords" :key="keyword">{{ keyword }}</span></div>
          <div class="promptSection"><div class="promptSectionHeader"><h4>剧本创作提示词</h4><uiButton size="small" variant="secondary" @click="copyGenrePrompt('storyPrompt', detailGenre.storyPrompt)">{{ copiedPrompt === 'storyPrompt' ? '已复制' : '复制' }}</uiButton></div><p>{{ detailGenre.storyPrompt }}</p></div>
          <div class="promptSection"><div class="promptSectionHeader"><h4>配图提示词</h4><uiButton size="small" variant="secondary" @click="copyGenrePrompt('imagePrompt', detailGenre.imagePrompt)">{{ copiedPrompt === 'imagePrompt' ? '已复制' : '复制' }}</uiButton></div><p lang="en">{{ detailGenre.imagePrompt }}</p></div>
          <div class="promptSection"><div class="promptSectionHeader"><h4>创作约束</h4><uiButton size="small" variant="secondary" @click="copyGenrePrompt('negativePrompt', detailGenre.negativePrompt)">{{ copiedPrompt === 'negativePrompt' ? '已复制' : '复制' }}</uiButton></div><p>{{ detailGenre.negativePrompt }}</p></div>
          <p v-if="copyError" class="copyError" role="alert">{{ copyError }}</p>
        </div>
        <div v-if="kind === 'style' && detailStyle" class="pickerFooter"><uiButton size="small" variant="secondary" @click="detailStyle = undefined">返回风格列表</uiButton><uiButton size="small" @click="chooseOption(detailStyle.nameZh)">使用此风格</uiButton></div>
        <div v-else-if="kind === 'genre' && detailGenre" class="pickerFooter"><uiButton size="small" variant="secondary" @click="detailGenre = undefined; copyError = ''">返回题材列表</uiButton><uiButton size="small" @click="chooseOption(detailGenre.nameZh)">{{ genreTab === 'fusion' ? (isSelected(detailGenre.nameZh) ? '移出融合' : '加入融合') : '使用此题材' }}</uiButton></div>
      </template>
    </div>
  </uiPopover>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconStar, IconStarFilled, IconX } from "@tabler/icons-vue";
import { uiButton, uiIconButton, uiPopover } from "@omnistudio-next/ui";
import { findProductionStyle, productionStyleCategories, productionStylePresets, type ProductionStylePreset } from "@/lib/productionStyles";
import { findProductionGenre, productionGenreCategories, productionGenrePresets, type ProductionGenrePreset } from "@/lib/productionGenres";
import { writeClipboardText } from "@/lib/clipboard";

const props = defineProps<{ kind: "genre" | "style"; id?: string; block?: boolean; disabled?: boolean }>();
const model = defineModel<string>({ required: true });
const fusionGenres = defineModel<string[]>("fusionGenres", { default: () => [] });
const favorites = defineModel<string[]>("favorites", { default: () => [] });
const recent = defineModel<string[]>("recent", { default: () => [] });
const visible = ref(false);
const query = ref("");
const genreTab = ref<"main" | "fusion">("main");
const genreFilter = ref("all");
const styleTab = ref<"plaza" | "mine" | "favorites" | "recent">("plaza");
const styleFilter = ref("all");
const detailStyle = ref<ProductionStylePreset>();
const detailGenre = ref<ProductionGenrePreset>();
const copiedPrompt = ref("");
const copyError = ref("");
type VisualOption = { value: string; label: string; image: string; category?: string; subtitle?: string; objectPosition?: string; searchText?: string };
const genreOptions: VisualOption[] = productionGenrePresets.map(preset => ({ value: preset.nameZh, label: preset.nameZh, category: preset.category, image: preset.thumbnail, subtitle: preset.subtitleZh, searchText: [preset.nameZh, preset.description, ...preset.keywords].join(" ") }));
const styleOptions: VisualOption[] = productionStylePresets.map(preset => ({ value: preset.nameZh, label: preset.nameZh, category: preset.category, image: preset.thumbnail, subtitle: preset.subtitleZh, objectPosition: preset.objectPosition, searchText: [preset.nameZh, preset.name, preset.description, ...preset.bestFor].join(" ") }));
const styleTabs = [{ value: "plaza" as const, label: "风格广场" }, { value: "mine" as const, label: "我的风格" }, { value: "favorites" as const, label: "我的收藏" }, { value: "recent" as const, label: "最近使用" }];
const styleFilters = [{ value: "all", label: "全部" }, ...productionStyleCategories.map(category => ({ value: category.id, label: category.nameZh }))];
const genreFilters = [{ value: "all", label: "全部" }, ...productionGenreCategories.map(category => ({ value: category.id, label: category.nameZh }))];
const isDefaultGenre = computed(() => model.value === "默认题材");
const summary = computed(() => props.kind === "genre" && fusionGenres.value.length ? `${model.value} + ${fusionGenres.value.length} 个融合题材` : props.kind === "style" ? findProductionStyle(model.value)?.nameZh ?? model.value : model.value);
const filteredOptions = computed(() => {
  const search = query.value.toLowerCase();
  if (props.kind === "genre") return genreOptions.filter(option => (genreTab.value === "main" || option.value !== "默认题材")
    && (genreTab.value !== "fusion" || option.value !== model.value)
    && (genreFilter.value === "all" || option.category === genreFilter.value)
    && (option.searchText ?? option.label).toLowerCase().includes(search));
  return styleOptions.filter(option => styleTab.value !== "mine"
    && (styleTab.value !== "favorites" || favorites.value.includes(option.value))
    && (styleTab.value !== "recent" || recent.value.includes(option.value))
    && (styleFilter.value === "all" || option.category === styleFilter.value)
    && (option.searchText ?? option.label).toLowerCase().includes(search));
});
watch(() => [props.kind, model.value, ...fusionGenres.value], () => {
  if (props.kind !== "genre") return;
  const cleaned = isDefaultGenre.value ? [] : [...new Set(fusionGenres.value.filter(value => value !== "默认题材" && value !== model.value))];
  if (cleaned.length !== fusionGenres.value.length) fusionGenres.value = cleaned;
  if (isDefaultGenre.value) genreTab.value = "main";
}, { immediate: true });

function isSelected(value: string) {
  return props.kind === "genre" ? genreTab.value === "fusion" ? fusionGenres.value.includes(value) : model.value === value : (findProductionStyle(model.value)?.nameZh ?? model.value) === value;
}
function chooseOption(value: string) {
  if (props.kind === "genre" && genreTab.value === "fusion") {
    if (isDefaultGenre.value || value === model.value) return;
    fusionGenres.value = fusionGenres.value.includes(value) ? fusionGenres.value.filter(item => item !== value) : [...fusionGenres.value, value];
    return;
  }
  model.value = value;
  if (props.kind === "genre") fusionGenres.value = value === "默认题材" ? [] : fusionGenres.value.filter(item => item !== value);
  if (props.kind === "style") {
    recent.value = [value, ...recent.value.filter(item => item !== value)].slice(0, 8);
    detailStyle.value = undefined;
    visible.value = false;
  }
}
function openFusionTab() {
  if (isDefaultGenre.value) return;
  genreTab.value = "fusion";
  detailGenre.value = undefined;
}
function openGenreDetail(value: string) {
  detailGenre.value = findProductionGenre(value);
  copiedPrompt.value = "";
  copyError.value = "";
}
function genreCategoryName(value: string) {
  return productionGenreCategories.find(category => category.id === value)?.nameZh ?? "题材";
}
async function copyGenrePrompt(kind: string, prompt: string) {
  copyError.value = "";
  try {
    await writeClipboardText(prompt);
    copiedPrompt.value = kind;
  } catch (error) {
    copiedPrompt.value = "";
    copyError.value = `复制失败，请检查浏览器剪贴板权限后重试。${error instanceof Error ? `（${error.message}）` : ""}`;
  }
}
function toggleFavorite(value: string) {
  favorites.value = favorites.value.includes(value) ? favorites.value.filter(item => item !== value) : [...favorites.value, value];
}
</script>

<style scoped lang="scss">
:deep(.productionPicker:popover-open) { display: flex; flex-direction: column; overflow: hidden; }
.pickerTrigger {
  display: inline-flex; align-items: center; gap: 7px; min-height: 36px; max-width: 100%; padding: 7px 10px; border: 1px solid transparent; border-radius: 8px; color: var(--uiTextBody); background: transparent; cursor: pointer; font-size: 12px;
  &:hover, &:focus-visible { border-color: var(--uiBorderDefault); background: var(--uiBackgroundSubtle); }
  &:disabled { opacity: .5; cursor: not-allowed; }
  &.block { width: 100%; border-color: var(--uiBorderDefault); background: var(--uiSurfaceRaised); > span:nth-child(2) { flex: 1; text-align: left; } }
  > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .settingGlyph { flex: 0 0 auto; }
}
.visualPicker {
  display: flex; flex-direction: column; gap: 12px; min-height: 0; max-height: min(650px, 75vh); overflow: hidden; color: var(--uiTextBody); text-align: left;
  .pickerHeader, .pickerFilters { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
  .pickerHeader, .pickerFilters, .pickerFooter { flex-shrink: 0; }
  .pickerTabs { display: flex; align-items: center; gap: 4px; min-width: 0; overflow-x: auto; button { flex: 0 0 auto; padding: 8px 10px; border: 0; border-radius: 7px; color: var(--uiTextMuted); background: transparent; cursor: pointer; font-size: 12px; white-space: nowrap; &.active { color: var(--uiTextPrimary); background: var(--uiBackgroundSubtle); } &:disabled { opacity: .45; cursor: not-allowed; } } &.compact button { padding-inline: 8px; font-size: 11px; } }
  .genreFilters { display: grid; gap: 8px;
    .genreCategoryFilters { flex-wrap: wrap; overflow-x: visible; }
    .fusionHint { margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; }
  }
  .pickerSearch { display: flex; flex: 0 1 310px; align-items: center; gap: 10px; width: min(100%, 310px); min-width: 210px; height: 40px; padding: 0 10px 0 12px; border: 1px solid var(--uiBorderDefault); border-radius: 9px; color: var(--uiTextMuted); background: var(--uiSurfaceRaised); transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
    &:hover { background: var(--uiBackgroundSubtle); }
    &:focus-within { border-color: var(--uiActionPrimary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--uiActionPrimary) 16%, transparent); }
    .pickerSearchInput { flex: 1; width: 100%; min-width: 0; height: 100%; padding: 0; border: 0; outline: 0; color: var(--uiTextPrimary); background: transparent; font: inherit; font-size: 12px; }
    .pickerSearchInput::placeholder { color: var(--uiTextMuted); opacity: .82; }
    .pickerSearchInput::-webkit-search-cancel-button { display: none; }
    .clearSearchButton { flex: 0 0 auto; width: 26px; height: 26px; }
  }
  .optionCardGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; min-height: 0; max-height: 460px; padding: 2px 3px 6px 0; overflow-y: auto; overscroll-behavior: contain; }
  .optionCardWrap { position: relative; min-width: 0;
    .imageOptionCard { position: relative; display: grid; gap: 7px; width: 100%; min-width: 0; padding: 0 0 7px; border: 1px solid transparent; border-radius: 9px; color: var(--uiTextBody); background: transparent; cursor: pointer; text-align: left; &:hover, &:focus-visible { border-color: var(--uiBorderDefault); background: var(--uiBackgroundSubtle); } &.selected { border-color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 8%, var(--uiSurfaceRaised)); } img { display: block; width: 100%; aspect-ratio: 1.58; border-radius: 7px; object-fit: cover; background: var(--uiBackgroundSubtle); } > span, > small { padding: 0 7px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } > span { font-size: 12px; font-weight: 500; } > small { color: var(--uiTextMuted); font-size: 10px; } .optionCheck { position: absolute; top: 7px; right: 7px; width: 21px; height: 21px; padding: 3px; border-radius: 50%; color: white; background: var(--uiActionPrimary); } }
    .favoriteButton { position: absolute; top: 5px; left: 5px; width: 26px; height: 26px; color: #fff; background: color-mix(in srgb, #111 55%, transparent); }
    .promptButton { display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 7px 8px; border: 0; border-radius: 6px; color: var(--uiTextMuted); background: transparent; text-align: left; font-size: 10px; cursor: pointer; &:hover, &:focus-visible { color: var(--uiActionPrimary); background: var(--uiBackgroundSubtle); } }
  }
  .styleDetail { display: grid; gap: 16px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 4px 4px 0;
    .detailIntro { display: grid; grid-template-columns: 230px minmax(0, 1fr); gap: 18px; align-items: center; > img { width: 100%; aspect-ratio: 1.58; border-radius: 9px; object-fit: cover; } .detailCategory { color: var(--uiActionPrimary); font-size: 10px; } h3 { margin: 6px 0; color: var(--uiTextPrimary); font-size: 19px; } small { color: var(--uiTextMuted); font-size: 10px; } p { margin: 10px 0 0; font-size: 12px; line-height: 1.7; } }
    .styleSuitability { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--uiBorderDefault); border-radius: 8px; p { display: flex; gap: 12px; margin: 0; font-size: 11px; line-height: 1.6; } strong { flex: 0 0 65px; color: var(--uiTextMuted); font-weight: 400; } }
    .promptSection { h4 { margin: 0 0 7px; color: var(--uiTextPrimary); font-size: 12px; font-weight: 500; } p { margin: 0; padding: 12px; border-radius: 8px; color: var(--uiTextBody); background: var(--uiBackgroundSubtle); font-size: 11px; line-height: 1.8; overflow-wrap: anywhere; user-select: text; } }
  }
  .genreDetail {
    .detailIntro .sourceNote { color: var(--uiTextMuted); font-size: 10px; }
    .genreKeywords { display: flex; flex-wrap: wrap; gap: 6px; span { padding: 4px 8px; border-radius: 5px; color: var(--uiTextMuted); background: var(--uiBackgroundSubtle); font-size: 10px; } }
    .promptSection .promptSectionHeader { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 7px; h4 { margin: 0; } }
    .copyError { margin: 0; color: var(--uiStatusDanger, #d45c65); font-size: 11px; line-height: 1.6; }
  }
  .pickerFooter { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 11px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); font-size: 11px; }
  .pickerEmpty { margin: 0; padding: 36px 12px; color: var(--uiTextMuted); font-size: 12px; text-align: center; }
}
@media (max-width: 700px) {
  .visualPicker {
    .optionCardGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); max-height: min(360px, 55vh); }
    .pickerHeader, .pickerFilters { align-items: flex-start; }
    .pickerFilters { flex-direction: column; }
    .pickerSearch { flex-basis: auto; width: 100%; max-width: none; }
    .pickerTabs { max-width: 100%; }
    .styleDetail .detailIntro { grid-template-columns: 1fr; > img { max-height: 170px; } }
  }
}
</style>

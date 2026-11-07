<template>
  <accountShell :immersive="true" title="短剧创作大师" eyebrow="企业漫剧生产入口" description="从一句创意或一份剧本开始，进入可追踪的剧集生产链路。">
    <template #actions>
      <uiButton variant="ghost" @click="router.push('/home')">返回首页</uiButton>
      <uiButton variant="secondary" :loading="loading" @click="loadProjects">刷新项目</uiButton>
    </template>

    <section class="productionHero" aria-labelledby="productionHeroTitle">
      <span class="introKicker">Short drama studio</span>
      <h2 id="productionHeroTitle">把一个故事，变成一部短剧。</h2>
      <p>支持创意、原稿、成稿与原片四种入口，先创建项目草稿，再进入生产流程。</p>
      <div class="dramaModeTabs" role="tablist" aria-label="短剧工作模式">
        <button v-for="mode in dramaModes" :key="mode.value" type="button" role="tab" :aria-selected="dramaMode === mode.value" :class="{ active: dramaMode === mode.value }" @click="selectDramaMode(mode.value)">{{ mode.label }}</button>
      </div>
      <p v-if="dramaMode !== 'produce'" class="modeDescription">{{ activeDramaMode.description }}</p>
      <template v-if="dramaMode === 'create'">
        <div class="scriptComposer">
          <div class="ideaInputShell" :class="{ dragging: dragTarget === 'create' }" @dragover.prevent="dragTarget = 'create'" @dragleave.prevent="dragTarget = ''" @drop.prevent="handleFileDrop($event, 'create')">
            <button type="button" class="uploadTile" aria-label="添加创作参考文件（可选）" @click="createFileInput?.click()"><icon-plus :size="24" aria-hidden="true" /></button>
            <uiTextarea v-model="scriptIdea" :rows="5" resize="none" aria-label="剧本创作内容" placeholder="输入故事梗概、人物设定或补充要求…" />
            <input ref="createFileInput" class="hiddenFileInput" type="file" accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="handleFileInput($event, 'create')" />
            <div v-if="createReferenceFile" class="referenceFileChip"><icon-file-text :size="16" aria-hidden="true" /><span>{{ createReferenceFile.name }}</span><small>{{ formatFileSize(createReferenceFile.size) }}</small><uiIconButton size="small" :icon="IconX" :label="`移除 ${createReferenceFile.name}`" @click="clearFile('create')" /></div>
          </div>
          <div class="composerFooter">
            <div class="settingBar">
              <productionVisualPicker v-model="mainGenre" v-model:fusionGenres="fusionGenres" kind="genre" />
              <productionVisualPicker v-model="scriptStyle" v-model:favorites="favoriteStyles" v-model:recent="recentStyles" kind="style" />
              <uiPopover v-model:visible="ratioVisible" placement="top-start" :width="144" role="dialog" aria-label="画面比例">
                <template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger compactSettingTrigger" v-bind="triggerAttrs"><span class="ratioGlyph" :class="`ratio${scriptAspectRatio.replace(':', '')}`" aria-hidden="true"></span><span>{{ scriptAspectRatio }}</span><icon-chevron-down :size="14" aria-hidden="true" /></button></template>
                <div class="optionPicker compactPicker ratioPicker"><div class="pickerTitle">默认比例</div><div class="ratioOptions"><button v-for="option in aspectRatioOptions" :key="option.value" type="button" :class="{ selected: scriptAspectRatio === option.value }" :aria-pressed="scriptAspectRatio === option.value" @click="selectAspectRatio(option.value)">{{ option.label }}</button></div></div>
              </uiPopover>
              <uiPopover v-model:visible="episodeVisible" placement="top-start" :width="168" role="dialog" aria-label="目标集数">
                <template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger compactSettingTrigger" v-bind="triggerAttrs"><span>{{ String(scriptEpisodeCount).padStart(2, '0') }} 集</span><icon-chevron-down :size="14" aria-hidden="true" /></button></template>
                <div class="optionPicker compactPicker episodePicker"><div class="episodeOptions"><button v-for="count in episodeOptions" :key="count" type="button" :class="{ selected: scriptEpisodeCount === count }" :aria-pressed="scriptEpisodeCount === count" @click="selectEpisodeCount(count)"><span class="episodeMarker" aria-hidden="true">{{ scriptEpisodeCount === count ? '✓' : '·' }}</span><span>{{ String(count).padStart(2, '0') }} 集</span></button></div><div class="episodeCustomRow" :class="{ selected: customEpisodeCount != null }"><uiNumberInput v-model="customEpisodeCount" class="episodeCustomInput" :min="1" :max="100" :precision="0" :controls="false" placeholder="自定义" aria-label="自定义集数" @keydown.enter="applyCustomEpisodeCount" /><span class="episodeCustomUnit">集</span><uiIconButton class="episodeApplyButton" size="small" :icon="IconCheck" label="应用自定义集数" :disabled="customEpisodeCount == null" @click="applyCustomEpisodeCount" /></div></div>
              </uiPopover>
            </div>
            <uiButton :loading="creating" :disabled="creating || !auth.currentTeamId || (!scriptIdea.trim() && !createReferenceFile)" @click="startDramaFlow">开始创作</uiButton>
          </div>
        </div>
      </template>
      <template v-else-if="dramaMode === 'adapt'">
        <div class="scriptComposer">
          <div class="ideaInputShell" :class="{ dragging: dragTarget === 'adapt' }" @dragover.prevent="dragTarget = 'adapt'" @dragleave.prevent="dragTarget = ''" @drop.prevent="handleFileDrop($event, 'adapt')"><button type="button" class="uploadTile" aria-label="添加待改编剧本" @click="adaptFileInput?.click()"><icon-plus :size="24" aria-hidden="true" /></button><uiTextarea v-model="adaptRequest" :rows="5" resize="none" aria-label="剧本修改要求" placeholder="剧本修改要求：选择需要保留的主线、角色设定和希望调整的部分…" /><input ref="adaptFileInput" class="hiddenFileInput" type="file" accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="handleFileInput($event, 'adapt')" /><div v-if="adaptFile" class="referenceFileChip"><icon-file-text :size="16" aria-hidden="true" /><span>{{ adaptFile.name }}</span><small>{{ formatFileSize(adaptFile.size) }}</small><uiIconButton size="small" :icon="IconX" :label="`移除 ${adaptFile.name}`" @click="clearFile('adapt')" /></div></div>
          <div class="composerFooter"><div class="settingBar"><productionVisualPicker v-model="scriptStyle" v-model:favorites="favoriteStyles" v-model:recent="recentStyles" kind="style" /><uiPopover v-model:visible="adaptSettingsVisible" placement="top-start" :width="350" role="dialog" aria-label="改编设定"><template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger" v-bind="triggerAttrs">{{ adaptTypeLabel }} · {{ adaptEpisodeCount }} 集<icon-chevron-down :size="14" aria-hidden="true" /></button></template><div class="optionPicker compactPicker"><div class="pickerTitle">改编设定</div><div class="adaptTypeOptions"><button v-for="option in adaptTypeOptions" :key="option.value" type="button" :class="{ selected: adaptType === option.value }" :aria-pressed="adaptType === option.value" @click="adaptType = option.value">{{ option.label }}</button></div><uiField label="目标集数"><template #default="{ id }"><uiNumberInput :id="id" v-model="adaptEpisodeCount" :min="1" :max="100" :precision="0" /></template></uiField></div></uiPopover><uiPopover v-model:visible="ratioVisible" placement="top-start" :width="292" role="dialog" aria-label="画面比例"><template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger" v-bind="triggerAttrs"><span class="ratioGlyph" :class="`ratio${scriptAspectRatio.replace(':', '')}`" aria-hidden="true"></span><span>{{ scriptAspectRatio }}</span><icon-chevron-down :size="14" aria-hidden="true" /></button></template><div class="optionPicker compactPicker"><div class="pickerTitle">画面比例</div><div class="ratioOptions"><button v-for="option in aspectRatioOptions" :key="option.value" type="button" :class="{ selected: scriptAspectRatio === option.value }" @click="scriptAspectRatio = option.value; ratioVisible = false"><span class="ratioGlyph" :class="`ratio${option.value.replace(':', '')}`" aria-hidden="true"></span><span>{{ option.label }}</span></button></div></div></uiPopover></div><uiButton :loading="creating" :disabled="creating || !auth.currentTeamId || !adaptFile" @click="startDramaFlow">开始改编</uiButton></div>
        </div>
      </template>
      <template v-else-if="dramaMode === 'produce'">
        <div class="scriptComposer">
          <div class="ideaInputShell" :class="{ dragging: dragTarget === 'produce' }" @dragover.prevent="dragTarget = 'produce'" @dragleave.prevent="dragTarget = ''" @drop.prevent="handleFileDrop($event, 'produce')">
            <button type="button" class="uploadTile" aria-label="添加剧本文件" @click="productionFileInput?.click()"><icon-plus :size="24" aria-hidden="true" /></button>
            <uiTextarea v-model="productionBody" :rows="5" resize="none" aria-label="待拆分剧本正文" placeholder="粘贴完整剧本；也可以添加 TXT、MD 或 DOCX 文件作为正文来源。" />
            <input ref="productionFileInput" class="hiddenFileInput" type="file" accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="handleFileInput($event, 'produce')" />
            <div v-if="productionFile" class="referenceFileChip"><icon-file-text :size="16" aria-hidden="true" /><span>{{ productionFile.name }}</span><small>{{ formatFileSize(productionFile.size) }}</small><uiIconButton size="small" :icon="IconX" :label="`移除 ${productionFile.name}`" @click.stop="clearFile('produce')" /></div>
          </div>
          <div class="composerFooter"><div class="settingBar"><productionVisualPicker v-model="scriptStyle" v-model:favorites="favoriteStyles" v-model:recent="recentStyles" kind="style" /><uiPopover v-model:visible="ratioVisible" placement="top-start" :width="292" role="dialog" aria-label="画面比例"><template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger" v-bind="triggerAttrs"><span class="ratioGlyph" :class="`ratio${scriptAspectRatio.replace(':', '')}`" aria-hidden="true"></span><span>{{ scriptAspectRatio }}</span><icon-chevron-down :size="14" aria-hidden="true" /></button></template><div class="optionPicker compactPicker"><div class="pickerTitle">画面比例</div><div class="ratioOptions"><button v-for="option in aspectRatioOptions" :key="option.value" type="button" :class="{ selected: scriptAspectRatio === option.value }" @click="scriptAspectRatio = option.value; ratioVisible = false"><span class="ratioGlyph" :class="`ratio${option.value.replace(':', '')}`" aria-hidden="true"></span><span>{{ option.label }}</span></button></div></div></uiPopover><uiPopover v-model:visible="episodeVisible" placement="top-start" :width="280" role="dialog" aria-label="目标集数"><template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger" v-bind="triggerAttrs">{{ scriptEpisodeCount }} 集<icon-chevron-down :size="14" aria-hidden="true" /></button></template><div class="optionPicker compactPicker"><div class="pickerTitle">目标集数</div><div class="episodeOptions"><button v-for="count in episodeOptions" :key="count" type="button" :class="{ selected: scriptEpisodeCount === count }" @click="scriptEpisodeCount = count; episodeVisible = false">{{ String(count).padStart(2, '0') }} 集</button></div></div></uiPopover></div><uiButton :loading="creating" :disabled="creating || !auth.currentTeamId || (!productionBody.trim() && !productionFile)" @click="startDramaFlow">开始制作</uiButton></div>
        </div>
      </template>
      <template v-else>
        <div class="scriptComposer">
          <div class="ideaInputShell videoInputShell" :class="{ dragging: dragTarget === 'redraw' }" @dragover.prevent="dragTarget = 'redraw'" @dragleave.prevent="dragTarget = ''" @drop.prevent="handleFileDrop($event, 'redraw')"><button type="button" class="uploadTile" aria-label="上传原片视频" @click="redrawFileInput?.click()"><icon-plus :size="24" aria-hidden="true" /></button><div class="uploadPrompt">添加原片视频作为项目附件<span>支持 MP4、MOV，可上传多集，每集最长 5 分钟</span></div><input ref="redrawFileInput" class="hiddenFileInput" type="file" multiple accept="video/mp4,video/quicktime,.mp4,.mov" @change="handleFileInput($event, 'redraw')" /><div v-if="redrawFiles.length" class="referenceFileList"><div v-for="(file, index) in redrawFiles" :key="`${file.name}-${file.lastModified}`" class="referenceFileChip"><icon-video :size="16" aria-hidden="true" /><span>{{ file.name }}</span><small>{{ formatFileSize(file.size) }}</small><uiIconButton size="small" :icon="IconX" :label="`移除 ${file.name}`" @click="redrawFiles.splice(index, 1)" /></div></div></div>
          <div class="settingBar"><productionVisualPicker v-model="scriptStyle" v-model:favorites="favoriteStyles" v-model:recent="recentStyles" kind="style" /><uiPopover v-model:visible="ratioVisible" placement="top-start" :width="292" role="dialog" aria-label="画面比例"><template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger" v-bind="triggerAttrs"><span class="ratioGlyph" :class="`ratio${scriptAspectRatio.replace(':', '')}`" aria-hidden="true"></span><span>{{ scriptAspectRatio }}</span><icon-chevron-down :size="14" aria-hidden="true" /></button></template><div class="optionPicker compactPicker"><div class="pickerTitle">画面比例</div><div class="ratioOptions"><button v-for="option in aspectRatioOptions" :key="option.value" type="button" :class="{ selected: scriptAspectRatio === option.value }" @click="scriptAspectRatio = option.value; ratioVisible = false"><span class="ratioGlyph" :class="`ratio${option.value.replace(':', '')}`" aria-hidden="true"></span><span>{{ option.label }}</span></button></div></div></uiPopover><uiPopover v-model:visible="episodeVisible" placement="top-start" :width="280" role="dialog" aria-label="目标集数"><template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger" v-bind="triggerAttrs">{{ scriptEpisodeCount }} 集<icon-chevron-down :size="14" aria-hidden="true" /></button></template><div class="optionPicker compactPicker"><div class="pickerTitle">目标集数</div><div class="episodeOptions"><button v-for="count in episodeOptions" :key="count" type="button" :class="{ selected: scriptEpisodeCount === count }" @click="scriptEpisodeCount = count; episodeVisible = false">{{ String(count).padStart(2, '0') }} 集</button></div></div></uiPopover><uiPopover v-model:visible="languageVisible" placement="top-start" :width="200" role="dialog" aria-label="输出语言"><template #reference="{ triggerAttrs }"><button type="button" class="settingTrigger" v-bind="triggerAttrs">{{ outputLanguage }}<icon-chevron-down :size="14" aria-hidden="true" /></button></template><div class="optionPicker languageOptions"><button v-for="option in languageOptions" :key="option.value" type="button" :class="{ selected: outputLanguage === option.value }" @click="outputLanguage = option.value; languageVisible = false">{{ option.label }}</button></div></uiPopover></div>
          <div class="composerFooter"><span class="composerHint">原片会作为转绘输入。当前入口只创建项目草稿，尚未提交供应商任务。</span><uiButton :loading="creating" :disabled="creating || !auth.currentTeamId || !redrawFiles.length" @click="startDramaFlow">开始转绘</uiButton></div>
        </div>
      </template>
      <span class="heroHint">当前团队：{{ currentTeam?.name ?? '未选择团队' }} · 剧本草稿阶段不调用供应商</span>
    </section>

    <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
    <uiAlert v-if="!auth.currentTeamId" title="请先选择或创建团队" tone="warning">生产项目必须归属团队，前往团队空间创建团队后再开始。</uiAlert>

    <section class="featuredSection" aria-labelledby="featuredTitle">
      <div class="sectionHeading"><div><span class="introKicker">Your production space</span><h3 id="featuredTitle">我的生产项目</h3></div><uiButton variant="ghost" :disabled="!auth.currentTeamId" @click="createVisible = true">新建空白项目</uiButton></div>
      <p v-if="errorMessage" class="pageError" role="alert">{{ errorMessage }}</p>
      <section class="projectGrid" aria-label="生产项目列表">
        <uiCard v-for="project in projects" :key="project.id" class="projectCard">
          <template #header>
            <div class="cardHeading"><span class="projectMark">{{ project.title.slice(0, 1) }}</span><div><h3>{{ project.title }}</h3><span class="projectId">{{ project.id }}</span></div></div>
          </template>
          <template #actions><uiTag :tone="statusTone(project.status)">{{ statusLabel(project.status) }}</uiTag></template>
          <div class="projectStats"><div><span>项目预算</span><strong>{{ project.budgetCents }} 积分</strong></div><div><span>你的角色</span><strong>{{ roleLabel(project.role) }}</strong></div><div><span>最近更新</span><strong>{{ formatDate(project.updatedAt) }}</strong></div></div>
          <div class="cardFooter"><span class="muted">{{ project.status === 'draft' ? '等待剧本输入' : '继续生产' }}</span><uiButton size="small" @click="openProject(project.id)">进入项目</uiButton></div>
        </uiCard>
        <div v-if="!loading && !projects.length" class="emptyState"><span class="emptyGlyph">01</span><h3>还没有生产项目</h3><p>从上方输入创意或剧本开始第一部企业漫剧。</p><uiButton :disabled="!auth.currentTeamId" @click="createVisible = true">创建项目</uiButton></div>
      </section>
    </section>

    <uiDialog v-model="createVisible" title="新建生产项目" :width="520" :closeOnClickModal="!creating">
      <form class="projectForm" @submit.prevent="submitCreate">
        <uiField label="项目名称" required><template #default="{ id }"><uiInput :id="id" v-model.trim="createForm.title" maxlength="200" autofocus placeholder="例如：青禾传媒 · 夏日短剧" :disabled="creating" /></template></uiField>
        <uiField label="客户 ID"><template #default="{ id }"><uiInput :id="id" v-model.trim="createForm.customerId" maxlength="36" placeholder="可选，用于关联企业客户" :disabled="creating" /></template></uiField>
        <uiField label="项目预算（积分）" required><template #default="{ id }"><uiNumberInput :id="id" v-model="createForm.budget" :min="0" :step="1" :precision="0" :disabled="creating" /></template></uiField>
        <p v-if="dialogError" class="pageError" role="alert">{{ dialogError }}</p>
        <div class="dialogActions"><uiButton variant="secondary" type="button" :disabled="creating" @click="createVisible = false">取消</uiButton><uiButton htmlType="submit" :loading="creating" :disabled="creating || !createForm.title">创建项目</uiButton></div>
      </form>
    </uiDialog>
  </accountShell>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import axios from "axios";
import { IconCheck, IconX } from "@tabler/icons-vue";
import { uiAlert, uiButton, uiCard, uiDialog, uiField, uiIconButton, uiInput, uiNumberInput, uiPopover, uiTag, uiTextarea } from "@omnistudio-next/ui";
import accountShell from "@/components/account/accountShell.vue";
import productionVisualPicker from "@/components/account/productionVisualPicker.vue";
import { useAuthStore } from "@/stores/auth";
import { saveProductionDraft, saveProductionDraftFile, setProductionDraftRevision, type ProductionDramaDraft, type ProductionDraftFileRef } from "@/lib/productionDraft";
import { defaultProductionStyle } from "@/lib/productionStyles";

type ProjectStatus = "draft" | "scripted" | "storyboarded" | "generating" | "editing" | "review" | "approved" | "delivered";
type Project = { id: string; workspaceId: string; customerId: string | null; title: string; status: ProjectStatus; budgetCents: string; createdBy: string; role: string; createdAt: string; updatedAt: string; draftRevision?: number };
type ApiResponse<T> = { code: number; data: T; message: string };

const router = useRouter();
const auth = useAuthStore();
const projects = ref<Project[]>([]);
const loading = ref(false);
const creating = ref(false);
const createVisible = ref(false);
const errorMessage = ref("");
const dialogError = ref("");
const createForm = reactive({ title: "", customerId: "", budget: 1600 });
let pendingDraftProject: { project: Project; signature: string; files: ProductionDraftFileRef[] } | undefined;
const currentTeam = computed(() => auth.currentTeam);
type DramaMode = "create" | "adapt" | "produce" | "redraw";
const dramaMode = ref<DramaMode>("create");
const dramaModes = [{ value: "create" as const, label: "剧本创作", description: "从故事梗概、人物设定或一句灵感开始创作，可选添加 TXT、MD 或 DOCX 参考。" }, { value: "adapt" as const, label: "剧本改编", description: "添加待改编原稿并填写修改要求，按改写、续写或出海方向形成新剧本。" }, { value: "produce" as const, label: "剧本制作", description: "粘贴或添加剧本正文，自动拆分剧集、场景和镜头。" }, { value: "redraw" as const, label: "原片转绘", description: "添加原片视频，创建转绘项目草稿并设置输出规格。" }];
const activeDramaMode = computed(() => dramaModes.find((mode) => mode.value === dramaMode.value) ?? dramaModes[0]);
const scriptIdea = ref("");
const scriptStyle = ref<string>(defaultProductionStyle);
const mainGenre = ref("默认题材");
const fusionGenres = ref<string[]>([]);
const scriptAspectRatio = ref("16:9");
const scriptEpisodeCount = ref(5);
const createReferenceFile = ref<File>();
const adaptFile = ref<File>();
const productionFile = ref<File>();
const redrawFiles = ref<File[]>([]);
const createFileInput = ref<HTMLInputElement>();
const adaptFileInput = ref<HTMLInputElement>();
const productionFileInput = ref<HTMLInputElement>();
const redrawFileInput = ref<HTMLInputElement>();
const dragTarget = ref<DramaMode | "">("");
const ratioVisible = ref(false);
const episodeVisible = ref(false);
const customEpisodeCount = ref<number>();
const adaptSettingsVisible = ref(false);
const languageVisible = ref(false);
const favoriteStyles = ref<string[]>([]);
const recentStyles = ref<string[]>([]);
const adaptType = ref<"rewrite" | "continue" | "localize">("rewrite");
const adaptEpisodeCount = ref(5);
const aspectRatioOptions = [{ value: "9:16", label: "9:16（竖屏）" }, { value: "16:9", label: "16:9（横屏）" }, { value: "21:9", label: "21:9（电影宽屏）" }, { value: "3:4", label: "3:4" }, { value: "4:3", label: "4:3" }, { value: "1:1", label: "1:1" }];
const adaptTypeOptions = [{ value: "rewrite" as const, label: "剧本改写" }, { value: "continue" as const, label: "续写" }, { value: "localize" as const, label: "出海改编" }];
const adaptTypeLabel = computed(() => adaptTypeOptions.find(option => option.value === adaptType.value)?.label ?? "剧本改写");
const episodeOptions = [1, 5, 10, 30, 60, 80, 100];
watch(episodeVisible, visible => {
  if (visible) customEpisodeCount.value = episodeOptions.includes(scriptEpisodeCount.value) ? undefined : scriptEpisodeCount.value;
});

function selectAspectRatio(value: string) {
  scriptAspectRatio.value = value;
  ratioVisible.value = false;
}

function selectEpisodeCount(value: number) {
  scriptEpisodeCount.value = value;
  customEpisodeCount.value = undefined;
  episodeVisible.value = false;
}

function applyCustomEpisodeCount() {
  const count = customEpisodeCount.value;
  if (count == null || !Number.isInteger(count)) return;
  scriptEpisodeCount.value = Math.min(100, Math.max(1, count));
  episodeVisible.value = false;
}
const adaptRequest = ref("");
const productionBody = ref("");
const outputLanguage = ref("中文");
const languageOptions = [{ value: "中文", label: "中文" }, { value: "英文", label: "英文" }, { value: "日文", label: "日文" }];
const statusLabels: Record<ProjectStatus, string> = { draft: "草稿", scripted: "已编剧", storyboarded: "已分镜", generating: "生成中", editing: "剪辑中", review: "待审片", approved: "已批准", delivered: "已交付" };

function errorText(error: unknown) { return axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || "连接中断，请刷新后重试" : error instanceof Error ? error.message : "操作失败，请重试"; }
function statusLabel(status: ProjectStatus) { return statusLabels[status] ?? status; }
function statusTone(status: ProjectStatus) { return status === "approved" || status === "delivered" ? "success" : status === "review" ? "warning" : status === "generating" ? "warning" : "neutral"; }
function roleLabel(role: string) { return ({ owner: "项目所有者", producer: "制片人", director: "导演", reviewer: "审片人", editor: "剪辑师", viewer: "查看者" } as Record<string, string>)[role] ?? role; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }); }
function formatFileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`; }
function acceptFile(file: File, mode: DramaMode) {
  const maxSize = (mode === "redraw" ? 500 : 50) * 1024 * 1024;
  if (file.size <= 0 || file.size > maxSize) { errorMessage.value = `${file.name} 为空或超过 ${mode === "redraw" ? "500 MB" : "50 MB"} 限制`; return; }
  if (mode === "redraw") {
    if (!/\.(mp4|mov)$/i.test(file.name) && !["video/mp4", "video/quicktime"].includes(file.type)) { errorMessage.value = "原片转绘仅支持 MP4 或 MOV 视频"; return; }
    if (redrawFiles.value.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) return;
    if (redrawFiles.value.length >= 10) { errorMessage.value = "一次最多暂存 10 个原片视频"; return; }
    redrawFiles.value.push(file);
    errorMessage.value = "";
    return;
  }
  if (!/\.(txt|docx|md)$/i.test(file.name)) { errorMessage.value = "参考文件请使用 TXT、MD 或 DOCX；旧版 DOC 请先另存为 DOCX"; return; }
  if (mode === "create") createReferenceFile.value = file;
  else if (mode === "adapt") adaptFile.value = file;
  else productionFile.value = file;
  errorMessage.value = "";
}
function handleFileInput(event: Event, mode: DramaMode) { const input = event.target as HTMLInputElement; for (const file of [...(input.files ?? [])]) acceptFile(file, mode); input.value = ""; dragTarget.value = ""; }
function handleFileDrop(event: DragEvent, mode: DramaMode) { for (const file of [...(event.dataTransfer?.files ?? [])]) acceptFile(file, mode); dragTarget.value = ""; }
function clearFile(mode: "create" | "adapt" | "produce") { if (mode === "create") createReferenceFile.value = undefined; else if (mode === "adapt") adaptFile.value = undefined; else productionFile.value = undefined; }
function selectDramaMode(mode: DramaMode) { dramaMode.value = mode; errorMessage.value = ""; }
async function startDramaFlow() {
  if (!auth.currentTeamId) return;
  const selectedFiles = dramaMode.value === "create" ? [createReferenceFile.value].filter((file): file is File => Boolean(file)) : dramaMode.value === "adapt" ? [adaptFile.value].filter((file): file is File => Boolean(file)) : dramaMode.value === "produce" ? [productionFile.value].filter((file): file is File => Boolean(file)) : redrawFiles.value;
  const instruction = dramaMode.value === "create" ? scriptIdea.value.trim() : dramaMode.value === "adapt" ? adaptRequest.value.trim() : "";
  const canContinue = Boolean(instruction || selectedFiles.length || (dramaMode.value === "produce" && productionBody.value.trim()));
  if (!canContinue) return;
  const draft = { mode: dramaMode.value, instruction, pastedScript: dramaMode.value === "produce" ? productionBody.value.trim() : "", files: [], style: scriptStyle.value, genre: mainGenre.value, fusionGenres: fusionGenres.value, aspectRatio: scriptAspectRatio.value, episodeCount: dramaMode.value === "adapt" ? adaptEpisodeCount.value : scriptEpisodeCount.value, textModel: "", adaptType: adaptType.value, outputLanguage: outputLanguage.value } satisfies ProductionDramaDraft;
  await createFromScript(draft, selectedFiles);
}
async function createFromScript(draft: ProductionDramaDraft, files: File[]) {
  const content = draft.instruction || draft.pastedScript || files[0]?.name || "";
  const userId = auth.user?.id;
  if (!auth.currentTeamId || !userId || !content) return;
  creating.value = true;
  errorMessage.value = "";
  try {
    const title = draft.mode === "create" ? draft.instruction.slice(0, 40) || files[0]?.name.replace(/\.[^.]+$/, "") || "未命名短剧" : `${dramaModes.find((mode) => mode.value === draft.mode)?.label ?? "短剧"} · ${content.slice(0, 24)}`;
    const signature = JSON.stringify([userId, auth.currentTeamId, draft, files.map(file => [file.name, file.size, file.lastModified])]);
    if (pendingDraftProject?.signature !== signature) {
      const initialDraft = { ...draft, files: [] };
      const { data } = await axios.post<ApiResponse<Project>>("/api/productionProjects/create", { workspaceId: auth.currentTeamId, title, budgetCents: "1600", initialDraft });
      pendingDraftProject = { project: data.data, signature, files: [] };
      setProductionDraftRevision(data.data.id, userId, data.data.draftRevision ?? 0);
      projects.value.unshift({ ...data.data, role: "owner" });
    } else {
      await saveProductionDraft(pendingDraftProject.project.id, userId, { ...draft, files: pendingDraftProject.files });
    }
    const projectId = pendingDraftProject.project.id;
    for (const [index, file] of files.entries()) {
      if (!pendingDraftProject.files[index]) pendingDraftProject.files[index] = await saveProductionDraftFile(projectId, userId, file);
      await saveProductionDraft(projectId, userId, { ...draft, files: pendingDraftProject.files });
    }
    await router.push(`/productionProjects/${projectId}`);
    pendingDraftProject = undefined;
  } catch (error) { errorMessage.value = `${pendingDraftProject ? "项目已创建，草稿暂存未完成；保持输入重试会继续保存到同一项目。" : ""}${errorText(error)}`; }
  finally { creating.value = false; }
}
async function loadProjects() {
  if (!auth.currentTeamId) return;
  loading.value = true;
  errorMessage.value = "";
  try {
    const { data } = await axios.get<ApiResponse<Project[]>>("/api/productionProjects/list", { params: { workspaceId: auth.currentTeamId } });
    projects.value = data.data;
  } catch (error) { errorMessage.value = errorText(error); }
  finally { loading.value = false; }
}
async function submitCreate() {
  if (!auth.currentTeamId || !createForm.title.trim()) return;
  creating.value = true;
  dialogError.value = "";
  try {
    const { data } = await axios.post<ApiResponse<Project>>("/api/productionProjects/create", { workspaceId: auth.currentTeamId, title: createForm.title, customerId: createForm.customerId || undefined, budgetCents: String(createForm.budget ?? 0) });
    createVisible.value = false;
    createForm.title = "";
    createForm.customerId = "";
    createForm.budget = 1600;
    await router.push(`/productionProjects/${data.data.id}`);
  } catch (error) { dialogError.value = errorText(error); }
  finally { creating.value = false; }
}
function openProject(id: string) { void router.push(`/productionProjects/${id}`); }
onMounted(async () => {
  await auth.restoreSession();
  const oldDraft = sessionStorage.getItem("productionScriptDraft");
  if (oldDraft) {
    try {
      const parsed = JSON.parse(oldDraft) as { idea?: unknown };
      if (typeof parsed.idea === "string" && parsed.idea.trim()) {
        scriptIdea.value = parsed.idea.trim();
      }
    } catch {
      // 丢弃无法解析的临时草稿，避免阻塞生产入口。
    } finally {
      sessionStorage.removeItem("productionScriptDraft");
    }
  }
  await loadProjects();
});
</script>

<style scoped lang="scss">
.pageError { margin: 0 0 20px; color: var(--uiStatusError); line-height: 1.6; }
.productionHero { display: grid; justify-items: center; gap: 14px; max-width: 1060px; margin: 0 auto 34px; padding: 36px 26px 26px; border: 1px solid var(--uiBorderDefault); border-radius: 16px; background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--uiActionPrimary) 13%, transparent), transparent 48%), var(--uiSurfaceRaised); text-align: center; .introKicker { color: var(--uiActionPrimary); font: 600 11px/1.2 ui-monospace, monospace; text-transform: uppercase; } h2 { margin: 0; font-size: 40px; line-height: 1.12; } p { max-width: 700px; margin: 0; color: var(--uiTextMuted); line-height: 1.8; } .heroHint { color: var(--uiTextMuted); font-size: 11px; } }
.dramaModeTabs { display: inline-flex; gap: 4px; padding: 4px; border: 1px solid var(--uiBorderDefault); border-radius: 999px; background: var(--uiBackgroundSubtle); button { min-width: 112px; padding: 10px 16px; border: 0; border-radius: 999px; color: var(--uiTextMuted); background: transparent; cursor: pointer; font-size: 12px; &.active { color: var(--uiTextOnAccent); background: var(--uiActionPrimary); } } }
.modeDescription { margin: -4px 0 0; font-size: 12px; }
.scriptComposer { display: grid; gap: 12px; width: min(100%, 900px); padding: 18px; border: 1px solid color-mix(in srgb, var(--uiActionPrimary) 34%, var(--uiBorderDefault)); border-radius: 12px; background: color-mix(in srgb, var(--uiBackgroundBase) 72%, var(--uiSurfaceRaised)); text-align: left; :deep(textarea) { min-height: 126px; padding: 3px 2px; border: 0; background: transparent; box-shadow: none; } .composerFooter { display: flex; align-items: end; justify-content: space-between; gap: 16px; padding-top: 12px; border-top: 1px solid var(--uiBorderDefault); } }
.ideaInputShell { display: grid; grid-template-columns: 58px minmax(0, 1fr); align-items: start; gap: 14px; min-height: 180px; padding: 16px; border: 1px solid var(--uiBorderDefault); border-radius: 12px; background: var(--uiSurfaceRaised); transition: border-color .16s ease, background .16s ease; &.dragging { border-color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 7%, var(--uiSurfaceRaised)); } :deep(textarea) { min-width: 0; width: 100%; } }
.videoInputShell { min-height: 170px; }
.uploadTile { display: grid; place-items: center; width: 58px; aspect-ratio: 1; border: 1px solid var(--uiBorderDefault); border-radius: 9px; color: var(--uiTextMuted); background: var(--uiBackgroundSubtle); cursor: pointer; transition: color .16s ease, border-color .16s ease; &:hover { color: var(--uiActionPrimary); border-color: var(--uiActionPrimary); } }
.hiddenFileInput { display: none; }
.uploadPrompt { display: grid; align-content: center; align-self: stretch; gap: 8px; color: var(--uiTextBody); font-size: 13px; span { color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; } }
.referenceFileChip { display: flex; align-items: center; gap: 8px; grid-column: 1 / -1; min-width: 0; padding: 8px 10px; border: 1px solid var(--uiBorderDefault); border-radius: 8px; background: var(--uiBackgroundSubtle); svg { flex: 0 0 auto; color: var(--uiActionPrimary); } span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; } small { flex: 0 0 auto; color: var(--uiTextMuted); font-size: 10px; } :deep(.uiIconButton) { margin-left: auto; } }
.referenceFileList { display: grid; gap: 6px; grid-column: 1 / -1; width: 100%; }
.composerFooter { min-width: 0; }
.settingBar { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; }
.settingTrigger { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; max-width: 100%; padding: 7px 10px; border: 1px solid transparent; border-radius: 8px; color: var(--uiTextBody); background: transparent; cursor: pointer; font-size: 12px; &:hover, &:focus-visible { border-color: var(--uiBorderDefault); background: var(--uiBackgroundSubtle); } > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
.settingGlyph, .ratioGlyph { flex: 0 0 auto; }
.ratioGlyph { display: inline-block; width: 17px; height: 12px; border: 1.5px solid currentColor; border-radius: 2px; &.ratio916, &.ratio34 { width: 10px; height: 15px; } &.ratio11 { width: 13px; height: 13px; } &.ratio219 { width: 19px; height: 8px; } }
.optionPicker { display: grid; gap: 12px; width: min(100%, 650px); max-height: min(590px, 75vh); padding: 16px; overflow: hidden; border: 1px solid var(--uiBorderDefault); border-radius: 12px; color: var(--uiTextBody); background: var(--uiSurfaceRaised); box-shadow: 0 14px 40px color-mix(in srgb, #000 28%, transparent); text-align: left; }
.compactPicker { width: 280px; max-height: none; }
.ratioPicker { width: 144px; gap: 7px; padding: 12px 7px; }
.compactPicker:has(.ratioOptions) { width: 100%; gap: 7px; padding: 12px 7px; }
.popoverPanel[aria-label="画面比例"] { width: 144px !important; }
.popoverPanel[aria-label="目标集数"] { width: 168px !important; }
.pickerTitle { color: var(--uiTextPrimary); font-size: 12px; font-weight: 600; }
.ratioOptions, .episodeOptions, .adaptTypeOptions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; button { min-height: 38px; padding: 8px; border: 1px solid var(--uiBorderDefault); border-radius: 7px; color: var(--uiTextBody); background: var(--uiSurfaceRaised); cursor: pointer; font-size: 11px; &.selected { border-color: var(--uiActionPrimary); color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 8%, var(--uiSurfaceRaised)); } } }
.ratioOptions { grid-template-columns: minmax(0, 1fr); gap: 2px; button { display: flex; align-items: center; min-height: 32px; padding: 7px 9px; border: 0; border-radius: 6px; background: transparent; text-align: left; font-size: 11px; &:hover { background: var(--uiBackgroundSubtle); } &.selected { color: var(--uiTextPrimary); background: var(--uiBackgroundSubtle); font-weight: 600; } } }
.episodeOptions { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.episodePicker { width: 168px; gap: 8px; padding: 8px; }
.compactPicker:has(.episodeOptions) { width: 100%; gap: 8px; padding: 8px; }
.compactPicker:has(.episodeOptions) .episodeOptions { grid-template-columns: minmax(0, 1fr); gap: 2px; button { display: flex; align-items: center; min-height: 36px; padding: 6px 9px; border: 0; border-radius: 18px; background: transparent; text-align: left; font-size: 11px; &:hover { background: var(--uiBackgroundSubtle); } &.selected { color: var(--uiTextPrimary); background: var(--uiBackgroundSubtle); font-weight: 600; } } }
.episodeOptions > button:not(:has(.episodeMarker))::before { content: "·"; display: inline-grid; place-items: center; width: 22px; margin-right: 4px; color: var(--uiTextMuted); font-size: 12px; }
.episodeOptions > button.selected:not(:has(.episodeMarker))::before { content: "✓"; color: var(--uiTextPrimary); }
.episodeMarker { display: inline-grid; place-items: center; width: 22px; margin-right: 4px; color: var(--uiTextMuted); font-size: 12px; }
.episodeOptions button.selected .episodeMarker { color: var(--uiTextPrimary); }
.episodeCustomRow { display: flex; align-items: center; gap: 4px; margin-top: 2px; padding-top: 8px; border-top: 1px solid var(--uiBorderDefault); color: var(--uiTextMuted); }
.episodeCustomInput { width: 76px; min-height: 30px; border: 0 !important; border-radius: 16px !important; background: var(--uiBackgroundSubtle) !important; &:focus-within { outline: 0 !important; } :deep(input) { padding-inline: 10px; color: var(--uiTextBody); font-size: 10px; } }
.episodeCustomUnit { font-size: 11px; }
.episodeApplyButton { width: 30px; height: 30px; margin-left: auto; }
.adaptTypeOptions { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.languageOptions { display: grid; gap: 4px; button { padding: 9px; border: 0; border-radius: 6px; color: var(--uiTextBody); background: transparent; text-align: left; cursor: pointer; &.selected { color: var(--uiActionPrimary); background: var(--uiBackgroundSubtle); } } }
.composerHint { margin: 0; color: var(--uiTextMuted); font-size: 11px; line-height: 1.6; }.redrawSettings { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.featuredSection { margin-top: 10px; }.sectionHeading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 18px; h3 { margin: 6px 0 0; font-size: 22px; } }
.projectGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 18px; }
.projectCard { min-height: 210px; :deep(.cardHeader) { padding: 14px 18px; } :deep(.cardContent) { padding: 18px; } }
.cardHeading { display: flex; align-items: center; gap: 12px; min-width: 0; .projectMark { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: color-mix(in srgb, var(--uiActionPrimary) 16%, transparent); color: var(--uiActionPrimary); font-weight: 700; } h3 { margin: 0 0 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .projectId { display: block; max-width: 210px; color: var(--uiTextMuted); font: 10px ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; }
}
.projectStats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; div { min-width: 0; } span { display: block; margin-bottom: 8px; color: var(--uiTextMuted); font-size: 11px; } strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; } }
.cardFooter { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 14px; border-top: 1px solid var(--uiBorderDefault); .muted { color: var(--uiTextMuted); font-size: 11px; } }
.emptyState { grid-column: 1 / -1; display: grid; justify-items: center; gap: 10px; padding: 70px 20px; border: 1px dashed var(--uiBorderDefault); border-radius: 18px; text-align: center; .emptyGlyph { color: var(--uiActionPrimary); font: 700 28px ui-monospace, monospace; } h3, p { margin: 0; } p { color: var(--uiTextMuted); } }
.projectForm { display: grid; gap: 18px; .dialogActions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 8px; } }
@media (max-width: 700px) { .productionHero { padding: 26px 16px 18px; } .productionHero h2 { font-size: 28px; }.dramaModeTabs { display: grid; grid-template-columns: repeat(2, 1fr); width: 100%; border-radius: 14px; } .dramaModeTabs button { min-width: 0; }.scriptComposer .composerFooter { align-items: stretch; flex-direction: column; }.settingBar { align-items: stretch; }.episodeOptions { grid-template-columns: repeat(3, minmax(0, 1fr)); }.redrawSettings { grid-template-columns: 1fr; }.projectGrid { grid-template-columns: 1fr; } }
</style>

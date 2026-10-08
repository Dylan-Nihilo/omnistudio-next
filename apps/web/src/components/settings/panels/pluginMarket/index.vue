<template>
  <div class="pluginMarket">
    <div class="marketToolbar">
      <div class="marketHeader">
        <uiTabs class="marketNav" :modelValue="activeTab" :options="tabOptions" label="插件列表" @update:modelValue="value => (value === 'discover' || value === 'installed' || value === 'ffmpeg') && (activeTab = value)" />
        <div class="marketActions">
          <uiButton tag="a" href="https://api.toonflow.net/console/plugIn" target="_blank" rel="noopener noreferrer" size="small" variant="ghost" :icon="IconExternalLink">网页版市场</uiButton>
          <uiButton tag="a" href="https://qcn7xdsqgc4z.feishu.cn/docx/KNBNd9naqolsy6xjAOCcEAkqnRd" target="_blank" rel="noopener noreferrer" size="small" variant="ghost" :icon="IconBook">开发者文档</uiButton>
        </div>
      </div>
      <div v-if="activeTab !== 'ffmpeg'" class="marketFilters">
        <div class="typeFilters" role="group" aria-label="插件类型">
          <uiButton variant="ghost" size="small" class="filterButton" :aria-pressed="selectedType === 'all'" @click="selectedType = 'all'">全部<span v-if="activeTab === 'installed' && installedCounts.all !== undefined" class="filterCount">{{ installedCounts.all }}</span></uiButton>
          <uiButton v-for="(category, type) in pluginTypes" :key="type" variant="ghost" size="small" class="filterButton" :disabled="type === 'agent' && !agentMarketEnabled" :title="type === 'agent' && !agentMarketEnabled ? '测试阶段，暂未开放' : undefined" :aria-pressed="selectedType === type" @click="selectedType = type">{{ category.label }}<span v-if="activeTab === 'installed' && installedCounts[type] !== undefined" class="filterCount">{{ installedCounts[type] }}</span></uiButton>
        </div>
        <form class="marketSearch" role="search" @submit.prevent="applySearch">
          <uiInput v-model="searchQuery" size="small" placeholder="搜索插件" aria-label="搜索插件" clearable @clear="applySearch"><template #prefix><icon-search :size="16" aria-hidden="true" /></template></uiInput>
          <uiButton size="small" variant="secondary" htmlType="submit">搜索</uiButton>
        </form>
      </div>
      <div v-if="activeTab !== 'ffmpeg'" class="marketManagement">
        <div class="personalFilters" role="group" aria-label="我的插件">
          <uiButton variant="ghost" size="small" class="filterButton" :icon="IconStar" :aria-pressed="selectedType === 'collection'" @click="selectedType = 'collection'">收藏</uiButton>
          <uiButton variant="ghost" size="small" class="filterButton" :aria-pressed="selectedType === 'my'" @click="selectedType = 'my'">我的</uiButton>
        </div>
        <div v-if="activeTab === 'installed'" class="installActions">
          <uiButton size="small" :icon="IconUpload" :loading="installing" aria-label="安装本地插件" @click="pluginFileInput?.click()">安装插件</uiButton>
          <input ref="pluginFileInput" type="file" :accept="agentMarketEnabled ? '.umd.js,.tool.js,.agent.zip,.zip,.md,.tar,.tar.gz,.tgz' : '.umd.js,.tool.js,.zip,.md,.tar,.tar.gz,.tgz'" hidden @change="installFile" />
          <template v-if="agentMarketEnabled && selectedType === 'agent'">
            <uiButton size="small" variant="secondary" :icon="IconLink" :disabled="loading || !canManageAgents" @click="agentConnectVisible = true">连接远程 Agent</uiButton>
            <uiButton size="small" variant="secondary" :icon="IconSettings" :disabled="loading || !canManageAgents" @click="a2aSettingsVisible = true">A2A 服务</uiButton>
          </template>
        </div>
      </div>
    </div>

    <ffmpeg v-if="activeTab === 'ffmpeg'" :visible />
    <template v-else>
      <template v-if="activeTab === 'installed'"><uiAlert v-for="message in visibleLoadErrors" :key="message" class="loadError" :title="message" tone="error" /></template>
      <section v-else-if="marketNeedsKey" class="marketKey" aria-label="插件市场连接配置">
        <p>{{ marketError }}</p>
        <form class="keyForm" @submit.prevent="saveMarketKey"><uiInput v-model="draftKey" type="password" showPassword autocomplete="off" :maxlength="8192" placeholder="填写 TF-Router API Key" aria-label="TF-Router API Key" :disabled="savingKey" /><uiButton htmlType="submit" :loading="savingKey" :disabled="!draftKey.trim()">保存并继续</uiButton></form>
        <uiAlert v-if="keyError" :title="keyError" tone="error" />
        <uiButton variant="ghost" size="small" tag="a" href="https://api.toonflow.net/" target="_blank" rel="noopener noreferrer" :icon="IconExternalLink">前往 TF-Router 获取 API Key</uiButton>
      </section>
      <uiAlert v-else-if="marketError" class="loadError" :title="marketError" tone="error"><uiButton size="small" variant="secondary" @click="marketRefreshKey++">重试</uiButton></uiAlert>

      <div class="pluginList" :class="{ isInstalled: activeTab === 'installed' }" :aria-label="`${selectedType === 'collection' ? '收藏' : selectedType === 'my' ? '我的' : tabs[activeTab]}列表`" :aria-busy="activeTab === 'installed' ? loading : marketLoading">
        <article v-for="plugin in visiblePlugins" :key="plugin.key" class="pluginCard" :class="{ viewable: canViewPlugin(plugin) }" role="group" :aria-label="plugin.displayName" :aria-haspopup="canViewPlugin(plugin) ? 'dialog' : undefined" :tabindex="canViewPlugin(plugin) ? 0 : undefined" @click="openPlugin(plugin)" @keydown.enter.self.prevent="openPlugin(plugin)" @keydown.space.self.prevent="openPlugin(plugin)">
          <div class="pluginSummary">
            <div class="pluginHeader">
              <div class="pluginHeading"><h3 class="pluginName"><component :is="pluginTypes[plugin.type].icon" :size="18" aria-hidden="true" /><span class="pluginTitle">{{ plugin.displayName }}</span><a v-if="plugin.github" class="repoLink" :href="plugin.github" target="_blank" rel="noopener noreferrer" :aria-label="`${plugin.displayName} 的 GitHub`" title="GitHub" @click.stop><icon-external-link :size="14" aria-hidden="true" /></a></h3><span class="pluginId" :title="plugin.name">{{ plugin.name }}</span></div>
              <uiTag :tone="pluginTypes[plugin.type].tone">{{ pluginTypes[plugin.type].label }}</uiTag>
            </div>
            <p v-if="plugin.description" class="pluginDescription">{{ plugin.description }}</p>
            <uiAlert v-if="plugin.loadError" class="pluginError" :title="plugin.loadError" tone="error" />
            <div v-if="plugin.author || plugin.version" class="pluginMeta"><span v-if="plugin.author" class="pluginAuthor">{{ plugin.author }}</span><span v-if="plugin.version" class="pluginVersion">v{{ plugin.version }}</span></div>
          </div>
          <div v-if="isMarketTab" class="pluginFooter" @click.stop>
            <span v-if="installLabel(plugin) === '已安装'" class="pluginState">已安装</span>
            <uiPopconfirm v-else-if="pluginTypes[plugin.type].path" :title="`${installLabel(plugin)}${pluginTypes[plugin.type].label}“${plugin.displayName}”（${plugin.fileName}）？`" :confirmButtonText="installLabel(plugin)" cancelButtonText="取消" @confirm="installMarketPlugin(plugin)"><template #reference><uiButton size="small" :loading="pendingPlugins.has(plugin.key)" :disabled="loading || pendingPlugins.has(plugin.key)" :aria-label="`${installLabel(plugin)} ${plugin.displayName}`">{{ installLabel(plugin) }}</uiButton></template></uiPopconfirm>
            <span v-else class="pluginState">{{ plugin.type === 'agent' && !agentMarketEnabled ? '测试阶段，暂未开放' : '暂不支持安装' }}</span>
            <div class="pluginActions"><uiIconButton class="collectionButton" :class="{ isCollected: plugin.isCollected }" size="small" variant="ghost" :icon="plugin.isCollected ? IconStarFilled : IconStar" :loading="collectingPlugins.has(plugin.key)" :aria-pressed="plugin.isCollected === true" :label="`${plugin.isCollected ? '取消收藏' : '收藏'} ${plugin.displayName}`" @click="toggleCollection(plugin)" /></div>
          </div>
          <div v-else-if="plugin.type === 'skill'" class="pluginFooter" @click.stop>
            <div class="pluginActions">
              <uiIconButton size="small" variant="ghost" :icon="IconShare" :loading="exportingPlugins.has(plugin.key)" :disabled="loading || pendingPlugins.has(plugin.key)" :label="`导出分享 ${plugin.displayName}`" title="导出分享" @click="exportPlugin(plugin)" />
              <uiPopconfirm v-if="plugin.author !== 'Toonflow'" :title="`确定卸载“${plugin.displayName}”及其附属文件吗？`" danger confirmButtonText="卸载" cancelButtonText="取消" @confirm="updatePlugin(plugin, 'uninstall')"><template #reference><uiButton size="small" variant="danger" :loading="pendingPlugins.has(plugin.key)" :disabled="!canEditPlugin(plugin) || loading || pendingPlugins.has(plugin.key) || exportingPlugins.has(plugin.key)" :aria-label="`卸载 ${plugin.displayName}`">卸载</uiButton></template></uiPopconfirm>
            </div>
          </div>
          <div v-else class="pluginFooter" :class="{ pluginControls: plugin.author !== 'Toonflow' || plugin.type === 'agent' }" @click.stop>
            <div v-if="plugin.author !== 'Toonflow' || plugin.type === 'agent'" class="pluginToggle"><span>{{ plugin.enabled === false ? "已禁用" : "已启用" }}</span><uiSwitch :modelValue="plugin.enabled !== false" :loading="pendingPlugins.has(plugin.key)" :disabled="!canEditPlugin(plugin) || loading || pendingPlugins.has(plugin.key)" :aria-label="`启用 ${plugin.displayName}`" @change="updatePlugin(plugin, 'setEnabled', $event)" /></div>
            <span v-else class="pluginState">已安装</span>
            <div class="pluginActions">
              <uiIconButton v-if="plugin.type === 'node' || plugin.type === 'tool' || (plugin.type === 'agent' && plugin.kind === 'local')" size="small" variant="ghost" :icon="IconShare" :loading="exportingPlugins.has(plugin.key)" :disabled="loading || pendingPlugins.has(plugin.key) || (plugin.type === 'tool' && !canManageTools) || (plugin.type === 'agent' && !canManageAgents)" :label="`导出分享 ${plugin.displayName}`" title="导出分享" @click="exportPlugin(plugin)" />
              <uiButton v-if="plugin.type === 'agent' && plugin.kind === 'local'" size="small" variant="secondary" :disabled="!canManageAgents || loading || pendingPlugins.has(plugin.key)" @click="selectedAgent = plugin">编辑</uiButton>
              <uiButton v-if="plugin.type === 'agent' && plugin.cardUrl" size="small" variant="ghost" :icon="IconCopy" @click="copyCard(plugin.cardUrl)">Card</uiButton>
              <uiBadge v-if="(plugin.type === 'tool' || plugin.type === 'node') && plugin.configRules?.length" dot :hidden="!hasMissingConfig(plugin)" label="有必填配置未填写"><uiButton size="small" variant="secondary" :disabled="!canConfigurePlugin(plugin) || loading || pendingPlugins.has(plugin.key)" :aria-label="`配置 ${plugin.displayName}${hasMissingConfig(plugin) ? '，有必填配置未填写' : ''}`" @click="selectedConfigPlugin = plugin; configVisible = true">配置</uiButton></uiBadge>
              <uiPopconfirm v-if="plugin.author !== 'Toonflow' || plugin.type === 'agent'" :title="`确定卸载“${plugin.displayName}”吗？`" danger confirmButtonText="卸载" cancelButtonText="取消" @confirm="updatePlugin(plugin, 'uninstall')"><template #reference><uiButton size="small" variant="danger" :loading="pendingPlugins.has(plugin.key)" :disabled="!canEditPlugin(plugin) || loading || pendingPlugins.has(plugin.key) || exportingPlugins.has(plugin.key)" :aria-label="`卸载 ${plugin.displayName}`">卸载</uiButton></template></uiPopconfirm>
            </div>
          </div>
        </article>
      </div>
      <p v-if="activeTab === 'installed' ? loading : marketLoading" class="listStatus" role="status">正在加载插件…</p>
      <p v-else-if="!visiblePlugins.length && (isMarketTab ? !marketError : !visibleLoadErrors.length)" class="listStatus">{{ activeTab === "installed" ? "暂无符合条件的已安装插件" : selectedType === "collection" ? "暂无符合条件的收藏插件" : selectedType === "my" ? "暂无符合条件的已发布插件" : "未找到相关插件" }}</p>
      <uiPagination v-if="isMarketTab && !marketError" v-model:currentPage="marketPage" class="marketPagination" :pageSize="marketPageSize" :total="marketTotal" :disabled="marketLoading" :pagerCount="5" showTotal label="插件市场分页" />
      <pluginConfigDialog v-if="selectedConfigPlugin" v-model="configVisible" :plugin="selectedConfigPlugin" :canManage="canConfigurePlugin(selectedConfigPlugin)" />
      <agentEditorDialog v-if="selectedAgent" :key="selectedAgent.key" :agent="selectedAgent" :canManage="canManageAgents" @saved="refreshInstalled" @closed="selectedAgent = undefined" />
      <agentConnectDialog v-if="agentConnectVisible" @saved="refreshInstalled" @closed="agentConnectVisible = false" />
      <a2aSettingsDialog v-if="a2aSettingsVisible" @saved="refreshInstalled" @closed="a2aSettingsVisible = false" />
      <skillEditorDialog v-if="selectedSkill" :key="selectedSkill.key" :skill="selectedSkill" @saved="refreshInstalled" @closed="selectedSkill = undefined" />
      <uiDialog v-if="selectedPlugin" v-model="detailsVisible" :title="selectedPlugin.displayName" :width="800" destroyOnClose><div class="pluginContent" tabindex="0" aria-label="插件说明"><messageMarkdown :content="selectedPlugin.readme ?? ''" /></div></uiDialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import axios from "axios";
import parse from "semver/functions/parse";
import { computed, defineAsyncComponent, markRaw, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { IconBox, IconBook, IconTool, IconExternalLink, IconSparkles2, IconUpload, IconShare, IconStar, IconStarFilled, IconLink, IconSettings, IconCopy } from "@tabler/icons-vue";
import { uiTabs, uiButton, uiIconButton, uiInput, uiAlert, uiTag, uiSwitch, uiBadge, uiPopconfirm, uiPagination, uiDialog, useUiFeedback } from "@toonflow/ui";
import tf, { getTfApiKey, isTfRouterProvider } from "@/lib/tf";
import { saveSettings } from "@/stores/settings";
import tfRouter from "@toonflow/providers/language/tfRouter";
import { invalidateNodeModels } from "@toonflow/nodes-scaffold/nodeAi";
import saveFile from "@/lib/saveFile";
import { writeClipboardText } from "@/lib/clipboard";
import pluginConfigDialog from "./pluginConfigDialog.vue";
import skillEditorDialog from "./skillEditorDialog.vue";
import ffmpeg from "./ffmpeg.vue";
import agentEditorDialog from "./agentEditorDialog.vue";
import agentConnectDialog from "./agentConnectDialog.vue";
import a2aSettingsDialog from "./a2aSettingsDialog.vue";
import type { Plugin, PluginType } from "./types";
import { installPluginFile } from "../../installPluginFile";

const { visible = true } = defineProps<{ visible?: boolean }>();
const feedback = useUiFeedback();
// ACT: Agent 插件市场仍在测试，暂时关闭入口。
const agentMarketEnabled = false;
const pluginTypes = {
  node: { label: "节点", path: "nodes", icon: IconBox, tone: "neutral" },
  skill: { label: "技能", path: "skills", icon: IconBook, tone: "success" },
  tool: { label: "工具", path: "tools", icon: IconTool, tone: "warning" },
  agent: { label: "Agent", path: agentMarketEnabled ? "agents" : null, icon: IconSparkles2, tone: "error" },
} as const;
const tabs = { discover: "发现插件", installed: "已安装", ffmpeg: "FFmpeg" } as const;
const tabOptions = Object.entries(tabs).map(([value, label]) => ({ value, label }));
const activeTab = ref<keyof typeof tabs>("discover");
const isMarketTab = computed(() => activeTab.value === "discover");
const marketPage = ref(1);
const marketPageSize = 20;
const marketTotal = ref(0);
const selectedTypes = ref<{ discover: PluginType | "all" | "collection" | "my"; installed: PluginType | "all" }>({ discover: "all", installed: "all" });
const selectedType = computed({
  get: () => selectedTypes.value[activeTab.value === "installed" ? "installed" : "discover"],
  set: (type: PluginType | "all" | "collection" | "my") => {
    if (activeTab.value === "ffmpeg") return;
    if (type === "collection" || type === "my") {
      activeTab.value = "discover";
      selectedTypes.value.discover = type;
    } else {
      if (selectedTypes.value[activeTab.value] === type) return;
      selectedTypes.value[activeTab.value] = type;
    }
    if (activeTab.value === "discover") marketPage.value = 1;
  },
});
const installedPlugins = ref<Plugin[]>([]);
const installedByKey = computed(() => new Map(installedPlugins.value.map((plugin) => [plugin.key, plugin])));
const marketPlugins = ref<Plugin[]>([]);
const marketLoading = ref(false);
const marketError = ref("");
const apiKey = computed(getTfApiKey);
const marketNeedsKey = ref(false);
const draftKey = ref("");
const savingKey = ref(false);
const keyError = ref("");
let keyController: AbortController | undefined;
const marketRefreshKey = ref(0);
const loading = ref(false);
const loadErrors = ref<Partial<Record<PluginType, string>>>({});
const canManageTools = ref(false);
const canManageAgents = ref(false);
const selectedAgent = ref<Plugin>();
const agentConnectVisible = ref(false);
const a2aSettingsVisible = ref(false);
const pendingPlugins = ref(new Set<string>());
const collectingPlugins = ref(new Set<string>());
const exportingPlugins = ref(new Set<string>());
const pluginFileInput = ref<HTMLInputElement>();
const installing = ref(false);
const refreshKey = ref(0);
const refreshInstalled = () => {
  refreshKey.value++;
};
onMounted(() => window.addEventListener("toonflow:plugin-installed", refreshInstalled));
onBeforeUnmount(() => window.removeEventListener("toonflow:plugin-installed", refreshInstalled));
onBeforeUnmount(() => keyController?.abort());
watch(
  () => [visible, activeTab.value],
  () => keyController?.abort()
);
const selectedConfigPlugin = ref<Plugin>();
const configVisible = ref(false);
const selectedPlugin = ref<Plugin>();
const selectedSkill = ref<Plugin>();
const detailsVisible = ref(false);
const messageMarkdown = defineAsyncComponent(() => import("@/components/messageMarkdown.vue"));
const requestHeaders = { "x-toonflow-workspace": "1" };

const searchQuery = ref("");
const appliedQuery = ref("");
const installedCounts = computed(() => {
  const counts: Partial<Record<PluginType | "all", number>> = {};
  if (loading.value) return counts;
  if (!Object.keys(loadErrors.value).length) counts.all = installedPlugins.value.length;
  for (const type of Object.keys(pluginTypes) as PluginType[]) {
    if (!loadErrors.value[type]) counts[type] = installedPlugins.value.filter((plugin) => plugin.type === type).length;
  }
  return counts;
});
const visibleLoadErrors = computed(() =>
  Object.entries(loadErrors.value)
    .filter(([type]) => selectedType.value === "all" || type === selectedType.value)
    .map(([, message]) => message)
);
const visiblePlugins = computed(() => {
  if (isMarketTab.value) return marketPlugins.value;
  return installedPlugins.value.filter(
    (plugin) =>
      (selectedType.value === "all" || plugin.type === selectedType.value) &&
      [plugin.name, plugin.displayName, plugin.author, plugin.description].some((value) =>
        value?.toLowerCase().includes(appliedQuery.value.toLowerCase())
      )
  );
});

function canViewPlugin(plugin: Plugin) {
  return activeTab.value === "installed" && (plugin.type === "skill" || (plugin.type === "agent" && plugin.kind === "local" && canManageAgents.value))
    ? !loading.value && !pendingPlugins.value.has(plugin.key)
    : !!plugin.readme?.trim();
}

function openPlugin(plugin: Plugin) {
  if (!canViewPlugin(plugin)) return;
  if (activeTab.value === "installed" && plugin.type === "agent" && plugin.kind === "local" && canManageAgents.value) {
    selectedAgent.value = plugin;
    return;
  }
  if (activeTab.value === "installed" && plugin.type === "skill") {
    selectedSkill.value = plugin;
    return;
  }
  selectedPlugin.value = plugin;
  detailsVisible.value = true;
}

function canConfigurePlugin(plugin: Plugin) {
  return plugin.type === "node" ? plugin.canConfigure === true : plugin.type === "tool" && canManageTools.value;
}

function hasMissingConfig(plugin: Plugin) {
  if (!canConfigurePlugin(plugin)) return false;
  return (plugin.configRules ?? []).some((rule) => {
    const required = rule.required === true || (Array.isArray(rule.validate) && rule.validate.some((validation) =>
      validation && typeof validation === "object" && "required" in validation && validation.required === true));
    if (!required || typeof rule.field !== "string") return false;
    const config = plugin.config ?? {};
    const value = Object.hasOwn(config, rule.field) ? config[rule.field] : rule.value;
    return value == null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);
  });
}

watch(activeTab, () => { marketPage.value = 1; });

watch(
  () => [visible, activeTab.value, selectedTypes.value.discover, marketPage.value, appliedQuery.value, marketRefreshKey.value, apiKey.value],
  async (_value, _previous, onCleanup) => {
    if (!visible || !isMarketTab.value) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    marketLoading.value = true;
    marketError.value = "";
    marketPlugins.value = [];
    marketNeedsKey.value = !apiKey.value;
    if (marketNeedsKey.value) {
      marketTotal.value = 0;
      marketError.value = "填写 TF-Router API Key 后即可浏览插件市场";
      marketLoading.value = false;
      return;
    }
    try {
      const pageData = await tf.getPlugIn(
        {
          page: marketPage.value,
          limit: marketPageSize,
          type: selectedTypes.value.discover,
          ...(appliedQuery.value ? { searchKeyword: appliedQuery.value } : {}),
        },
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (
        !pageData ||
        !Number.isSafeInteger(pageData.total) ||
        pageData.total < 0 ||
        !Array.isArray(pageData.list) ||
        pageData.list.some(
          (item) =>
            !item ||
            !Number.isSafeInteger(item.id) ||
            !Object.hasOwn(pluginTypes, item.type) ||
            typeof item.identifier !== "string" ||
            !item.identifier.trim() ||
            typeof item.name !== "string" ||
            typeof item.link !== "string" ||
            !item.link.trim() ||
            typeof item.fileName !== "string" ||
            !item.fileName.trim()
        )
      )
        throw new Error("插件市场列表格式错误");
      marketTotal.value = pageData.total;
      const lastPage = Math.max(1, Math.ceil(pageData.total / marketPageSize));
      if (marketPage.value > lastPage) {
        marketPage.value = lastPage;
        return;
      }
      marketPlugins.value = pageData.list.map((item) => ({
        key: `market:${item.id}`,
        id: item.id,
        isCollected: item.isCollected,
        type: item.type as PluginType,
        name: item.identifier.trim(),
        displayName: item.name.trim() || item.identifier.trim(),
        author: typeof item.supplier === "string" ? item.supplier : "",
        description: typeof item.desc === "string" ? item.desc : "",
        url: item.link,
        fileName: item.fileName.trim(),
        version: item.version,
      }));
    } catch (error) {
      if (!controller.signal.aborted) {
        marketTotal.value = 0;
        marketError.value = errorMessage(error, "加载插件市场失败，请重试");
        marketNeedsKey.value =
          marketError.value.includes("用户信息错误") || (axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0));
        if (marketNeedsKey.value) marketError.value = "TF-Router 用户信息错误，请重新填写 API Key";
      }
    } finally {
      if (!controller.signal.aborted) marketLoading.value = false;
    }
  },
  { immediate: true }
);
watch(
  () => [visible, activeTab.value, refreshKey.value],
  async (_value, _previous, onCleanup) => {
    if (!visible || activeTab.value === "ffmpeg") return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    loading.value = true;
    loadErrors.value = {};
    canManageTools.value = false;
    canManageAgents.value = false;
    installedPlugins.value = [];
    const results = await Promise.all(
      (Object.keys(pluginTypes) as PluginType[]).map(async (type) => {
        const category = pluginTypes[type];
        if (!category.path) return [];
        try {
          const { data } = await axios.get(`/api/${category.path}/get`, {
            signal: controller.signal,
            headers: { ...requestHeaders, "Cache-Control": "no-cache" },
          });
          const items = type === "tool" ? data.data?.tools : type === "agent" ? data.data?.agents : data.data;
          if (data.code !== 200 || !Array.isArray(items) || items.some((item) => !item || typeof item.name !== "string"))
            throw new Error(`${category.label}列表格式错误`);
          if (controller.signal.aborted) return [];
          if (type === "tool") canManageTools.value = data.data.canManage === true;
          if (type === "agent") canManageAgents.value = data.data.canManage === true;
          return items.map((item) => ({
            ...item,
            type,
            key: `${type}:${item.name}`,
            displayName: item.displayName || item.name,
            configRules: markRaw(item.configRules ?? []),
          } as Plugin));
        } catch (error) {
          if (!controller.signal.aborted) loadErrors.value[type] = errorMessage(error, `加载${category.label}失败，请重新打开列表重试`);
          return [];
        }
      })
    );
    if (controller.signal.aborted) return;
    installedPlugins.value = results.flat();
    loading.value = false;
  },
  { immediate: true }
);

async function saveMarketKey() {
  const key = draftKey.value
    .trim()
    .replace(/^Bearer(?:\s+|$)/i, "")
    .trim();
  if (savingKey.value) return;
  if (!key) {
    keyError.value = "请输入有效的 TF-Router API Key";
    return;
  }
  const previousKey = apiKey.value;
  const controller = new AbortController();
  keyController = controller;
  savingKey.value = true;
  keyError.value = "";
  try {
    await tf.getPlugIn({ page: 1, limit: 1, type: "all" }, { apiKey: key, signal: controller.signal });
    if (controller.signal.aborted) return;
    await saveSettings((current) => {
      if (controller.signal.aborted) return;
      const providers = current.customProviders ?? [];
      if (!Array.isArray(providers)) throw new Error("文本模型配置格式无效");
      const index = providers.findIndex((item) => typeof item?.id === "string" && isTfRouterProvider(item));
      if (index < 0 && providers.some((item) => typeof item?.id === "string" && item.id.toLowerCase() === tfRouter.id.toLowerCase())) {
        throw new Error("存在同名的非官方 TF-router 供应商，请先在文本模型中修改其 ID");
      }
      const { id, label, version, apiUrl, protocol, models } = tfRouter;
      const configs = current.mediaProviderConfigs as Record<string, Record<string, unknown>> | undefined;
      if (configs !== undefined && (!configs || typeof configs !== "object" || Array.isArray(configs))) throw new Error("媒体供应商配置格式无效");
      const mediaConfig = configs?.tfRouter;
      if (mediaConfig !== undefined && (!mediaConfig || typeof mediaConfig !== "object" || Array.isArray(mediaConfig)))
        throw new Error("TF-router 媒体配置格式无效");
      return {
        customProviders:
          index < 0
            ? [...providers, { id, label, version, apiUrl, protocol, models, apiKey: key }]
            : providers.map((item, position) => (position === index ? { ...item, apiKey: key } : item)),
        mediaProviderConfigs: { ...configs, tfRouter: { ...mediaConfig, apiKey: key } },
      };
    });
    if (controller.signal.aborted) return;
    invalidateNodeModels("media");
    draftKey.value = "";
    if (apiKey.value === previousKey) marketRefreshKey.value++;
  } catch (error) {
    if (!controller.signal.aborted) keyError.value = errorMessage(error, "验证或保存失败，请重试");
  } finally {
    savingKey.value = false;
  }
}

function applySearch() {
  appliedQuery.value = searchQuery.value.trim();
  marketPage.value = 1;
}

function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) return typeof error.response?.data?.message === "string" ? error.response.data.message : fallback;
  return error instanceof Error ? error.message : fallback;
}

async function copyCard(url: string) {
  try {
    await writeClipboardText(url);
    feedback.message({ tone: "success", message: "Agent Card 地址已复制" });
  } catch {
    await feedback.alert(url, "Agent Card 地址", { confirmButtonText: "关闭" }).catch(() => {});
  }
}

function canEditPlugin(plugin: Plugin) {
  return (
    activeTab.value === "installed" &&
    (plugin.author !== "Toonflow" || plugin.type === "agent") &&
    (plugin.type === "node" || plugin.type === "skill" || (plugin.type === "tool" && canManageTools.value) || (plugin.type === "agent" && canManageAgents.value))
  );
}

function installLabel(plugin: Plugin) {
  const installed = installedByKey.value.get(`${plugin.type}:${plugin.name}`);
  if (!installed) return "安装";
  const [current, incoming] = [installed.version, plugin.version].map(value => {
    const version = parse(value ?? "");
    if (!version || version.raw.trim().startsWith("v")
      || version.prerelease.some(part => /^\d+$/.test(String(part)) && !Number.isSafeInteger(Number(part)))) return null;
    return version;
  });
  return current && incoming && incoming.compare(current) > 0 ? "更新" : "已安装";
}

async function toggleCollection(plugin: Plugin) {
  if (plugin.id === undefined || collectingPlugins.value.has(plugin.key)) return;
  const key = apiKey.value;
  collectingPlugins.value.add(plugin.key);
  try {
    const { collected } = await tf.toggleCollection(plugin.id, { apiKey: key });
    if (apiKey.value !== key) return;
    const current = marketPlugins.value.find(item => item.id === plugin.id);
    if (current) current.isCollected = collected;
    if (selectedType.value === "collection" || marketLoading.value) marketRefreshKey.value++;
    feedback.message({ tone: "success", message: collected ? "收藏成功" : "已取消收藏" });
  } catch (error) {
    if (apiKey.value === key) feedback.message({ tone: "error", message: errorMessage(error, "修改收藏失败，请重试") });
  } finally {
    collectingPlugins.value.delete(plugin.key);
  }
}

async function installMarketPlugin(plugin: Plugin) {
  const path = pluginTypes[plugin.type].path;
  if (!path || !plugin.url || !plugin.fileName || loading.value || pendingPlugins.value.has(plugin.key)) return;
  const action = installLabel(plugin);
  if (action === "已安装") return;
  pendingPlugins.value.add(plugin.key);
  try {
    const { data } = await axios.post(`/api/${path}/install`, { url: plugin.url, fileName: plugin.fileName }, { headers: requestHeaders });
    if (data.code !== 200) throw new Error(data.message || "安装插件失败");
    window.dispatchEvent(new CustomEvent("toonflow:plugin-installed", { detail: { type: plugin.type, name: data.data.name } }));
    feedback.message({ tone: "success", message: `${plugin.displayName}已${action}` });
  } catch (error) {
    feedback.message({ tone: "error", message: errorMessage(error, "安装插件失败，请重试") });
  } finally {
    pendingPlugins.value.delete(plugin.key);
  }
}

async function installFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || installing.value) return;
  installing.value = true;
  try {
    const type = /\.agent\.zip$/i.test(file.name)
      ? "agent"
      : /\.umd\.js$/i.test(file.name)
      ? "node"
      : /\.tool\.js$/i.test(file.name)
      ? "tool"
      : /\.(zip|md|tar|tar\.gz|tgz)$/i.test(file.name)
      ? "skill"
      : undefined;
    if (!type) throw new Error("请选择 Agent .agent.zip、节点 .umd.js、工具 .tool.js 或技能 .zip、.md、.tar、.tar.gz、.tgz 文件");
    if (type === "agent" && !agentMarketEnabled) throw new Error("Agent 功能处于测试阶段，暂未开放安装");
    await installPluginFile(type, file);
    feedback.message({ tone: "success", message: `${pluginTypes[type].label}已安装` });
  } catch (error) {
    feedback.message({ tone: "error", message: errorMessage(error, "安装插件失败，请重试") });
  } finally {
    installing.value = false;
  }
}

async function exportPlugin(plugin: Plugin) {
  if (
    activeTab.value !== "installed" ||
    (plugin.type === "agent" && (plugin.kind !== "local" || !canManageAgents.value)) ||
    exportingPlugins.value.has(plugin.key) ||
    pendingPlugins.value.has(plugin.key) ||
    loading.value ||
    (plugin.type === "tool" && !canManageTools.value)
  )
    return;
  exportingPlugins.value.add(plugin.key);
  try {
    const fileName = `${plugin.name}.${plugin.type === "node" ? "umd.js" : plugin.type === "tool" ? "tool.js" : plugin.type === "agent" ? "agent.zip" : "zip"}`;
    await saveFile(
      () =>
        axios
          .get<Blob>("/api/plugins/export", { params: { type: plugin.type, name: plugin.name }, responseType: "blob", headers: requestHeaders })
          .then(({ data }) => data),
      fileName
    );
  } catch (error) {
    let message = errorMessage(error, "导出插件失败，请重试");
    if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
      const data = await error.response.data
        .text()
        .then(JSON.parse)
        .catch(() => null);
      if (typeof data?.message === "string") message = data.message;
    }
    feedback.message({ tone: "error", message: message });
  } finally {
    exportingPlugins.value.delete(plugin.key);
  }
}

async function updatePlugin(plugin: Plugin, action: "setEnabled" | "uninstall", enabled?: boolean) {
  if (
    !canEditPlugin(plugin) ||
    loading.value ||
    pendingPlugins.value.has(plugin.key) ||
    exportingPlugins.value.has(plugin.key) ||
    (plugin.type === "skill" && action !== "uninstall")
  )
    return;
  pendingPlugins.value.add(plugin.key);
  const actionLabel = action === "uninstall" ? "卸载插件" : "更新插件状态";
  try {
    const url = `/api/${pluginTypes[plugin.type].path}/${action}`;
    const { data } =
      action === "uninstall"
        ? await axios.delete(url, { data: { name: plugin.name }, headers: requestHeaders })
        : await axios.put(url, { name: plugin.name, enabled }, { headers: requestHeaders });
    if (data.code !== 200) throw new Error(data.message || `${actionLabel}失败`);
    if (action === "uninstall") {
      installedPlugins.value = installedPlugins.value.filter((item) => item.key !== plugin.key);
      if (selectedSkill.value?.key === plugin.key) selectedSkill.value = undefined;
      if (selectedAgent.value?.key === plugin.key) selectedAgent.value = undefined;
      if (selectedConfigPlugin.value?.key === plugin.key) {
        configVisible.value = false;
        selectedConfigPlugin.value = undefined;
      }
      if (selectedPlugin.value?.key === plugin.key) {
        detailsVisible.value = false;
        selectedPlugin.value = undefined;
      }
      feedback.message({ tone: "success", message: "插件已卸载" });
    } else plugin.enabled = enabled;
    if (plugin.type === "node")
      window.dispatchEvent(new CustomEvent("toonflow:plugin-installed", { detail: { type: plugin.type, name: plugin.name } }));
  } catch (error) {
    feedback.message({ tone: "error", message: errorMessage(error, `${actionLabel}失败，请重试`) });
  } finally {
    pendingPlugins.value.delete(plugin.key);
  }
}
</script>

<style lang="scss" scoped>
.pluginMarket {
  min-width: 0;
  .marketToolbar {
    display: flex; flex-direction: column; gap: 16px; min-width: 0; padding-bottom: 24px; margin-bottom: 24px; border-bottom: 1px solid var(--uiBorderDefault);
    .marketHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; .marketNav { min-width: 0; } .marketActions { display: flex; flex-wrap: wrap; gap: 4px; margin-left: auto; } }
    .marketFilters { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; .typeFilters { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; } .marketSearch { display: flex; flex: 1 1 240px; gap: 8px; min-width: 0; :deep(.uiInput) { flex: 1; min-width: 0; } } }
    .marketManagement { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; .personalFilters, .installActions { display: flex; flex-wrap: wrap; gap: 8px; } }
    .filterButton { &[aria-pressed="true"] { color: var(--uiActionPrimary); background: var(--uiActionSoft); } :deep(.buttonLabel) { display: flex; align-items: center; gap: 8px; } .filterCount { color: var(--uiTextMuted); font-variant-numeric: tabular-nums; } }
  }
  .marketKey { display: flex; flex-direction: column; align-items: flex-start; gap: 20px; padding: 24px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiBackgroundSubtle); p { margin: 0; color: var(--uiTextBody); font-size: var(--uiFontBody); line-height: 1.7; } .keyForm { display: flex; flex-wrap: wrap; gap: 12px; width: 100%; :deep(.uiInput) { flex: 1 1 240px; min-width: 0; } } }
  .loadError { margin-bottom: 16px; }
  .pluginList {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 16px; min-width: 0;
    .pluginCard {
      display: flex; flex-direction: column; gap: 20px; min-width: 0; padding: 20px; border: 1px solid var(--uiBorderDefault); border-radius: var(--uiRadiusCard); background: var(--uiBackgroundSubtle);
      &.viewable { cursor: pointer; &:hover { border-color: var(--uiBorderControl); } &:focus-visible { outline: 2px solid var(--uiBorderFocus); outline-offset: 2px; } }
      .pluginSummary {
        min-width: 0;
        .pluginHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; :deep(.uiTag) { flex-shrink: 0; } .pluginHeading { min-width: 0; .pluginName { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; font-size: var(--uiFontLabel); font-weight: 600; overflow-wrap: anywhere; svg { flex-shrink: 0; } .pluginTitle { min-width: 0; } .repoLink { display: inline-flex; flex-shrink: 0; color: var(--uiTextMuted); &:hover { color: var(--uiActionPrimary); } } } .pluginId { display: block; margin-top: 8px; color: var(--uiTextMuted); font-size: var(--uiFontControl); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } } }
        .pluginDescription { margin: 16px 0 0; color: var(--uiTextBody); font-size: var(--uiFontControl); line-height: 1.7; overflow-wrap: anywhere; }
        .pluginError { margin-top: 16px; }
        .pluginMeta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 16px; color: var(--uiTextMuted); font-size: var(--uiFontControl); overflow-wrap: anywhere; .pluginAuthor { flex: 1; min-width: 0; } .pluginVersion { flex-shrink: 0; font-variant-numeric: tabular-nums; } }
      }
      .pluginFooter { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: auto; padding-top: 16px; border-top: 1px solid var(--uiBorderDefault); .pluginState { color: var(--uiTextMuted); font-size: var(--uiFontControl); } .pluginToggle { display: flex; align-items: center; justify-content: space-between; gap: 20px; color: var(--uiTextMuted); font-size: var(--uiFontControl); } .pluginActions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; min-width: 0; margin-left: auto; .collectionButton.isCollected { color: var(--uiActionPrimary); } } &.pluginControls { align-items: stretch; flex-direction: column; } }
    }
    &.isInstalled { grid-template-columns: minmax(0, 1fr); .pluginCard { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 24px; .pluginSummary .pluginHeader { justify-content: flex-start; .pluginHeading { flex: 1; } } .pluginFooter { min-width: 180px; margin-top: 0; padding-top: 0; border-top: 0; flex-direction: column; align-items: stretch; } } }
  }
  .marketPagination { justify-content: center; margin-top: 24px; }
  .listStatus { margin: 24px 0; color: var(--uiTextMuted); text-align: center; font-size: var(--uiFontControl); }
  @media (max-width: 1100px) { .pluginList.isInstalled .pluginCard { grid-template-columns: minmax(0, 1fr); gap: 16px; .pluginFooter { min-width: 0; padding-top: 16px; border-top: 1px solid var(--uiBorderDefault); } } }
}
.pluginContent { min-width: 0; overflow-wrap: anywhere; font-size: var(--uiFontBody); line-height: 1.7; }
</style>

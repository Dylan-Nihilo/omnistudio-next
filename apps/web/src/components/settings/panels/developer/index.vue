<template>
  <div class="developerPanel">
    <div class="developer" :class="{ blurred: developerLocked }" :inert="developerLocked">
      <section class="toolsSection" aria-label="开发调试">
        <div class="developerRow"><div class="toolDescription"><h3>开发者工具</h3><p>查看页面结构、控制台与网络请求。</p></div><uiButton variant="secondary" :icon="IconTerminal2" :loading="opening" :disabled="!isDesktop" @click="openDevTools">打开 DevTools</uiButton></div>
        <p v-if="!isDesktop" class="browserHint">浏览器模式请从浏览器菜单打开开发者工具。</p>
        <uiAlert v-if="requestError" :title="requestError" tone="error" />
        <div class="developerRow"><div class="toolDescription"><h3>首次使用引导</h3><p>当前{{ hello.completed ? '已完成' : '未完成' }}。重置后打开引导页，保留已配置的模型。</p></div><uiButton variant="secondary" :icon="IconRefresh" :loading="resettingHello" :disabled="importingStorage || writingStorage" @click="resetHello">重置并打开引导页</uiButton></div>
        <div class="developerRow"><div class="toolDescription"><h3>更新说明</h3><p>打开当前版本的更新说明弹窗。</p></div><uiButton variant="secondary" :icon="IconFileText" :loading="openingUpdateBox" @click="openUpdateBox">查看更新说明</uiButton></div>
        <div class="developerRow"><div class="toolDescription"><h3>Agent 系统提示词</h3><p>编辑 Agent 的基础指令，保存后下一条消息生效。</p></div><uiButton variant="secondary" :icon="IconEdit" @click="systemPromptVisible = true">编辑提示词</uiButton></div>
      </section>
      <section class="updateSourceSection" aria-label="自定义更新源">
        <div class="toolDescription"><h3>自定义更新源</h3><p>填写更新清单和安装包所在的目录地址，保存后可在关于页选择。</p></div>
        <div class="updateSourceEditor"><uiInput v-model="customUpdateUrl" placeholder="https://example.com/desktopUpdates" aria-label="自定义更新源目录地址" clearable :disabled="savingUpdateUrl" @keyup.enter="saveCustomUpdateUrl" /><uiButton :loading="savingUpdateUrl" @click="saveCustomUpdateUrl">保存</uiButton></div>
        <uiAlert v-if="updateUrlError" :title="updateUrlError" tone="error" />
      </section>
      <section class="pluginInstaller" aria-label="手动安装插件">
        <header class="installerHeader"><h3>手动安装插件</h3><uiSelect :modelValue="installType" :options="installOptions" class="typeSelect" inline :disabled="!!installing" aria-label="安装插件类型" @update:modelValue="value => (value === 'node' || value === 'skill' || value === 'tool') && (installType = value)" /></header>
        <div class="toolDescription"><p>{{ selectedInstaller.description }}支持本地文件或文件直链，安装后可在插件市场查看。</p></div>
        <uiCheckbox v-model="forceInstall" :disabled="!!installing">强制安装（允许覆盖同版本或降级）</uiCheckbox>
        <input ref="fileInput" type="file" :accept="selectedInstaller.accept" hidden @change="installFile" />
        <div class="fileInstaller"><uiButton variant="secondary" :icon="IconFileUpload" :loading="installing === 'file'" :disabled="!!installing" @click="fileInput?.click()">选择本地{{ selectedInstaller.label }}文件</uiButton></div>
        <div class="urlInstaller"><uiInput v-model="pluginUrl" :disabled="!!installing" :placeholder="`https://example.com/${selectedInstaller.example}`" :aria-label="`${selectedInstaller.label}文件地址`" clearable @keyup.enter="installUrl" /><uiButton :icon="IconDownload" :loading="installing === 'url'" :disabled="!!installing || !pluginUrl.trim()" @click="installUrl">从 URL 安装</uiButton></div>
        <uiAlert v-if="installError" :title="installError" tone="error" /><uiAlert v-else-if="installedName" :title="`${installedName} 已安装`" tone="success" />
      </section>
      <section class="storageManager" aria-label="浏览器持久缓存">
        <header class="developerRow"><div class="toolDescription"><h3>浏览器持久缓存</h3><p>管理当前站点的 localStorage。修改重新加载后生效；首次使用引导请通过上方按钮重置。导入会覆盖同名项，保留其他项。</p></div><div class="storageToolbar"><input ref="storageFileInput" type="file" accept=".json,application/json" hidden @change="importStorage" /><uiButton variant="secondary" size="small" :icon="IconFileUpload" :loading="importingStorage" :disabled="storageBusy" @click="storageFileInput?.click()">导入</uiButton><uiButton variant="secondary" size="small" :icon="IconDownload" :disabled="storageBusy" @click="exportStorage">导出</uiButton><uiButton variant="ghost" size="small" :icon="IconRefresh" :disabled="storageBusy" @click="loadStorage">刷新列表</uiButton></div></header>
        <uiAlert v-if="storageError" :title="storageError" tone="error" /><uiAlert v-else-if="storageMessage" :title="storageMessage" tone="success" />
        <div v-for="entry in storageEntries" :key="entry.key" class="storageItem">
          <div class="storageHeader"><span class="storageKey">{{ entry.key || '（空键名）' }}</span><div class="storageActions"><uiButton variant="ghost" size="small" :icon="IconEdit" :disabled="storageBusy" :aria-label="`修改 ${entry.key}`" @click="editStorage(entry)">修改</uiButton><uiPopconfirm title="确定删除这条缓存？" danger confirmButtonText="删除" cancelButtonText="取消" @confirm="writeStorage(entry, null)"><template #reference><uiButton variant="danger" size="small" :icon="IconTrash" :disabled="storageBusy" :aria-label="`删除 ${entry.key}`">删除</uiButton></template></uiPopconfirm></div></div>
          <template v-if="editingKey === entry.key"><uiTextarea v-model="storageValue" :rows="5" :disabled="storageBusy" :aria-label="`${entry.key} 的值`" /><div class="storageActions"><uiButton variant="secondary" size="small" :disabled="storageBusy" @click="editingKey = null">取消</uiButton><uiButton size="small" :loading="writingStorage" :disabled="storageBusy" @click="writeStorage(entry, storageValue)">保存</uiButton></div></template>
          <pre v-else class="storageValue">{{ entry.value }}</pre>
        </div>
      </section>
    </div>
    <systemPromptDialog v-if="systemPromptVisible" v-model="systemPromptVisible" /><updateBox v-if="updateBoxVisible" v-model="updateBoxVisible" :version="updateBoxBuild.version" :buildCode="updateBoxBuild.hash" />
    <div v-if="developerLocked" class="developerConfirm"><icon-code :size="28" aria-hidden="true" /><h3>确认进入开发者选项</h3><p>此功能仅供开发调试，普通用户请勿开启。安装未知节点或修改、清除缓存可能导致程序异常或数据丢失。请确认你了解相关风险后继续，系统将记住你的选择。</p><uiButton @click="confirmDeveloper">确认并继续</uiButton></div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useDeveloperStore } from "@/stores/developer";
import { useHelloStore } from "@/stores/hello";
import { saveSettings, settings } from "@/stores/settings";
import { desktopUpdateSnapshot } from "@/stores/desktopUpdate";
import type { updateSnapshot } from "@omnistudio-next/server/desktop";
import saveFile from "@/lib/saveFile";
import { installPluginFile } from "../../installPluginFile";
import { uiButton, uiInput, uiTextarea, uiSelect, uiCheckbox, uiAlert, uiPopconfirm, useUiFeedback } from "@omnistudio-next/ui";
import axios from "axios";
import { IconCode, IconTerminal2, IconFileUpload, IconFileText, IconDownload, IconRefresh, IconEdit, IconTrash } from "@tabler/icons-vue";

const feedback = useUiFeedback();
const developerStore = useDeveloperStore();
const hello = useHelloStore();
const router = useRouter();
const resettingHello = ref(false);
const systemPromptDialog = defineAsyncComponent(() => import("./systemPromptDialog.vue"));
const systemPromptVisible = ref(false);
const updateBox = defineAsyncComponent(() => import("@/components/updateBox.vue"));
const updateBoxVisible = ref(false);
const openingUpdateBox = ref(false);
const updateBoxBuild = ref({ version: import.meta.env.appVersion ?? "", hash: import.meta.env.DEV ? "dev" : "未提供" });
const developerLocked = computed(() => !developerStore.developerConfirmed);
const customUpdateUrl = ref(typeof settings.value.desktopUpdateCustomUrl === "string" ? settings.value.desktopUpdateCustomUrl : "");
const savingUpdateUrl = ref(false);
const updateUrlError = ref("");

async function openUpdateBox() {
  if (openingUpdateBox.value) return;
  openingUpdateBox.value = true;
  try {
    if (isDesktop) {
      const snapshot = desktopUpdateSnapshot.value ?? (await axios.get<{ data: updateSnapshot }>("/api/desktop/update", { timeout: 10000 })).data.data;
      if (!snapshot?.version || !snapshot.hash) throw new Error("未能读取当前版本和构建代码，请重试。");
      updateBoxBuild.value = { version: snapshot.version, hash: snapshot.hash };
    }
    updateBoxVisible.value = true;
  } catch (error) {
    feedback.message({ tone: "error", message: axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "读取版本信息失败" });
  } finally {
    openingUpdateBox.value = false;
  }
}

async function saveCustomUpdateUrl() {
  if (savingUpdateUrl.value) return;
  const url = customUpdateUrl.value.trim();
  updateUrlError.value = "";
  try {
    if (url && !URL.canParse(url)) throw new Error("请输入有效的 HTTP(S) 目录地址");
    if (url) {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash || url.length > 2048)
        throw new Error("请输入不含账号、查询参数或锚点的 HTTP(S) 目录地址");
    }
    savingUpdateUrl.value = true;
    await saveSettings(current => ({
      desktopUpdateCustomUrl: url,
      ...(url || current.desktopUpdateSource !== "custom" ? {} : { desktopUpdateSource: "official" }),
    }));
    customUpdateUrl.value = url;
    feedback.message({ tone: "success", message: "自定义更新源已保存" });
  } catch (error) {
    updateUrlError.value = axios.isAxiosError<{ message?: string }>(error) ? error.response?.data?.message || error.message : error instanceof Error ? error.message : "保存更新源失败";
  } finally {
    savingUpdateUrl.value = false;
  }
}

async function resetHello() {
  if (storageBusy.value) return;
  resettingHello.value = true;
  try {
    await hello.reset();
    loadStorage();
    await router.replace("/hello");
  } catch {
    feedback.message({ tone: "error", message: "重置引导失败，请重试" });
  } finally {
    resettingHello.value = false;
  }
}

function confirmDeveloper() {
  developerStore.developerConfirmed = true;
  loadStorage();
}

const installTypes = {
  node: { label: "节点", accept: ".umd.js", example: "imageNode.umd.js", description: "选择脚手架打包的 .umd.js 文件。" },
  skill: { label: "技能", accept: ".zip,.md,.tar,.tar.gz,.tgz", example: "skill.zip", description: "支持包含技能与资源的 .zip 包、SKILL.md，以及 .tar、.tar.gz、.tgz 包。" },
  tool: { label: "工具", accept: ".tool.js", example: "mediaGeneration.tool.js", description: "选择脚手架打包的 .tool.js 文件。" },
};
const installOptions = [...Object.entries(installTypes).map(([value, item]) => ({ value, label: item.label })), { value: "agent", label: "Agent（暂未开放）", disabled: true }];
const installType = ref<keyof typeof installTypes>("node");
const selectedInstaller = computed(() => installTypes[installType.value]);
const fileInput = ref<HTMLInputElement>();
const pluginUrl = ref("");
const forceInstall = ref(false);
const installing = ref<"file" | "url" | "">("");
const installError = ref("");
const installedName = ref("");
watch(installType, () => {
  pluginUrl.value = "";
  installError.value = "";
  installedName.value = "";
});
const storageEntries = ref<{ key: string; value: string }[]>([]);
const storageError = ref("");
const editingKey = ref<string | null>(null);
const storageValue = ref("");
const storageFileInput = ref<HTMLInputElement>();
const importingStorage = ref(false);
const writingStorage = ref(false);
const storageBusy = computed(() => importingStorage.value || writingStorage.value || resettingHello.value);
const storageMessage = ref("");

function readStorage() {
  return Object.fromEntries(Object.keys(localStorage).map(key => [key, localStorage.getItem(key) ?? ""]));
}

function saveStorage(entries: [string, string | null][]) {
  const previous = entries.map(([key]) => [key, localStorage.getItem(key)] as const);
  try {
    for (const [key, value] of entries) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  } catch (error) {
    // ACT: localStorage 没有事务，写入失败时恢复本次修改的项。
    for (const [key, value] of previous.reverse()) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw error;
  }
}

async function importStorage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || storageBusy.value) return;
  importingStorage.value = true;
  storageError.value = "";
  storageMessage.value = "";
  try {
    const data: unknown = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
    if (!data || typeof data !== "object" || Array.isArray(data) || Object.values(data).some(value => typeof value !== "string")) {
      throw new Error("请选择键值均为字符串的 JSON 对象，例如 {\"key\":\"value\"}。");
    }
    const entries = Object.entries(data) as [string, string][];
    saveStorage(entries);
    loadStorage();
    storageMessage.value = `已导入 ${entries.length} 项，重新加载页面后生效。`;
  } catch (err) {
    storageError.value = err instanceof Error ? err.message : "导入缓存失败";
  } finally {
    importingStorage.value = false;
  }
}

async function exportStorage() {
  storageError.value = "";
  storageMessage.value = "";
  try {
    const data = readStorage();
    await saveFile(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "omniStudioNextLocalStorage.json");
  } catch (err) {
    storageError.value = err instanceof Error ? err.message : "导出缓存失败";
  }
}

function loadStorage() {
  storageError.value = "";
  storageMessage.value = "";
  try {
    storageEntries.value = Object.entries(readStorage()).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => ({ key, value }));
    editingKey.value = null;
  } catch (err) {
    storageError.value = err instanceof Error ? err.message : "读取缓存失败";
  }
}

function editStorage(entry: { key: string; value: string }) {
  editingKey.value = entry.key;
  storageValue.value = entry.value;
}

function writeStorage(entry: { key: string; value: string }, value: string | null) {
  if (storageBusy.value) return;
  writingStorage.value = true;
  storageError.value = "";
  storageMessage.value = "";
  try {
    if (readStorage()[entry.key] !== entry.value) throw new Error("这条数据已发生变化，请刷新列表后重试。");
    saveStorage([[entry.key, value]]);
    if (editingKey.value === entry.key) editingKey.value = null;
    loadStorage();
    storageMessage.value = "已保存，重新加载页面后生效。";
  } catch (err) {
    storageError.value = err instanceof Error ? err.message : "更新缓存失败";
  } finally {
    writingStorage.value = false;
  }
}

loadStorage();

async function installFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || installing.value) return;
  await installPlugin("file", file);
}

async function installUrl() {
  if (!pluginUrl.value.trim() || installing.value) return;
  await installPlugin("url");
}

async function installPlugin(sourceType: "file" | "url", file?: File) {
  const type = installType.value;
  installing.value = sourceType;
  installError.value = "";
  installedName.value = "";
  try {
    if (file) {
      installedName.value = await installPluginFile(type, file, forceInstall.value);
    } else {
      const { data } = await axios.post(`/api/${type}s/install`, { url: pluginUrl.value.trim(), force: forceInstall.value }, { headers: { "x-omnistudio-next-workspace": "1" } });
      if (data.code !== 200) throw new Error(data.message || "安装失败");
      installedName.value = data.data.name;
      window.dispatchEvent(new CustomEvent("omnistudio-next:plugin-installed", { detail: { type, name: data.data.name } }));
    }
  } catch (err) {
    installError.value = axios.isAxiosError<{ message?: string }>(err) ? err.response?.data.message || "安装失败，请检查网络后重试" : err instanceof Error ? err.message : "安装失败";
  } finally {
    installing.value = "";
  }
}

const isDesktop = new URLSearchParams(window.location.search).get("desktop") === "1";
const opening = ref(false);
const requestError = ref("");

async function openDevTools() {
  if (!isDesktop || opening.value) return;
  opening.value = true;
  requestError.value = "";
  try {
    const response = await fetch("/api/desktop/devtools", { method: "POST", headers: { "x-omnistudio-next-desktop": "1" } });
    if (!response.ok) throw new Error((await response.json()).message || "打开开发者工具失败，请重试。");
  } catch (error) {
    requestError.value = error instanceof Error ? error.message : "打开开发者工具失败，请重试。";
  } finally {
    opening.value = false;
  }
}
</script>

<style lang="scss" scoped>
.developerPanel {
  position: relative; height: 100%; min-width: 0; overflow: hidden;
  .developer {
    display: flex; flex-direction: column; gap: 32px; height: 100%; min-width: 0; overflow: auto; overscroll-behavior: contain; padding-right: 4px;
    &.blurred { filter: blur(6px); user-select: none; pointer-events: none; }
    h3 { margin: 0; color: var(--uiTextPrimary); font-size: var(--uiFontLabel); font-weight: 600; }
    .toolDescription { min-width: 0; p { max-width: 70ch; margin: 8px 0 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; } }
    .developerRow { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; min-width: 0; .toolDescription { flex: 1 1 280px; } }
    .toolsSection { display: flex; flex-direction: column; gap: 24px; min-width: 0; .browserHint { margin: -12px 0 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); } }
    .updateSourceSection, .pluginInstaller, .storageManager { display: flex; flex-direction: column; gap: 20px; min-width: 0; padding-top: 28px; border-top: 1px solid var(--uiBorderDefault); }
    .updateSourceSection .updateSourceEditor, .pluginInstaller .urlInstaller { display: flex; flex-wrap: wrap; gap: 12px; min-width: 0; :deep(.uiInput) { flex: 1 1 240px; min-width: 0; } }
    .pluginInstaller .installerHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; :deep(.uiPopover) { width: 180px; } }
    .storageManager {
      .storageToolbar, .storageActions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
      .storageItem { display: flex; flex-direction: column; gap: 16px; min-width: 0; padding-top: 20px; border-top: 1px solid var(--uiBorderDefault); .storageHeader { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; .storageKey { min-width: 0; overflow-wrap: anywhere; font-size: var(--uiFontControl); font-weight: 500; } } .storageValue { margin: 0; max-height: 160px; overflow: auto; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; } }
    }
  }
  .developerConfirm { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; padding: 24px; overflow: auto; text-align: center; background: color-mix(in srgb, var(--uiBackgroundBase) 90%, transparent); h3 { margin: 0; font-size: var(--uiFontHeading); } p { max-width: 44ch; margin: 0; color: var(--uiTextBody); font-size: var(--uiFontBody); line-height: 1.7; } }
}
</style>

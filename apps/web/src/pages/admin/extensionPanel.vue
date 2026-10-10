<template>
  <section class="extensionsPanel">
    <header class="extensionHeader"><div><h2>平台扩展</h2><p>root 管理全局扩展，已启用的功能供所有用户使用。</p></div><div class="extensionActions"><uiButton variant="secondary" :loading="loading" @click="load">刷新扩展</uiButton><uiButton @click="installVisible = true">安装扩展</uiButton></div></header>
    <p v-if="errorMessage" class="extensionError" role="alert">{{ errorMessage }}</p>
    <details v-if="category === 'skill' && skillDiagnostics.length" class="skillDiagnostics"><summary>有 {{ skillDiagnostics.length }} 条技能加载提示</summary><ul><li v-for="(item, index) in skillDiagnostics" :key="index">{{ item.path }}：{{ item.message }}</li></ul></details>
    <uiTabs :modelValue="category" :options="categories" label="扩展类型" @update:modelValue="value => typeof value === 'string' && (category = value)">
      <ffmpeg v-if="category === 'ffmpeg'" />
      <uiTable v-else class="extensionTable" :rows="visiblePlugins" :columns="columns" :loading="loading" emptyText="这个类型还没有扩展" label="已安装扩展"><template #cell="{ row, column }"><div v-if="column.key === 'displayName'" class="extensionName"><strong>{{ row.displayName }}</strong><span>{{ row.description || row.name }}</span><span v-if="(row.warnings as string[] | undefined)?.length">{{ (row.warnings as string[]).join("；") }}</span></div><span v-else-if="column.key === 'enabled'">{{ row.type === 'skill' ? ((row.warnings as string[] | undefined)?.length ? '可用 · 有提示' : '可用') : row.enabled ? '已启用' : '已停用' }}</span><div v-else-if="column.key === 'actions'" class="rowActions"><uiButton v-if="row.type === 'tool' || row.type === 'node'" variant="ghost" size="small" :disabled="busy || !((row.configRules as unknown[])?.length)" @click="configure(row as unknown as Plugin)">配置</uiButton><uiButton v-if="row.type !== 'skill'" variant="ghost" size="small" :disabled="busy" @click="toggle(row as unknown as Plugin)">{{ row.enabled ? '停用' : '启用' }}</uiButton><uiButton variant="danger" size="small" :disabled="busy" @click="uninstall(row as unknown as Plugin)">卸载</uiButton></div><span v-else>{{ row[column.key] ?? '—' }}</span></template></uiTable>
    </uiTabs>
    <pluginConfigDialog v-if="configPlugin" v-model="configVisible" :plugin="configPlugin" :canManage="true" />
    <uiDialog v-model="installVisible" title="安装平台扩展" :width="560" :closeOnClickModal="!busy">
      <form class="installForm" @submit.prevent="install">
        <uiField label="扩展类型"><uiRadioGroup :modelValue="installType" :options="installTypes" variant="segmented" :disabled="busy" @update:modelValue="value => ['node','tool','skill','agent'].includes(String(value)) && (installType = value as PluginType)" /></uiField>
        <uiField v-if="installType === 'skill'" label="技能文件">
          <template #default="{ id }"><div class="skillFileControls"><input :id="id" ref="skillFileInput" type="file" accept=".md,.zip,.tar,.tar.gz,.tgz" :disabled="busy" @change="selectSkillFile" /><uiButton v-if="skillFile" variant="ghost" size="small" :disabled="busy" @click="clearSkillFile">移除文件</uiButton></div></template>
        </uiField>
        <uiField label="下载地址" :required="!skillFile"><template #default="{ id }"><uiInput :id="id" v-model.trim="installUrl" type="url" :required="!skillFile" :disabled="busy || !!skillFile" placeholder="扩展文件的 HTTP(S) 直链" /></template></uiField>
        <uiCheckbox v-model="force" :disabled="busy">允许覆盖同名扩展</uiCheckbox>
        <p>安装或覆盖会影响所有用户，请使用可信来源。现有个人项目和资产不会被移除。</p>
        <p v-if="installError" class="extensionError" role="alert">{{ installError }}</p>
        <uiButton htmlType="submit" :disabled="busy || (!installUrl && !skillFile)" :loading="busy">安装扩展</uiButton>
      </form>
    </uiDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import axios from "axios";
import { uiButton, uiTable, uiTabs, uiDialog, uiField, uiInput, uiRadioGroup, uiCheckbox, useUiFeedback, isUiCancelledError, type UiColumn } from "@omnistudio-next/ui";
import { authClient, type ApiResponse } from "@/lib/authApi";
import pluginConfigDialog from "@/components/settings/panels/pluginMarket/pluginConfigDialog.vue";
import ffmpeg from "@/components/settings/panels/pluginMarket/ffmpeg.vue";
import type { Plugin, PluginType } from "@/components/settings/panels/pluginMarket/types";
import { installPluginFile } from "@/components/settings/installPluginFile";
const feedback = useUiFeedback(); const plugins = ref<Plugin[]>([]); const loading = ref(false); const busy = ref(false); const errorMessage = ref("");
const category = ref("tool"); const categories = [{ value: "tool", label: "工具" }, { value: "node", label: "节点" }, { value: "skill", label: "技能" }, { value: "agent", label: "Agent 插件" }, { value: "ffmpeg", label: "FFmpeg" }];
const columns: UiColumn[] = [{ key: "displayName", label: "扩展" }, { key: "version", label: "版本", width: 120 }, { key: "enabled", label: "状态", width: 110 }, { key: "actions", label: "操作", width: 250, align: "right" }];
const visiblePlugins = computed(() => plugins.value.filter(plugin => plugin.type === category.value).map(plugin => ({ ...plugin })));
const configPlugin = ref<Plugin>(); const configVisible = ref(false); const installVisible = ref(false); const installUrl = ref(""); const installType = ref<PluginType>("tool"); const force = ref(false); const installError = ref("");
const skillFile = ref<File>(); const skillFileInput = ref<HTMLInputElement>(); const skillDiagnostics = ref<{ path: string; message: string }[]>([]);
const installTypes = categories.filter(option => option.value !== "ffmpeg");
const prefixes = { tool: "tools", node: "nodes", skill: "skills", agent: "agents" };
function errorText(error: unknown) { return axios.isAxiosError(error) ? error.response?.data?.message || "连接中断，请刷新后确认结果" : error instanceof Error ? error.message : "操作失败，请重试"; }
async function load() {
  loading.value = true; errorMessage.value = "";
  try {
    const [tools, nodes, skills, agents] = await Promise.all([authClient.get<ApiResponse<{ tools: Plugin[] }>>("/api/tools/get"), authClient.get<ApiResponse<Plugin[]>>("/api/nodes/get"), authClient.get<ApiResponse<{ skills: Plugin[]; diagnostics: { path: string; message: string }[] }>>("/api/skills/get"), authClient.get<ApiResponse<{ agents: Plugin[] }>>("/api/agents/get")]);
    plugins.value = [...tools.data.data.tools.map(plugin => ({ ...plugin, type: "tool" as const, key: `tool:${plugin.name}` })), ...nodes.data.data.map(plugin => ({ ...plugin, type: "node" as const, key: `node:${plugin.name}` })), ...skills.data.data.skills.map(plugin => ({ ...plugin, type: "skill" as const, key: `skill:${plugin.name}` })), ...agents.data.data.agents.map(plugin => ({ ...plugin, type: "agent" as const, key: `agent:${plugin.name}` }))];
    skillDiagnostics.value = skills.data.data.diagnostics;
  } catch (error) { errorMessage.value = errorText(error); }
  finally { loading.value = false; }
}
function configure(plugin: Plugin) { configPlugin.value = plugin; configVisible.value = true; }
watch(configVisible, visible => { if (!visible) void load(); });
async function toggle(plugin: Plugin) { busy.value = true; try { await authClient.put(`/api/${prefixes[plugin.type]}/setEnabled`, { name: plugin.name, enabled: !plugin.enabled }); await load(); } catch (error) { errorMessage.value = errorText(error); } finally { busy.value = false; } }
async function uninstall(plugin: Plugin) { try { await feedback.confirm(`卸载平台扩展「${plugin.displayName}」？所有用户将无法继续使用这个扩展，个人项目和资产仍保留。`, "卸载扩展", { danger: true, confirmButtonText: "卸载扩展", cancelButtonText: "保留扩展" }); busy.value = true; await authClient.delete(`/api/${prefixes[plugin.type]}/uninstall`, { data: { name: plugin.name } }); await load(); } catch (error) { if (!isUiCancelledError(error)) errorMessage.value = errorText(error); } finally { busy.value = false; } }
function selectSkillFile(event: Event) { skillFile.value = (event.target as HTMLInputElement).files?.[0]; if (skillFile.value) installUrl.value = ""; }
function clearSkillFile() { skillFile.value = undefined; if (skillFileInput.value) skillFileInput.value.value = ""; }
watch(installType, clearSkillFile);
async function install() {
  const input = { type: installType.value, url: installUrl.value, file: skillFile.value, force: force.value };
  try {
    await feedback.confirm(`${input.force ? '安装并允许覆盖同名扩展' : '安装扩展'}？${input.type === 'skill' ? '技能包中的所有技能' : '该功能'}将对所有用户生效。`, "安装平台扩展", { danger: input.force, confirmButtonText: "安装扩展", cancelButtonText: "取消" });
    busy.value = true; installError.value = "";
    if (input.type === "skill" && input.file) await installPluginFile("skill", input.file, input.force);
    else { const response = await authClient.post(`/api/${prefixes[input.type]}/install`, { url: input.url, force: input.force }); if (response.data.code !== 200) throw new Error(response.data.message || "安装扩展失败"); }
    installVisible.value = false; installUrl.value = ""; force.value = false; clearSkillFile();
    feedback.message({ tone: "success", message: input.type === "skill" ? "技能包已安装" : "扩展已安装" });
    await load();
  } catch (error) { if (!isUiCancelledError(error)) installError.value = errorText(error); }
  finally { busy.value = false; }
}
onMounted(load);
</script>

<style lang="scss" scoped>
.extensionsPanel { .extensionHeader { display: flex; justify-content: space-between; gap: 20px; margin: 8px 0 24px; h2 { margin: 0 0 8px; font-size: 18px; } p { margin: 0; color: var(--uiTextMuted); line-height: 1.7; font-size: var(--uiFontControl); } .extensionActions { display: flex; gap: 8px; flex-wrap: wrap; } } .extensionName { display: grid; gap: 6px; span { font-size: 12px; color: var(--uiTextMuted); } } .rowActions { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; } .extensionError { color: var(--uiStatusError); font-size: var(--uiFontControl); line-height: 1.7; } }
.installForm { display: grid; gap: 20px; .skillFileControls { display: flex; align-items: center; gap: 8px; input { flex: 1; min-width: 0; } } p { margin: 0; color: var(--uiTextMuted); font-size: var(--uiFontControl); line-height: 1.7; } .extensionError { color: var(--uiStatusError); } }
.extensionsPanel { .extensionTable { :deep(table) { min-width: 760px; } } .skillDiagnostics { margin-bottom: 16px; color: var(--uiTextMuted); overflow-wrap: anywhere; summary { cursor: pointer; } ul { padding-left: 20px; line-height: 1.7; } } }
@media (max-width: 700px) { .extensionsPanel .extensionHeader { flex-direction: column; } }
</style>

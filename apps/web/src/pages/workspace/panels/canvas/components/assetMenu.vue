<template>
  <uiDropdown ref="menu" trigger="manual" :anchor="menuAnchor" :items="menuItems" placement="bottom-start" @command="handleCommand" />
  <shareAssetDialog v-if="activeEntry?.type === 'file'" v-model="shareVisible" :path="activeEntry.path" />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, shallowRef } from "vue";
import axios from "axios";
import saveFile from "@/lib/saveFile";
import shareAssetDialog from "@/components/account/shareAssetDialog.vue";
import { uiDropdown, useUiFeedback, isUiCancelledError, type UiMenuItem, type UiValue } from "@omnistudio-next/ui";
import { IconDownload, IconEdit, IconTrash, IconFolder, IconFolderPlus } from "@tabler/icons-vue";

type AssetEntry = { name: string; path: string; type: "file" | "directory"; children?: AssetEntry[] };
const feedback = useUiFeedback();
const props = defineProps<{ entries: AssetEntry[] }>();
const emit = defineEmits<{ changed: [path?: string, target?: string] }>();
const menu = ref<InstanceType<typeof uiDropdown>>();
const menuAnchor = shallowRef({ getBoundingClientRect: () => new DOMRect() });
const activeEntry = shallowRef<AssetEntry>();
const busy = ref(false);
const shareVisible = ref(false);
const parentPath = computed(() => activeEntry.value?.path.split("/").slice(0, -1).join("/") || ".");
const moveFolders = computed(() => {
  function flatten(items: AssetEntry[]): { label: string; path: string }[] {
    return items.filter(item => item.type === "directory").flatMap(item => [
      { label: item.path, path: item.path },
      ...flatten(item.children ?? []),
    ]);
  }
  return [{ label: "素材库根目录", path: "." }, ...flatten(props.entries)];
});

const menuItems = computed<UiMenuItem[]>(() => {
  const entry = activeEntry.value;
  if (!entry) return [];
  return [
    { value: "move", label: "移动到", icon: IconFolder, disabled: busy.value, children: [
      { value: "newFolder", label: "新建文件夹", icon: IconFolderPlus, disabled: busy.value },
      ...moveFolders.value.map(item => ({ value: "move:" + item.path, label: item.label, icon: IconFolder, disabled: busy.value || destinationDisabled(item.path) })),
    ] },
    ...(entry.type === "file" ? [{ value: "download", label: "下载", icon: IconDownload, divided: true }] : []),
    ...(entry.type === "file" ? [{ value: "share", label: "上传到团队空间", disabled: busy.value }] : []),
    { value: "rename", label: "重命名", icon: IconEdit, disabled: busy.value },
    { value: "delete", label: "删除", icon: IconTrash, disabled: busy.value || !!entry.children?.length },
  ];
});

function destinationDisabled(path: string) {
  const entry = activeEntry.value;
  return path === parentPath.value || (entry?.type === "directory" && (path === entry.path || path.startsWith(entry.path + "/")));
}

async function openMenu(event: MouseEvent, entry: AssetEntry) {
  menu.value?.close();
  activeEntry.value = entry;
  const target = event.currentTarget as HTMLElement;
  const rect = event.type === "contextmenu" ? new DOMRect(event.clientX, event.clientY, 0, 0) : target.getBoundingClientRect();
  menuAnchor.value = { getBoundingClientRect: () => rect };
  await nextTick();
  menu.value?.open();
}

function closeMenu() {
  menu.value?.close();
}

function showError(error: unknown) {
  if (isUiCancelledError(error)) return;
  feedback.message({ tone: "error", message: axios.isAxiosError<{ message: string }>(error) ? error.response?.data.message || error.message : error instanceof Error ? error.message : "素材操作失败" });
}

async function relocate(entry: AssetEntry, target: string) {
  busy.value = true;
  try {
    await axios.post("/api/assets/rename", { path: entry.path, target });
    emit("changed", entry.path, target);
  } finally {
    busy.value = false;
  }
}

async function moveTo(directory: string) {
  const entry = activeEntry.value!;
  closeMenu();
  try {
    await relocate(entry, directory === "." ? entry.name : directory + "/" + entry.name);
  } catch (error) {
    showError(error);
  }
}

async function createMoveFolder() {
  const entry = activeEntry.value!;
  closeMenu();
  try {
    const { value } = await feedback.prompt("新文件夹将创建在素材库根目录", "新建文件夹", {
      inputValue: "新建文件夹",
      inputPattern: /^[^\\/]+$/,
      inputValidator: value => !!value?.trim() || "请输入文件夹名称",
      inputErrorMessage: "名称不能包含斜杠",
      confirmButtonText: "创建并移动",
      cancelButtonText: "取消",
    });
    const name = value.trim();
    await axios.post("/api/assets/mkdir", { path: name });
    await relocate(entry, name + "/" + entry.name);
  } catch (error) {
    showError(error);
    emit("changed");
  }
}

async function handleCommand(command: UiValue) {
  if (typeof command !== "string") return;
  if (command === "share") { closeMenu(); shareVisible.value = true; return; }
  if (command === "newFolder") return createMoveFolder();
  if (command.startsWith("move:")) return moveTo(command.slice(5));
  const entry = activeEntry.value!;
  const parent = parentPath.value;
  closeMenu();
  try {
    if (command === "download") {
      await saveFile(() => axios.get<Blob>("/api/assets/read", { params: { path: entry.path, download: true }, responseType: "blob" }).then(({ data }) => data), entry.name);
    }
    if (command === "rename") {
      const { value } = await feedback.prompt("名称", "重命名", {
        inputValue: entry.name,
        inputPattern: /^[^\\/]+$/,
        inputValidator: value => !!value?.trim() || "请输入名称",
        inputErrorMessage: "名称不能包含斜杠",
        confirmButtonText: "保存",
        cancelButtonText: "取消",
      });
      await relocate(entry, parent === "." ? value.trim() : parent + "/" + value.trim());
    }
    if (command === "delete") {
      await feedback.confirm("确定删除“" + entry.name + "”？", "删除素材", { danger: true, confirmButtonText: "删除", cancelButtonText: "取消" });
      busy.value = true;
      try {
        await axios.delete("/api/assets/remove", { data: { path: entry.path } });
        emit("changed", entry.path);
      } finally {
        busy.value = false;
      }
    }
  } catch (error) {
    showError(error);
  }
}

defineExpose({ openMenu });
</script>

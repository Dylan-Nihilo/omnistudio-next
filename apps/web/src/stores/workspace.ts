import { defineStore } from "pinia";
import { ref } from "vue";
import axios from "axios";
import { getSessionSnapshot } from "@/lib/sessionState";

export type Project = {
  directory: string;
  name: string;
  lastOpenedAt: number;
};

export function normalizeDirectory(path: string) {
  return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

export function isSameDirectory(a?: string | null, b?: string | null) {
  if (!a || !b) return a === b;
  const normA = normalizeDirectory(a);
  const normB = normalizeDirectory(b);
  return normA.localeCompare(normB, undefined, { sensitivity: "accent" }) === 0;
}

export function getProjectOwnerUserId(directory?: string | null): string | undefined {
  if (!directory) return undefined;
  const normalized = normalizeDirectory(directory);
  const match = normalized.match(/\/users\/([a-f0-9-]{36})\/workspaces(?:\/|$)/i);
  return match?.[1]?.toLowerCase();
}

export const useWorkspaceStore = defineStore("workspace", () => {
  const project = ref<Project | null>(null);
  const projectList = ref<Project[]>([]);
  const pendingAgentMessage = ref<{ directory: string; prompt: string; model: string; reasoningEffort: string } | null>(null);

  function sanitizeProjectList(currentUserId = getSessionSnapshot().userId) {
    if (!currentUserId) return;
    const normalizedUserId = currentUserId.toLowerCase();
    projectList.value = projectList.value.filter(item => {
      const owner = getProjectOwnerUserId(item.directory);
      return !owner || owner === normalizedUserId;
    });
  }

  async function openProject(path: string, previousDirectory = path, signal?: AbortSignal, options: { addToProjectList?: boolean } = {}) {
    const { data } = await axios.get<{ code: number; data?: { directory: string }; message?: string }>("/api/workspaces/check", {
      params: { directory: path }, headers: { "x-omnistudio-next-workspace": "1" }, signal,
    });
    signal?.throwIfAborted();
    if (data.code !== 200 || !data.data?.directory) throw new Error(data.message || "工作目录校验失败");
    const checkedDirectory = data.data.directory;
    pendingAgentMessage.value = null;
    const existing = projectList.value.find(project => isSameDirectory(project.directory, previousDirectory))
      ?? projectList.value.find(project => isSameDirectory(project.directory, checkedDirectory));
    project.value = { directory: checkedDirectory, name: existing?.name || checkedDirectory.split(/[\\/]/).filter(Boolean).at(-1) || checkedDirectory, lastOpenedAt: Date.now() };

    const currentUserId = getSessionSnapshot().userId;
    const ownerUserId = getProjectOwnerUserId(checkedDirectory);
    const isOtherUserProject = Boolean(ownerUserId && currentUserId && ownerUserId !== currentUserId.toLowerCase());

    if (isOtherUserProject || options.addToProjectList === false) {
      projectList.value = projectList.value.filter(item => !isSameDirectory(item.directory, checkedDirectory) && !isSameDirectory(item.directory, previousDirectory));
      return;
    }
    projectList.value = [
      project.value,
      ...projectList.value.filter(item => !isSameDirectory(item.directory, previousDirectory) && !isSameDirectory(item.directory, checkedDirectory)),
    ];
  }

  function renameProject(path: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const target = projectList.value.find(item => isSameDirectory(item.directory, path));
    if (target) target.name = trimmedName;
    if (project.value && isSameDirectory(project.value.directory, path)) {
      project.value = target ?? { ...project.value, name: trimmedName };
    }
  }

  function removeProject(path: string) {
    projectList.value = projectList.value.filter(item => !isSameDirectory(item.directory, path));
    if (project.value && isSameDirectory(project.value.directory, path)) project.value = null;
  }

  function resetWorkspace() {
    project.value = null;
    projectList.value = [];
    pendingAgentMessage.value = null;
  }

  if (typeof window !== "undefined") {
    window.addEventListener("omnistudio-next:account-changed", () => {
      sanitizeProjectList(getSessionSnapshot().userId);
    });
  }

  return { project, projectList, pendingAgentMessage, sanitizeProjectList, openProject, renameProject, removeProject, resetWorkspace };
}, {
  persist: {
    key: "toonflow.projectList",
    pick: ["project", "projectList"],
  },
});

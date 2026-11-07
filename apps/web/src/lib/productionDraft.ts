import { defaultProductionStyle, findProductionStyle, type ProductionStylePreset } from "@/lib/productionStyles";
import { authClient, type ApiResponse } from "@/lib/authApi";

export type ProductionDramaDraftMode = "create" | "adapt" | "produce" | "redraw";

export type ProductionDraftFileRef = {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
  storageKey: string;
};

export type ProductionDramaDraft = {
  mode: ProductionDramaDraftMode;
  instruction: string;
  pastedScript: string;
  files: ProductionDraftFileRef[];
  style: string;
  stylePreset?: ProductionStylePreset;
  genre: string;
  fusionGenres: string[];
  aspectRatio: string;
  episodeCount: number;
  textModel: string;
  adaptType: string;
  outputLanguage: string;
};

export type ProductionDraftGeneration = {
  rawText: string;
  generatedAt: string;
  providerId: string;
  modelId: string;
  stopReason: string;
  status: "raw" | "parsed" | "invalid";
  error?: string;
  usage: { input: number; output: number; total: number; cost: number } | null;
  result?: Record<string, unknown>;
};

export type ProductionDraftSnapshot = {
  draft: ProductionDramaDraft;
  generationData: ProductionDraftGeneration | null;
  revision: number;
};

let databasePromise: Promise<IDBDatabase> | undefined;
const draftRevisions = new Map<string, number>();
const draftSaveQueues = new Map<string, Promise<void>>();

function openDraftDatabase() {
  if (databasePromise) return databasePromise;
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("omnistudio.productionDraft", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地草稿存储"));
  });
  databasePromise = opening.catch(error => {
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

function draftKey(projectId: string, userId: string) {
  if (!projectId.trim() || !userId.trim()) throw new Error("缺少本地草稿的项目或账号标识");
  return `productionDramaDraft:${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}`;
}

function fileKey(projectId: string, userId: string, fileId = crypto.randomUUID()) {
  if (!projectId.trim() || !userId.trim()) throw new Error("缺少本地附件的项目或账号标识");
  return `${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}:${fileId}`;
}

function isMode(value: unknown): value is ProductionDramaDraftMode {
  return value === "create" || value === "adapt" || value === "produce" || value === "redraw";
}

function isFileRef(value: unknown): value is ProductionDraftFileRef {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<ProductionDraftFileRef>;
  return typeof file.id === "string" && typeof file.name === "string" && typeof file.size === "number" && Number.isFinite(file.size) && file.size > 0
    && typeof file.type === "string" && typeof file.lastModified === "number" && Number.isFinite(file.lastModified) && typeof file.storageKey === "string";
}

function normalizedDraft(value: unknown): ProductionDramaDraft | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<ProductionDramaDraft>;
  if (!isMode(parsed.mode)) return null;
  const requestedStyle = typeof parsed.style === "string" ? parsed.style : defaultProductionStyle;
  const stylePreset = findProductionStyle(requestedStyle);
  return {
    mode: parsed.mode,
    instruction: typeof parsed.instruction === "string" ? parsed.instruction : "",
    pastedScript: typeof parsed.pastedScript === "string" ? parsed.pastedScript : "",
    files: Array.isArray(parsed.files) ? parsed.files.filter(isFileRef) : [],
    style: stylePreset?.nameZh ?? defaultProductionStyle,
    stylePreset,
    genre: typeof parsed.genre === "string" ? parsed.genre : "都市爽文逆袭",
    fusionGenres: Array.isArray(parsed.fusionGenres) ? parsed.fusionGenres.filter((item): item is string => typeof item === "string") : [],
    aspectRatio: typeof parsed.aspectRatio === "string" ? parsed.aspectRatio : "16:9",
    episodeCount: typeof parsed.episodeCount === "number" && Number.isFinite(parsed.episodeCount) ? Math.max(1, Math.min(12, Math.round(parsed.episodeCount))) : 5,
    textModel: typeof parsed.textModel === "string" ? parsed.textModel : "",
    adaptType: typeof parsed.adaptType === "string" ? parsed.adaptType : "",
    outputLanguage: typeof parsed.outputLanguage === "string" ? parsed.outputLanguage : "中文",
  };
}

function draftScopeKey(projectId: string, userId: string) {
  return draftKey(projectId, userId);
}

export function setProductionDraftRevision(projectId: string, userId: string, revision: number) {
  draftRevisions.set(draftScopeKey(projectId, userId), revision);
}

export async function saveProductionDraft(projectId: string, userId: string, draft: ProductionDramaDraft, generationData?: ProductionDraftGeneration | null): Promise<number> {
  const key = draftScopeKey(projectId, userId);
  const previous = draftSaveQueues.get(key) ?? Promise.resolve();
  let revision = 0;
  const save = previous.catch(() => {}).then(async () => {
    const expectedRevision = draftRevisions.get(key) ?? 0;
    const body: { projectId: string; expectedRevision: number; draft: ProductionDramaDraft; generationData?: ProductionDraftGeneration | null } = {
      projectId,
      expectedRevision,
      draft: { ...draft, stylePreset: undefined },
    };
    if (generationData !== undefined) body.generationData = generationData;
    const { data } = await authClient.put<ApiResponse<{ revision: number }>>("/api/productionProjects/scriptDraft/save", body);
    revision = data.data.revision;
    draftRevisions.set(key, revision);
  });
  draftSaveQueues.set(key, save.then(() => {}, () => {}));
  await save;
  return revision;
}

function readLegacyDraft(projectId: string, userId: string): ProductionDramaDraft | null {
  const value = sessionStorage.getItem(draftKey(projectId, userId));
  if (!value) return null;
  try { return normalizedDraft(JSON.parse(value)); }
  catch { return null; }
}

export async function readProductionDraft(projectId: string, userId: string): Promise<ProductionDraftSnapshot | null> {
  const key = draftScopeKey(projectId, userId);
  await draftSaveQueues.get(key)?.catch(() => {});
  const { data } = await authClient.get<ApiResponse<{ draft: unknown; generationData: unknown; revision: number }>>("/api/productionProjects/scriptDraft/get", { params: { projectId } });
  draftRevisions.set(key, data.data.revision);
  const draft = normalizedDraft(data.data.draft);
  if (draft) {
    const generationData = data.data.generationData && typeof data.data.generationData === "object" ? data.data.generationData as ProductionDraftGeneration : null;
    return { draft, generationData, revision: data.data.revision };
  }
  const legacy = readLegacyDraft(projectId, userId);
  if (!legacy) return null;
  const revision = await saveProductionDraft(projectId, userId, legacy);
  return { draft: legacy, generationData: null, revision };
}

export async function saveProductionDraftFile(projectId: string, userId: string, file: File): Promise<ProductionDraftFileRef> {
  const storageKey = fileKey(projectId, userId);
  const database = await openDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("files", "readwrite");
    transaction.objectStore("files").put(file, storageKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("参考文件暂存失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("参考文件暂存已取消"));
  });
  return { id: storageKey, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified, storageKey };
}

export async function readProductionDraftFile(projectId: string, userId: string, storageKey: string): Promise<File | null> {
  const expectedPrefix = `${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}:`;
  if (!storageKey.startsWith(expectedPrefix)) return null;
  const database = await openDraftDatabase();
  return new Promise<File | null>((resolve, reject) => {
    const transaction = database.transaction("files", "readonly");
    const request = transaction.objectStore("files").get(storageKey);
    request.onsuccess = () => resolve(request.result instanceof File ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error("无法读取本地参考文件"));
  });
}

export async function removeProductionDraftFile(projectId: string, userId: string, storageKey: string): Promise<void> {
  const expectedPrefix = `${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}:`;
  if (!storageKey.startsWith(expectedPrefix)) return;
  const database = await openDraftDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("files", "readwrite");
    transaction.objectStore("files").delete(storageKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("无法移除本地参考文件"));
    transaction.onabort = () => reject(transaction.error ?? new Error("移除本地参考文件已取消"));
  });
}

import axios from "axios";
import { ref } from "vue";

export type PlatformModel = {
  providerId: string;
  providerLabel: string;
  modelId: string;
  label: string;
  protocol?: string;
  type?: "text" | "image" | "video" | "audio";
  mediaType?: "text" | "image" | "video" | "audio";
  capabilities?: unknown;
};

export type PlatformDefaultModels = {
  text?: { providerId: string; modelId: string } | null;
  image?: { providerId: string; modelId: string } | null;
  video?: { providerId: string; modelId: string } | null;
};

export const platformTextModels = ref<PlatformModel[]>([]);
export const platformMediaModels = ref<PlatformModel[]>([]);
export const platformDefaultModels = ref<PlatformDefaultModels>({ text: null, image: null, video: null });

type ApiResponse<T> = { code: number; data: T; message: string };

export async function listPlatformTextModels() {
  const { data } = await axios.get<ApiResponse<PlatformModel[]>>("/api/ai/models");
  if (data.code !== 200) throw new Error(data.message || "读取平台模型失败");
  return data.data;
}

export async function listPlatformMediaModels() {
  const { data } = await axios.get<ApiResponse<PlatformModel[]>>("/api/ai/media/models");
  if (data.code !== 200) throw new Error(data.message || "读取平台媒体模型失败");
  return data.data;
}

export async function fetchPlatformCapabilities() {
  try {
    const { data } = await axios.get<ApiResponse<{ models: PlatformModel[]; defaultModels?: PlatformDefaultModels }>>("/api/ai/capabilities");
    if (data.code === 200 && data.data?.defaultModels) {
      platformDefaultModels.value = data.data.defaultModels;
    }
  } catch {}
}

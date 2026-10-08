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

export const platformTextModels = ref<PlatformModel[]>([]);
export const platformMediaModels = ref<PlatformModel[]>([]);

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

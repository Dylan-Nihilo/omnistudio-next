import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { listPlatformMediaModels, listPlatformTextModels, platformMediaModels, platformTextModels, type PlatformModel } from "@/lib/platformModels";

export const usePlatformModelsStore = defineStore("platformModels", () => {
  const textModels = platformTextModels;
  const mediaModels = platformMediaModels;
  const loading = ref(false);
  const errorMessage = ref("");
  const modelChoices = computed(() => textModels.value.map(model => ({ value: JSON.stringify([model.providerId, model.modelId]), providerId: model.providerId, modelId: model.modelId, label: model.label, contextWindow: undefined })));

  async function load() {
    if (loading.value) return;
    loading.value = true;
    errorMessage.value = "";
    try {
      [textModels.value, mediaModels.value] = await Promise.all([listPlatformTextModels(), listPlatformMediaModels()]);
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "读取平台模型失败";
    } finally { loading.value = false; }
  }

  return { textModels, mediaModels, loading, errorMessage, modelChoices, load };
});

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { listPlatformMediaModels, listPlatformTextModels, platformMediaModels, platformTextModels, type PlatformModel } from "@/lib/platformModels";
import { getSessionSnapshot } from "@/lib/sessionState";

export const usePlatformModelsStore = defineStore("platformModels", () => {
  const textModels = platformTextModels;
  const mediaModels = platformMediaModels;
  const loading = ref(false);
  const errorMessage = ref("");
  const modelChoices = computed(() => textModels.value.map(model => ({ value: JSON.stringify([model.providerId, model.modelId]), providerId: model.providerId, modelId: model.modelId, label: model.label, contextWindow: undefined })));

  async function load() {
    if (loading.value) return;
    loading.value = true;
    const session = getSessionSnapshot();
    errorMessage.value = "";
    try {
      const models = await Promise.all([listPlatformTextModels(), listPlatformMediaModels()]);
      if (getSessionSnapshot().revision === session.revision) [textModels.value, mediaModels.value] = models;
    } catch (error) {
      if (getSessionSnapshot().revision === session.revision) errorMessage.value = error instanceof Error ? error.message : "读取平台模型失败";
    } finally { if (getSessionSnapshot().revision === session.revision) loading.value = false; }
  }

  function resetModels() { textModels.value = []; mediaModels.value = []; loading.value = false; errorMessage.value = ""; }

  return { textModels, mediaModels, loading, errorMessage, modelChoices, load, resetModels };
});

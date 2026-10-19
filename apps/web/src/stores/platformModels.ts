import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fetchPlatformCapabilities, listPlatformMediaModels, listPlatformTextModels, platformDefaultModels, platformMediaModels, platformTextModels, type PlatformModel } from "@/lib/platformModels";
import { getSessionSnapshot } from "@/lib/sessionState";

export const usePlatformModelsStore = defineStore("platformModels", () => {
  const textModels = platformTextModels;
  const mediaModels = platformMediaModels;
  const defaultModels = platformDefaultModels;
  const loading = ref(false);
  const errorMessage = ref("");
  const modelChoices = computed(() => [...textModels.value]
    .sort((left, right) => Number(!isDefaultTextModel(left)) - Number(!isDefaultTextModel(right)))
    .map(model => ({ value: JSON.stringify([model.providerId, model.modelId]), providerId: model.providerId, modelId: model.modelId, label: model.label, contextWindow: undefined, videoInput: model.videoInput })));

  function isDefaultTextModel(model: PlatformModel) {
    if (defaultModels.value.text) {
      return model.providerId === defaultModels.value.text.providerId && model.modelId === defaultModels.value.text.modelId;
    }
    return model.providerId === "dashscope" && model.modelId === "text/deepseek-v4.1-flash";
  }

  function isDefaultImageModel(model: PlatformModel) {
    if (defaultModels.value.image) {
      return model.providerId === defaultModels.value.image.providerId && model.modelId === defaultModels.value.image.modelId;
    }
    return false;
  }

  function isDefaultVideoModel(model: PlatformModel) {
    if (defaultModels.value.video) {
      return model.providerId === defaultModels.value.video.providerId && model.modelId === defaultModels.value.video.modelId;
    }
    return false;
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    const session = getSessionSnapshot();
    errorMessage.value = "";
    try {
      const [models] = await Promise.all([
        Promise.all([listPlatformTextModels(), listPlatformMediaModels()]),
        fetchPlatformCapabilities(),
      ]);
      if (getSessionSnapshot().revision === session.revision) [textModels.value, mediaModels.value] = models;
    } catch (error) {
      if (getSessionSnapshot().revision === session.revision) errorMessage.value = error instanceof Error ? error.message : "读取平台模型失败";
    } finally { if (getSessionSnapshot().revision === session.revision) loading.value = false; }
  }

  function resetModels() { textModels.value = []; mediaModels.value = []; defaultModels.value = { text: null, image: null, video: null }; loading.value = false; errorMessage.value = ""; }

  return { textModels, mediaModels, defaultModels, loading, errorMessage, modelChoices, isDefaultTextModel, isDefaultImageModel, isDefaultVideoModel, load, resetModels };
});

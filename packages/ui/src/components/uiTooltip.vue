<template>
  <uiPopover ref="popover" v-model:visible="visible" @show="describe" @hide="clearDescription" trigger="hover" role="tooltip" :disabled="disabled || !content" :placement="placement" :showAfter="showAfter" :hideAfter="120">
    <template #reference="{ panelId }"><span class="tooltipReference" :aria-describedby="visible ? panelId : undefined"><slot :describedBy="visible ? panelId : undefined" /></span></template>
    <span class="tooltipContent">{{ content }}</span>
  </uiPopover>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import uiPopover from "./uiPopover.vue";
import type { UiPlacement } from "../types";
withDefaults(defineProps<{ content: string; disabled?: boolean; placement?: UiPlacement; showAfter?: number }>(), { disabled: false, placement: "top", showAfter: 350 });
const visible = ref(false);
const popover = ref<InstanceType<typeof uiPopover>>();
let control: HTMLElement | undefined;
function clearDescription() { if (!control || !popover.value?.panel) return; const values = (control.getAttribute("aria-describedby") ?? "").split(" ").filter(id => id && id !== popover.value!.panel!.id); if (values.length) control.setAttribute("aria-describedby", values.join(" ")); else control.removeAttribute("aria-describedby"); control = undefined; }
function describe() { control = popover.value?.reference?.querySelector<HTMLElement>("button,a,input,[tabindex]") ?? undefined; if (!control || !popover.value?.panel) return; control.setAttribute("aria-describedby", [...new Set([...(control.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean), popover.value.panel.id])].join(" ")); }
onBeforeUnmount(clearDescription);
</script>

<style scoped lang="scss">
.tooltipReference { display: inline-flex; min-width: 0; }
.tooltipContent { display: block; max-width: 320px; overflow-wrap: anywhere; font-size: var(--uiFontControl); }
</style>

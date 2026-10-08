<template>
  <uiPopover ref="popover" v-model:visible="visible" role="menu" :trigger="trigger" :placement="placement" :disabled="disabled" :anchor="anchor" @show="focusMenu" @hide="emit('visibleChange', false)">
    <template #reference="slotProps"><span @keydown.down.prevent="open()" @keydown.up.prevent="open(true)"><slot name="reference" v-bind="slotProps" /></span></template>
    <div class="uiDropdownMenu" @keydown.stop="handleKeydown">
      <div v-for="(item, index) in items" :key="valueKey(item.value)" class="menuEntry" :class="{ isDivided: item.divided }">
        <uiDropdown v-if="item.children?.length" :ref="element => submenus[index] = element as UiDropdownApi | null" :items="item.children" placement="right-start" trigger="hover" :disabled="item.disabled" @command="selectValue">
          <template #reference="{ panelId }">
            <button :ref="element => buttons[index] = element as HTMLButtonElement | null" type="button" role="menuitem" :disabled="item.disabled" aria-haspopup="menu" :popovertarget="panelId" popovertargetaction="show" @pointermove="activeIndex = index" @click="submenus[index]?.open()">
              <component v-if="item.icon" :is="item.icon" :size="16" aria-hidden="true" /><span>{{ item.label }}</span><span class="menuArrow" aria-hidden="true">›</span>
            </button>
          </template>
        </uiDropdown>
        <button v-else :ref="element => buttons[index] = element as HTMLButtonElement | null" type="button" role="menuitem" :disabled="item.disabled" @pointermove="activeIndex = index" @click="selectValue(item.value)">
          <component v-if="item.icon" :is="item.icon" :size="16" aria-hidden="true" /><span>{{ item.label }}</span>
        </button>
      </div>
    </div>
  </uiPopover>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import uiPopover from "./uiPopover.vue";
import type { VirtualElement } from "@floating-ui/dom";
import type { UiDropdownApi, UiMenuItem, UiPlacement, UiValue } from "../types";
import { valueKey } from "../values";
const props = withDefaults(defineProps<{ items: UiMenuItem[]; disabled?: boolean; trigger?: "click" | "hover" | "manual" | "contextmenu"; placement?: UiPlacement; hideOnClick?: boolean; anchor?: HTMLElement | VirtualElement }>(), { disabled: false, trigger: "click", placement: "bottom-start", hideOnClick: true });
const emit = defineEmits<{ command: [value: UiValue]; visibleChange: [value: boolean] }>();
const visible = defineModel<boolean>("visible", { default: false });
const popover = ref<InstanceType<typeof uiPopover>>();
const buttons: (HTMLButtonElement | null)[] = [];
const submenus: (UiDropdownApi | null)[] = [];
const activeIndex = ref(0);
let keyboardOpen = false;
watch(visible, opened => { if (!opened) { submenus.forEach(menu => menu?.close()); keyboardOpen = false; } });
async function open(last = false) { if (props.disabled) return; keyboardOpen = true; activeIndex.value = last ? props.items.findLastIndex(item => !item.disabled) : props.items.findIndex(item => !item.disabled); popover.value?.open(); await nextTick(); if (popover.value?.panel?.matches(":popover-open")) buttons[activeIndex.value]?.focus(); }
async function focusMenu() { emit("visibleChange", true); if (props.trigger === "hover" && !keyboardOpen) return; await nextTick(); if (props.items[activeIndex.value]?.disabled) activeIndex.value = props.items.findIndex(item => !item.disabled); buttons[activeIndex.value]?.focus(); keyboardOpen = false; }
function selectValue(value: UiValue) { emit("command", value); if (props.hideOnClick) visible.value = false; }
function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Escape" || event.key === "ArrowLeft") { event.preventDefault(); visible.value = false; return; }
  if (event.key === "Tab") { visible.value = false; return; }
  if (event.key === "ArrowRight") { if (submenus[activeIndex.value]) { event.preventDefault(); submenus[activeIndex.value]?.open(); } return; }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const indices = props.items.flatMap((item, index) => item.disabled ? [] : [index]);
  const current = indices.indexOf(activeIndex.value);
  activeIndex.value = event.key === "Home" ? indices[0] ?? -1 : event.key === "End" ? indices.at(-1) ?? -1 : indices[(current + (event.key === "ArrowDown" ? 1 : -1) + indices.length) % indices.length] ?? -1;
  buttons[activeIndex.value]?.focus();
}
defineExpose({ open, close: () => { visible.value = false; } });
</script>

<style scoped lang="scss">
.uiDropdownMenu {
  min-width: 160px;
  .menuEntry {
    &.isDivided { border-top: 1px solid var(--uiBorderDefault); margin-top: 4px; padding-top: 4px; }
    button { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 34px; padding: 8px 10px; border: 0; border-radius: var(--uiRadiusControl); color: var(--uiTextBody); background: transparent; font: inherit; font-size: var(--uiFontControl); text-align: left; cursor: pointer; span { min-width: 0; overflow-wrap: anywhere; } &:hover:not(:disabled), &:focus-visible { background: var(--uiSurfaceHover); } &:disabled { color: var(--uiStateDisabledText); cursor: not-allowed; } .menuArrow { margin-inline-start: auto; } }
    :deep(.uiPopover), :deep(.popoverReference) { width: 100%; }
  }
}
</style>

<template>
  <div class="uiCollapse">
    <details v-for="item in items" :key="valueKey(item.value)" :open="opened.includes(item.value)" @toggle="toggle(item.value, $event)">
      <summary>{{ item.label }}</summary><div class="collapseContent"><slot :item="item" /></div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UiOption, UiValue } from "../types";
import { valueKey } from "../values";
const props = withDefaults(defineProps<{ modelValue?: UiValue | UiValue[]; items: UiOption[]; accordion?: boolean }>(), { accordion: false });
const emit = defineEmits<{ "update:modelValue": [value: UiValue | UiValue[] | undefined]; change: [value: UiValue | UiValue[] | undefined] }>();
const opened = computed(() => Array.isArray(props.modelValue) ? props.modelValue : props.modelValue === undefined ? [] : [props.modelValue]);
function toggle(value: UiValue, event: Event) {
  const open = (event.target as HTMLDetailsElement).open;
  if (opened.value.includes(value) === open) return;
  const values = open ? [...opened.value, value] : opened.value.filter(item => item !== value);
  const next = props.accordion ? open ? value : undefined : values;
  emit("update:modelValue", next); emit("change", next);
}
</script>

<style scoped lang="scss">
.uiCollapse {
  details { border-bottom: 1px solid var(--uiBorderDefault); summary { padding: 12px 4px; cursor: pointer; color: var(--uiTextBody); overflow-wrap: anywhere; } .collapseContent { padding: 4px 0 16px; min-width: 0; } }
}
</style>

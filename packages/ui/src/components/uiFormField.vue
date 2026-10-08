<template>
  <div class="uiFormField" :data-ui-field="prop" @change.capture="validate('change')" @input.capture="validate('input')" @focusout.capture="handleBlur">
    <uiField :id="id" :label="label" :error="message" :help="help" :required="isRequired"><template #default="slotProps"><slot v-bind="slotProps" :disabled="context?.disabled.value ?? false" /></template></uiField>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, provide, watch } from "vue";
import uiField from "./uiField.vue";
import { uiFieldKey, uiFormKey } from "../form";
const props = defineProps<{ prop: string; id?: string; label?: string; help?: string; error?: string; required?: boolean }>();
const context = inject(uiFormKey, undefined);
const message = computed(() => props.error ?? context?.errors.value[props.prop]);
const isRequired = computed(() => props.required || context?.required(props.prop) || false);
watch([() => props.prop, () => props.label, () => props.required], ([field, label, required], _previous, onCleanup) => { const unregister = context?.register(field, label, required); onCleanup(() => unregister?.()); }, { immediate: true });
async function validate(trigger: string) { await nextTick(); await context?.validateField(props.prop, trigger).catch(() => undefined); }
provide(uiFieldKey, validate);
function handleBlur(event: FocusEvent) { if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) return; validate("blur"); }
</script>

<style scoped lang="scss">
.uiFormField { min-width: 0; }
</style>

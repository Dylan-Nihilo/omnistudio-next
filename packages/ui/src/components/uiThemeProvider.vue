<template>
  <div class="uiTheme" :data-ui-mode="effectiveMode" :data-ui-accent="accent" :style="themeStyle">
    <slot />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { createUiTheme, type UiAccent, type UiMode } from "../theme";

const props = withDefaults(defineProps<{ mode?: UiMode; accent?: UiAccent; fontScale?: number; radius?: number; primaryColor?: string }>(), {
  mode: "dark", accent: "orange", fontScale: 100, radius: 8,
});
const systemDark = ref(false);
let media: MediaQueryList | undefined;
const effectiveMode = computed(() => props.mode === "system" ? (systemDark.value ? "dark" : "light") : props.mode);
const themeStyle = computed(() => createUiTheme(effectiveMode.value, props.accent, props.fontScale, props.radius, props.primaryColor));
function updateSystemMode(event: MediaQueryListEvent) { systemDark.value = event.matches; }
onMounted(() => {
  media = window.matchMedia("(prefers-color-scheme: dark)");
  systemDark.value = media.matches;
  media.addEventListener("change", updateSystemMode);
});
onBeforeUnmount(() => media?.removeEventListener("change", updateSystemMode));
</script>

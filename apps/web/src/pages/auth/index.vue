<template>
  <main class="authPage">
    <section class="authPanel">
      <img class="authLogo" :src="logoUrl" alt="OmniStudio" />
      <h1>OmniStudio</h1>
      <p>正在检查系统状态…</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import logoUrl from "@toonflow/assets/omniStudioLogo.svg";
</script>

<style scoped>
.authPage { min-height: 100dvh; display: grid; place-items: center; background: #090909; color: #f5f5f5; }
.authPanel { width: min(420px, calc(100% - 40px)); text-align: center; }
.authLogo { width: 180px; margin-bottom: 24px; border-radius: 8px; }
.authPanel h1 { margin: 0 0 12px; font-size: 28px; }
.authPanel p { color: #aaa; }
</style>

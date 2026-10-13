<template>
  <div class="accountShell">
    <aside class="accountSidebar" aria-label="主导航">
      <a class="accountBrand" href="#/home"><img :src="logoUrl" alt="万象点点" /></a>
      <nav class="accountNavigation">
        <router-link to="/home" class="navigationLink"><icon-folders :size="18" aria-hidden="true" />我的项目</router-link>
        <router-link to="/account" class="navigationLink"><icon-user-circle :size="18" aria-hidden="true" />个人账户</router-link>
        <router-link to="/teams" class="navigationLink"><icon-users-group :size="18" aria-hidden="true" />团队空间</router-link>
        <router-link v-if="auth.isRoot" to="/admin" class="navigationLink"><icon-shield-lock :size="18" aria-hidden="true" />平台管理</router-link>
      </nav>
      <div class="accountIdentity">
        <div class="identityHeader">
          <div class="identityUser">
            <span class="identityName" :title="auth.user?.displayName">{{ auth.user?.displayName }}</span>
            <span v-if="auth.isRoot" class="rootBadge">root</span>
          </div>
          <uiIconButton variant="ghost" size="small" :icon="IconLogout" label="退出登录" title="退出登录" class="logoutButton" @click="handleSignOut" />
        </div>
        <span class="identityEmail" :title="auth.user?.email">{{ auth.user?.email }}</span>
      </div>
    </aside>
    <main class="accountMain">
      <header class="accountPageHeader"><div><span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span><h1>{{ title }}</h1><p v-if="description">{{ description }}</p></div><div class="headerActions"><slot name="actions" /></div></header>
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { uiIconButton, useUiFeedback, isUiCancelledError } from "@omnistudio-next/ui";
import { IconLogout } from "@tabler/icons-vue";
import logoUrl from "@omnistudio-next/assets/omniStudioNextLogo.svg";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const feedback = useUiFeedback();
defineProps<{ title: string; description?: string; eyebrow?: string }>();

async function handleSignOut() {
  try {
    const accountName = auth.user?.displayName || auth.user?.email || "当前账户";
    await feedback.confirm(`确定退出当前账户「${accountName}」？`, "退出登录", {
      danger: true,
      confirmButtonText: "退出登录",
      cancelButtonText: "取消",
    });
    await auth.signOut();
  } catch (error) {
    if (!isUiCancelledError(error)) throw error;
  }
}
</script>

<style lang="scss" scoped>
.accountShell {
  display: grid; grid-template-columns: 236px minmax(0, 1fr); min-height: 100dvh; background: var(--uiBackgroundBase); color: var(--uiTextPrimary);
  .accountSidebar { display: flex; flex-direction: column; gap: 32px; border-right: 1px solid var(--uiBorderDefault); padding: 28px 20px; min-width: 0;
    .accountBrand { display: block; img { width: 170px; max-width: 100%; height: auto; } }
    .accountNavigation { display: grid; gap: 6px; .navigationLink { display: flex; align-items: center; gap: 10px; min-height: 44px; box-sizing: border-box; padding: 10px 12px; border-radius: var(--uiRadiusBase, 8px); color: var(--uiTextBody); text-decoration: none; font-size: var(--uiFontControl); svg { flex-shrink: 0; } &:hover { background: var(--uiBackgroundSubtle); } &.router-link-active { color: var(--uiActionPrimary); background: color-mix(in srgb, var(--uiActionPrimary) 9%, transparent); } } }
    .accountIdentity {
      display: flex; flex-direction: column; gap: 4px; margin-top: auto; padding: 14px 4px 0; border-top: 1px solid var(--uiBorderDefault); min-width: 0;
      .identityHeader {
        display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0;
        .identityUser {
          display: flex; align-items: center; gap: 6px; min-width: 0;
          .identityName { font-size: var(--uiFontControl); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .rootBadge { flex-shrink: 0; width: fit-content; padding: 1px 5px; border: 1px solid var(--uiBorderDefault); border-radius: 4px; color: var(--uiActionPrimary); font-size: 11px; }
        }
        .logoutButton {
          flex-shrink: 0; color: var(--uiTextMuted);
          &:hover { color: var(--uiStatusError); background: var(--uiStatusErrorSoft); }
        }
      }
      .identityEmail { display: block; width: 100%; color: var(--uiTextMuted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.4; }
    }
  }
  .accountMain { width: 100%; box-sizing: border-box; padding: 40px clamp(24px, 4vw, 64px) max(48px, env(safe-area-inset-bottom)); min-width: 0;
    .accountPageHeader { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; padding-bottom: 28px; margin-bottom: 28px; border-bottom: 1px solid var(--uiBorderDefault); .eyebrow { display: block; color: var(--uiActionPrimary); font-size: 12px; margin-bottom: 8px; } h1 { margin: 0; font-size: clamp(26px, 3vw, 34px); font-weight: 700; line-height: 1.35; } p { margin: 12px 0 0; color: var(--uiTextMuted); font-size: var(--uiFontBody); line-height: 1.7; } .headerActions { display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0; } }
  }
  @media (max-width: 900px) { grid-template-columns: 188px minmax(0, 1fr); .accountSidebar { padding-inline: 14px; } .accountMain { padding: 28px 24px; } }
  @media (max-width: 700px) { display: block; .accountSidebar { padding: 18px 20px 12px; border-right: 0; border-bottom: 1px solid var(--uiBorderDefault); gap: 18px; .accountBrand img { width: 150px; } .accountNavigation { display: flex; gap: 4px; overflow-x: auto; .navigationLink { flex: 0 0 auto; padding: 8px; font-size: 12px; } } .accountIdentity { display: flex; margin-top: 0; padding-top: 12px; } } .accountMain { padding: 28px 20px max(40px, env(safe-area-inset-bottom)); .accountPageHeader { flex-direction: column; gap: 16px; } } }
}
</style>

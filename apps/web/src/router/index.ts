import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { loadSettings } from "@/stores/settings";
import { sessionInvalidated } from "@/lib/sessionState";

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: "/", redirect: "/auth" },
    { path: "/auth", component: () => import("@/pages/auth/index.vue") },
    { path: "/auth/login", component: () => import("@/pages/auth/login.vue") },
    { path: "/auth/register", component: () => import("@/pages/auth/register.vue") },
    { path: "/auth/setup", component: () => import("@/pages/auth/setup.vue") },
    { path: "/auth/invite", component: () => import("@/pages/auth/invite.vue") },
    { path: "/home", component: () => import("@/pages/home/index.vue") },
    { path: "/canvas", redirect: "/workspace" },
    { path: "/workspace", component: () => import("@/pages/workspace/index.vue") },
    { path: "/account", component: () => import("@/pages/account/index.vue") },
    { path: "/teams", component: () => import("@/pages/teams/index.vue") },
    { path: "/admin", meta: { rootOnly: true }, component: () => import("@/pages/admin/index.vue") },
    { path: "/:pathMatch(.*)*", redirect: "/home" },
  ],
});

router.beforeEach(async to => {
  const auth = useAuthStore();
  if (auth.initialized === null) await auth.initialize();
  if (sessionInvalidated.value && !to.path.startsWith("/auth")) return false;
  if (to.path === "/auth") return auth.isAuthenticated ? "/home" : auth.initialized ? "/auth/login" : "/auth/setup";
  if (to.path.startsWith("/auth")) {
    if (to.path !== "/auth/invite" && auth.isAuthenticated && to.query.switch !== "1" && !to.query.invite) return "/home";
    return true;
  }
  if (!auth.isAuthenticated && !await auth.restoreSession()) return { path: "/auth/login", query: { redirect: to.fullPath } };
  if (to.meta.rootOnly && !auth.isRoot) return "/home";
  await loadSettings();
  return true;
});

export default router;

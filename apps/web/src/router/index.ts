import { createRouter, createWebHashHistory } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useWorkspaceStore } from "@/stores/workspace";
import { loadSettings } from "@/stores/settings";

let workspacePrepared = false;

async function prepareWorkspace() {
  await loadSettings();
  if (workspacePrepared) return;
  useWorkspaceStore().$hydrate();
  workspacePrepared = true;
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      redirect: "/auth",
    },
    {
      path: "/auth",
      component: () => import("@/pages/auth/index.vue"),
      beforeEnter: async () => {
        const auth = useAuthStore();
        await auth.initialize();
        if (auth.isAuthenticated) return { path: "/home", replace: true };
        return { path: auth.initialized ? "/auth/login" : "/auth/setup", replace: true };
      },
    },
    {
      path: "/auth/login",
      component: () => import("@/pages/auth/login.vue"),
    },
    {
      path: "/auth/setup",
      component: () => import("@/pages/auth/setup.vue"),
    },
    {
      path: "/home",
      beforeEnter: async () => {
        const auth = useAuthStore();
        if (!auth.isAuthenticated && !(await auth.restoreSession())) return { path: "/auth/login", replace: true };
        await prepareWorkspace();
        return true;
      },
      component: () => import("@/pages/home/index.vue"),
    },
    {
      path: "/canvas",
      redirect: "/workspace",
    },
    {
      path: "/workspace",
      beforeEnter: async () => {
        const auth = useAuthStore();
        if (!auth.isAuthenticated && !(await auth.restoreSession())) return { path: "/auth/login", replace: true };
        await prepareWorkspace();
        return true;
      },
      component: () => import("@/pages/workspace/index.vue"),
    },
    {
      path: "/account",
      beforeEnter: async () => {
        const auth = useAuthStore();
        if (!auth.isAuthenticated && !(await auth.restoreSession())) return { path: "/auth/login", replace: true };
        return true;
      },
      component: () => import("@/pages/account/index.vue"),
    },
  ],
});
export default router;

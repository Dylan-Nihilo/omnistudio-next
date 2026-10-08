import { getCurrentInstance, useId } from "vue";
import type { App } from "vue";

const scopes = new WeakMap<App, number>();
let sequence = 0;

// ACT: plugin bundles share this runtime; SSR apps must set app.config.idPrefix.
export function useUiId() {
  const id = useId(), app = getCurrentInstance()?.appContext.app;
  if (!app || app.config.idPrefix) return id;
  let scope = scopes.get(app);
  if (!scope) { scope = ++sequence; scopes.set(app, scope); }
  return "ui" + scope + "-" + id;
}

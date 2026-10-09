import { ref } from "vue";

declare global {
  interface Window { omniStudioNextSessionSignal?: AbortSignal; }
}

let userId = "";
let csrfToken = "";
let revision = 0;
let controller = new AbortController();
export const sessionInvalidated = ref<"changed" | "expired" | null>(null);
const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("omnistudioNextSession");
window.omniStudioNextSessionSignal = controller.signal;

export function getSessionSnapshot() {
  return { userId, csrfToken, revision, signal: controller.signal };
}

export function invalidateBrowserSession(reason: "changed" | "expired") {
  if (!userId || sessionInvalidated.value) return;
  sessionInvalidated.value = reason;
  revision++;
  controller.abort();
}

export function setBrowserSession(nextUserId: string, nextCsrfToken: string) {
  const changed = userId !== nextUserId || csrfToken !== nextCsrfToken;
  if (!changed && !sessionInvalidated.value) return;
  const identityChanged = userId !== nextUserId;
  controller.abort();
  controller = new AbortController();
  userId = nextUserId;
  csrfToken = nextCsrfToken;
  revision++;
  sessionInvalidated.value = null;
  window.omniStudioNextSessionSignal = controller.signal;
  if (userId) sessionStorage.setItem("omnistudio_account_id", userId);
  else sessionStorage.removeItem("omnistudio_account_id");
  if (identityChanged) window.dispatchEvent(new Event("omnistudio-next:account-changed"));
  if (changed) channel?.postMessage({ userId });
}

if (channel) channel.onmessage = event => {
  const incoming = event.data?.userId;
  if (typeof incoming !== "string" || incoming.length > 36 || !userId) return;
  if (incoming !== userId) invalidateBrowserSession(incoming ? "changed" : "expired");
  else window.dispatchEvent(new Event("omnistudio-next:session-refresh"));
};

window.addEventListener("omnistudio-next:session-invalid", event => invalidateBrowserSession((event as CustomEvent<{ reason?: string }>).detail?.reason === "changed" ? "changed" : "expired"));

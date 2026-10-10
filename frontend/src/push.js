// Background alerts: registers the service worker and subscribes this device to push from the backend.
import { api } from "./api";

const toBytes = (b64) => {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
export const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export async function ensurePush() {
  if (!pushSupported()) return { ok: false, reason: "This browser cannot receive alerts when CareDose is closed." };
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const { key } = await api("/api/push/key");
    if (!key) return { ok: false, reason: "Background alerts are not set up on the server. Run: pip install -r requirements.txt, then restart." };
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
    await api("/api/push/subscribe", { method: "POST", body: sub.toJSON() });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `Could not turn on background alerts: ${e.message}` };
  }
}

// Shows a notification even when the tab is in the background (uses the service worker when available).
export async function showNotice(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const opts = { requireInteraction: true, vibrate: [300, 120, 300], renotify: true, tag: "caredose", ...options };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return await reg.showNotification(title, opts);
  } catch { /* fall through */ }
  new Notification(title, opts);
}
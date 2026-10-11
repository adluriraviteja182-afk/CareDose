// CareDose service worker: receives alarms from the server and shows them even when the app is closed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: "CareDose", body: event.data ? event.data.text() : "" }; }
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    wins.forEach((c) => c.postMessage({ type: "push", data: d }));          // an open app reacts right away
    if (wins.some((c) => c.focused)) return;                                  // and we skip a duplicate popup
    await self.registration.showNotification(d.title || "CareDose", {
      body: d.body, icon: d.icon || undefined, badge: d.icon || undefined, tag: d.tag || "caredose",
      renotify: true, requireInteraction: true, vibrate: [300, 120, 300, 120, 300], data: { url: d.url || "/" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of wins) { if ("focus" in c) { await c.focus(); c.postMessage({ type: "open" }); return; } }
    await self.clients.openWindow(url);
  })());
});

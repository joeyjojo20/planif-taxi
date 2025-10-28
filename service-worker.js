self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data.json(); } catch {}
  const title = data.title || "Notification";
  const body  = data.body  || "";
  const extra = data.data  || {};
  event.waitUntil(
    self.registration.showNotification(title, {
      body, data: extra, icon: "/icon-192.png", badge: "/icon-192.png"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (clients.openWindow) return clients.openWindow("/");
    })
  );
});
// ↓↓↓ AJOUTE EN BAS DU FICHIER ↓↓↓
self.addEventListener("message", (event) => {
  if (!event?.data || event.data.type !== "LOCAL_TEST_NOTIFY") return;
  const p = event.data.payload || {};
  event.waitUntil(
    self.registration.showNotification(p.title || "Test RDV Taxi", {
      body: p.body || "Notification locale (fallback)",
      data: p.data || { url: "/" },
      icon: "/icon-192.png",
      badge: "/icon-192.png"
    })
  );
});


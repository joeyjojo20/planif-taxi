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

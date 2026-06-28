// StreamZone Service Worker — shell cache + offline fallback
const CACHE = "sz-v1";
const SHELL = [
  "/",
  "/manifest.json",
  "/logo.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, API, views, and embed-proxy requests
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/views") ||
    url.pathname.startsWith("/embed-proxy")
  ) return;

  // For navigation requests: network first, fall back to cached shell (/)
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets (JS/CSS/fonts/images): cache first, network fallback
  if (
    url.pathname.match(/\.(js|css|png|svg|ico|woff2?|ttf)$/)
  ) {
    e.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Everything else: network only
});

// Push notification handler
self.addEventListener("push", (e) => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title ?? "StreamZone", {
      body: data.body ?? "A match is starting soon!",
      icon: "/logo.png",
      badge: "/logo.png",
      tag: data.tag ?? "sz-reminder",
      data: { url: data.url ?? "/" },
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url ?? "/";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); return; }
      return clients.openWindow(url);
    })
  );
});

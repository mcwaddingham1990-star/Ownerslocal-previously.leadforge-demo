// Minimal, conservative service worker: only makes the app installable and
// keeps the static shell available offline. Deliberately does NOT cache
// /api/* or anything Firestore-related — real business data must always be
// live, never served stale from a cache.
const CACHE_NAME = "owners-local-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never touch API calls or cross-origin requests (Firebase, Google Maps, Gemini, etc.).
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  if (event.request.mode === "navigate") {
    // Always try the network first for the app shell so users get the
    // latest build; fall back to a cached copy only if fully offline.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // Hashed static assets (JS/CSS/images) are immutable once built — cache-first is safe.
  if (/\.(js|css|png|jpg|jpeg|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            return res;
          })
      )
    );
  }
});

// --- Firebase Cloud Messaging (background push) ---
// Same public Firebase web config already bundled into the app's own client
// JS (see firebase-applet-config.json / src/firebase.ts) — not a secret;
// Firestore security rules protect data, not hiding this config. Wrapped so
// an unsupported browser/context can never break the offline shell caching
// above.
try {
  importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

  firebase.initializeApp({
    apiKey: "AIzaSyCrtpCjin92MUH1IJrIiHgLutDUIQoB7DI",
    authDomain: "gen-lang-client-0834040446.firebaseapp.com",
    projectId: "gen-lang-client-0834040446",
    storageBucket: "gen-lang-client-0834040446.firebasestorage.app",
    messagingSenderId: "1077711892994",
    appId: "1:1077711892994:web:6220911716c3e0985cad1b",
  });

  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = (payload.notification && payload.notification.title) || (payload.data && payload.data.title) || "Owners Local";
    const body = (payload.notification && payload.notification.body) || (payload.data && payload.data.body) || "";
    self.registration.showNotification(title, {
      body,
      icon: "/branding/icon-192.png",
      data: payload.data || {},
    });
  });
} catch {
  // Push not supported in this context (or Firebase Messaging unavailable) —
  // the offline app-shell caching above still works either way.
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});

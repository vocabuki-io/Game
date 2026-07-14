// 最小サービスワーカー：アプリシェルをキャッシュしてオフライン起動を可能にする。
// （WebSocket通信はキャッシュ対象外。オンライン必須）
const CACHE = "prison-break-v1";
const SHELL = ["/", "/index.html", "/styles.css", "/app.js", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // 通信はSW介さない
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});

// scopeを含め、同じGitHub Pages origin上の別ポータルとキャッシュを共有しない。
const CACHE_PREFIX = `my-tools-portal:${self.registration.scope}:`;
const SHELL_CACHE = `${CACHE_PREFIX}shell-v16`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime`;
const LEGACY_RUNTIME_CACHE = "law-tools-portal-v13";
const APP_SHELL = [
  "./", "./index.html", "./manifest.json", "./icons/icon-192.png",
  "./icons/icon-512.png", "./icons/apple-touch-icon.png",
  "./tools/kouatsu-gas-law-viewer.html", "./tools/lp-law-viewer.html",
];
const SHELL_URLS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).href));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // HTTPキャッシュ内の旧HTMLを新世代へ取り込まない。
    await cache.addAll([...SHELL_URLS].map(url => new Request(url, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    // 他ツールのランタイム、旧v2のDB/localStorage、他サイトのキャッシュは削除しない。
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(`${CACHE_PREFIX}shell-`) && key !== SHELL_CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function offlineResponse(request, isShell) {
  const cache = await caches.open(isShell ? SHELL_CACHE : RUNTIME_CACHE);
  const current = await cache.match(request, { ignoreSearch: isShell });
  if (current) return current;
  // 旧シェルへは戻さない。外字等の既存ランタイムだけ、旧ポータルの専用cacheから引継ぐ。
  const relative = new URL(request.url).pathname.slice(new URL(self.registration.scope).pathname.length);
  const legacyRuntime = relative === "tools/gaiji-maker.html" || relative.startsWith("tools/gaiji-maker-assets/") || relative.startsWith("tools/papermirror-jp/");
  if (!isShell && legacyRuntime && (await caches.keys()).includes(LEGACY_RUNTIME_CACHE)) {
    const legacy = await caches.open(LEGACY_RUNTIME_CACHE);
    const saved = await legacy.match(request);
    if (saved) return saved;
  }
  return Response.error();
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Worker自身を古いruntime応答に固定しない。外部の法令API・県資料も介在しない。
  if (url.pathname === new URL("sw.js", self.registration.scope).pathname) return;
  const isShell = SHELL_URLS.has(`${url.origin}${url.pathname}`);
  // respondWithとwaitUntilをイベント受付中に登録し、キャッシュ保存失敗でも取得済み応答を返す。
  const network = fetch(request);
  event.waitUntil(network.then(async response => {
    if (!response.ok || response.status !== 200) return;
    const copy = response.clone();
    const cache = await caches.open(isShell ? SHELL_CACHE : RUNTIME_CACHE);
    await cache.put(request, copy);
  }).catch(() => {}));
  event.respondWith(network.catch(() => offlineResponse(request, isShell)));
});

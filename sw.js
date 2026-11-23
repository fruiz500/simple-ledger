/* Simple Ledger: works offline and picks up updates.
   Every file is network-first: when you are online you always get the newest copy (and it is stored);
   when you are offline the stored copy is used. No version number needs to be raised when files change.
   Add a new file to FILES only if you want it ready for the very first offline visit. */
const CACHE = 'simple-ledger';
const FILES = ['./', 'index.html', 'help.html', 'styles.css', 'favicon.svg', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest', 'js/ai.js','js/aiui.js','js/app.js','js/biz.js','js/bizui.js','js/book.js','js/checks.js','js/checksui.js','js/demo.js','js/diagnose.js','js/flow.js','js/helpcontent.js','js/home.js','js/import.js','js/importui.js','js/journal.js','js/merge.js','js/mergeui.js','js/money.js','js/pocket.js','js/pocketui.js','js/quickui.js','js/reconcile.js','js/reconcileui.js','js/reports.js','js/reportui.js','js/storage.js','js/templates.js','js/ui.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => fetch(f, { cache: 'no-cache' }).then(r => r.ok && c.put(f, r)).catch(() => {})))));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // only our own files; never the exchange-rate or AI calls, and leave the Pocket phone app to its own worker
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || /\/pocket\//.test(u.pathname)) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

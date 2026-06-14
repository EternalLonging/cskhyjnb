const CACHE_NAME = 'quiz-v3';
const SHELL_ASSETS = [
  '.','index.html','practice.html','style.css','manifest.json','3.png',
  'questions.js','config.js','utils.js','data.js','sync.js','state.js','ui.js','app.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'cdn.jsdelivr.net') { e.respondWith(networkFirst(e.request)); return; }
  if (url.hostname.includes('supabase.co')) return;
  if (url.pathname.includes('/assets/')) { e.respondWith(staleWhileRevalidate(e.request)); return; }
  e.respondWith(cacheFirst(e.request));
});
async function cacheFirst(req) {
  const c = await caches.match(req); if (c) return c;
  try { const r = await fetch(req); if (r.ok) { const cache = await caches.open(CACHE_NAME); cache.put(req, r.clone()); } return r; }
  catch(_) { return new Response('', {status:408}); }
}
async function networkFirst(req) {
  try { const r = await fetch(req); if (r.ok) { const cache = await caches.open(CACHE_NAME); cache.put(req, r.clone()); } return r; }
  catch(_) { const c = await caches.match(req); return c || new Response('', {status:408}); }
}
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_NAME); const c = await cache.match(req);
  fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); }).catch(()=>{});
  return c || fetch(req);
}

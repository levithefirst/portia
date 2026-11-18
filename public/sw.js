/*
 * Portia service worker. Hand-written, production builds only.
 * Precaches the app shell ("/", "/app" and the entry assets listed at build
 * time in /sw-precache.json) and serves navigations offline.
 *
 * It NEVER caches or intercepts cross-origin requests. Firebase, Google APIs,
 * gstatic, reCAPTCHA and model traffic always go straight to the network.
 */
const CACHE = 'portia-shell-v1'
const SHELL = ['/', '/app', '/favicon.svg', '/manifest.webmanifest', '/fixture-lease.txt']
const NEVER = /firebase|googleapis|gstatic|recaptcha|google\.com/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      let assets = []
      try {
        const r = await fetch('/sw-precache.json', { cache: 'no-store' })
        if (r.ok) assets = await r.json()
      } catch (e) {
        assets = []
      }
      await cache.addAll([...SHELL, ...assets])
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Same origin only. Anything else (Firebase, Google APIs, reCAPTCHA, fonts) is not touched.
  if (url.origin !== self.location.origin || NEVER.test(url.href)) return

  if (req.mode === 'navigate') {
    // Network first; offline falls back to the cached shell for that route.
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE)
        return (await cache.match(url.pathname.startsWith('/app') ? '/app' : '/')) || (await cache.match('/')) || Response.error()
      }),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    // Cache first for hashed build assets and the shell files.
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok && url.pathname.startsWith('/assets/')) cache.put(req, res.clone())
        return res
      }),
    )
  }
})

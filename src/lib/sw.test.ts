import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const SRC = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8')

/** Runs public/sw.js in a sandbox and returns its fetch listener. */
function loadFetchHandler() {
  const listeners: Record<string, (e: unknown) => void> = {}
  const self = { location: { origin: 'https://askportia.vercel.app' }, addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f) }
  const cache = { match: async () => undefined, put: async () => undefined }
  runInNewContext(SRC, { self, URL, caches: { open: async () => cache }, fetch: () => Promise.reject(new Error('no network in test')), Response })
  return listeners.fetch
}

function intercepts(url: string, mode = 'cors', method = 'GET'): boolean {
  let called = false
  loadFetchHandler()({ request: { url, mode, method }, respondWith: (p: Promise<unknown>) => { called = true; Promise.resolve(p).catch(() => {}) } })
  return called
}

describe('service worker', () => {
  it('never intercepts Firebase, Google APIs, gstatic or reCAPTCHA', () => {
    for (const u of [
      'https://firebasevertexai.googleapis.com/v1beta/projects/x/models/gemini:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models',
      'https://firebaseremoteconfig.googleapis.com/v1/projects/x/namespaces/firebase:fetch',
      'https://content-firebaseappcheck.googleapis.com/v1/projects/x/apps/y:exchangeRecaptchaEnterpriseToken',
      'https://www.google.com/recaptcha/enterprise.js?render=x',
      'https://www.gstatic.com/recaptcha/releases/x/recaptcha__en.js',
      'https://fonts.gstatic.com/s/geist/v1/x.woff2',
    ]) {
      expect(intercepts(u), u).toBe(false)
      expect(intercepts(u, 'navigate'), u).toBe(false)
    }
  })

  it('ignores non-GET requests and handles same-origin navigations and assets', () => {
    expect(intercepts('https://askportia.vercel.app/app', 'navigate', 'POST')).toBe(false)
    expect(intercepts('https://askportia.vercel.app/app', 'navigate')).toBe(true)
    expect(intercepts('https://askportia.vercel.app/assets/index-abc.js')).toBe(true)
  })

  it('source has no fetch handling for those hosts', () => {
    expect(SRC).toMatch(/url\.origin !== self\.location\.origin \|\| NEVER\.test\(url\.href\)\) return/)
    expect(SRC).not.toMatch(/respondWith\([^)]*(googleapis|firebase|gstatic|recaptcha)/)
  })
})

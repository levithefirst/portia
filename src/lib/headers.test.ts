import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const all = vercel.headers.find((h: { source: string }) => h.source === '/(.*)').headers as { key: string; value: string }[]
const get = (k: string) => all.find((h) => h.key === k)?.value ?? ''

describe('security headers in vercel.json', () => {
  it('sets nosniff, frame-ancestors and a report-only CSP', () => {
    expect(get('X-Content-Type-Options')).toBe('nosniff')
    expect(get('Content-Security-Policy')).toContain("frame-ancestors 'none'")
    expect(get('Content-Security-Policy-Report-Only')).toContain("default-src 'self'")
  })

  it('allows the inline theme script in index.html by its exact hash', () => {
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    expect(inline.length).toBe(1)
    const hash = `'sha256-${createHash('sha256').update(inline[0]).digest('base64')}'`
    expect(get('Content-Security-Policy-Report-Only')).toContain(hash)
  })

  it('serves robots.txt and sitemap.xml as files, not the SPA', () => {
    const src = vercel.rewrites[0].source as string
    expect(src).toContain('robots\\.txt$')
    expect(src).toContain('sitemap\\.xml$')
  })
})

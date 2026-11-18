// Generates public/og.png (1200x630) and the PWA icons (192, 512) from the brand.
// Usage: node scripts/make-og.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const mark = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const PAPER = '#FCFBF8'
const INK = '#100F0B'
const ACCENT = '#247D97'

// Newsreader if Google Fonts is reachable; otherwise a Newsreader-style serif fallback.
const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,500&family=Geist+Mono:wght@500&display=swap" rel="stylesheet">`

const og = `<!doctype html><html><head>${FONTS}<style>
  html,body{margin:0;width:1200px;height:630px;background:${PAPER};color:${INK}}
  .wrap{position:relative;box-sizing:border-box;width:1200px;height:630px;padding:72px 84px;display:flex;flex-direction:column;justify-content:space-between}
  .brand{display:flex;align-items:center;gap:18px;font:500 44px 'Newsreader',Georgia,'Times New Roman',serif}
  .brand svg{width:56px;height:56px}
  h1{margin:0;max-width:930px;font:500 82px/1.02 'Newsreader',Georgia,'Times New Roman',serif;letter-spacing:-0.02em}
  .line{font:500 30px 'Geist Mono',ui-monospace,Menlo,monospace;color:${ACCENT}}
  .rule{position:absolute;left:84px;right:84px;bottom:150px;border-top:2px solid ${INK};opacity:.12}
</style></head><body><div class="wrap">
  <div class="brand">${mark}<span>Portia</span></div>
  <h1>See what a lease really costs before you sign.</h1>
  <div class="line">$1,850 rent. $1,961.95 a month.</div>
  <div class="rule"></div>
</div></body></html>`

const icon = (size, pad) => `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${PAPER};display:flex;align-items:center;justify-content:center">
<div style="width:${size - pad * 2}px;height:${size - pad * 2}px">${mark.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(og, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => page.setContent(og.replace(FONTS, '')))
await page.screenshot({ path: 'public/og.png', type: 'png' })
console.log('wrote public/og.png')
for (const size of [192, 512]) {
  // Maskable-safe padding: keep the mark inside the central 80%.
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(icon(size, Math.round(size * 0.14)))
  await page.screenshot({ path: `public/icon-${size}.png`, type: 'png' })
  console.log(`wrote public/icon-${size}.png`)
}
await browser.close()

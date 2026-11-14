// Renders public/fixture-lease.txt into two page images (JPEG + PNG) for demos and tests.
// Usage: node scripts/make-fixture-photos.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const text = readFileSync(new URL('../public/fixture-lease.txt', import.meta.url), 'utf8')
const split = text.indexOf('6. RENEWAL')
const pages = [text.slice(0, split), text.slice(split)]
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const html = (body, n) => `<!doctype html><html><body style="margin:0;background:#d8d4cb">
<div style="width:850px;height:1100px;margin:0;padding:70px 80px;box-sizing:border-box;background:#fbfaf6;
font:15.5px/1.55 Georgia,'Times New Roman',serif;color:#1b1a16;white-space:pre-wrap;
box-shadow:inset 0 0 80px rgba(120,110,90,.18)">${esc(body)}
<div style="position:absolute;bottom:40px;left:0;width:850px;text-align:center;font-size:12px;color:#777">Page ${n} of 2</div></div></body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 850, height: 1100 }, deviceScaleFactor: 1 })
for (const [i, body] of pages.entries()) {
  await page.setContent(html(body, i + 1))
  const path = `public/fixtures/lease-page-${i + 1}.${i === 0 ? 'jpg' : 'png'}`
  await page.screenshot({ path, type: i === 0 ? 'jpeg' : 'png', quality: i === 0 ? 82 : undefined })
  console.log('wrote', path)
}
await browser.close()

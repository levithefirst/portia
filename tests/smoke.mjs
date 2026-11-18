// Portia smoke test. Runs without Gemini Nano and without Firebase keys.
//
//   npm run test:smoke
//
// A) Production build with no env vars: setup state, sample extract, playbook
//    rules, PDF rejection, print list, privacy page, axe pass.
// B) "e2e" build (fake engine that behaves like a phone without Nano):
//    consent gate, inferenceSource badges, edited JSON is what the check step
//    receives, no lease text or images in the check payload.
// C) Judge Mode 10-second loop on the e2e build: the sample loop must reach a
//    verdict within 10 s when the cloud check succeeds, when it is mocked to
//    fail (429), and when it is mocked to be slow (cached at 8 s, live swapped
//    in after). Cached results must never appear for a non-sample document.
//
// Uses the Playwright that is installed on the machine (require('playwright'))
// and axe-core from devDependencies.
import { spawn, execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

let failures = 0
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) failures++
}

function serve(outDir, mode, port) {
  const p = spawn('npx', ['vite', 'preview', '--outDir', outDir, '--mode', mode, '--port', String(port), '--strictPort'], {
    stdio: 'pipe',
    env: { ...process.env },
  })
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('preview did not start')), 20000)
    p.stdout.on('data', (d) => {
      if (String(d).includes(String(port))) {
        clearTimeout(t)
        resolve(p)
      }
    })
    p.stderr.on('data', (d) => process.stderr.write(d))
  })
}

async function axe(page, label) {
  await page.addScriptTag({ content: axeSource })
  const res = await page.evaluate(async () => await window.axe.run(document, { resultTypes: ['violations'] }))
  const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  for (const v of bad) console.log(`   axe ${v.impact}: ${v.id} (${v.nodes.length}) ${v.help}`)
  ok(bad.length === 0, `axe: no serious/critical violations on ${label}`)
}

// Build both variants with an empty env so no real keys are ever used here.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITE_')))
execSync('npx vite build --outDir dist-smoke', { stdio: 'inherit', env: cleanEnv })
execSync('npx vite build --mode e2e --outDir dist-e2e', { stdio: 'inherit', env: cleanEnv })

const prod = await serve('dist-smoke', 'production', 4317)
const e2e = await serve('dist-e2e', 'e2e', 4318)
const browser = await chromium.launch()

try {
  // ---------- A) no keys ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(String(e)))
    // Landing page at "/", CTA reaches the tool at /app.
    await page.goto('http://localhost:4317/')
    ok(await page.getByRole('heading', { level: 1 }).first().isVisible() && (await page.getByTestId('landing-sample').count()) === 1, 'L: landing page renders at /')
    ok((await page.getByTestId('landing-monthly').innerText()) === '$1,961.95', 'L: landing sample shows $1,961.95 from the fixture')
    const lc = await Promise.all(['RED', 'AMBER', 'GREEN'].map((k) => page.getByTestId(`landing-count-${k}`).innerText()))
    ok(lc.join('/') === '3/6/0', `L: landing sample counts 3/6/0 (${lc.join('/')})`)
    ok((await page.getByTestId('setup-state').count()) === 0, 'L: landing is not the tool')
    await axe(page, 'landing')
    await page.getByTestId('cta-check').click()
    await page.getByTestId('setup-state').waitFor()
    ok(new URL(page.url()).pathname === '/app', 'L: "Check a lease" CTA opens the tool at /app')
    await page.goto('http://localhost:4317/app')
    ok(await page.getByTestId('setup-state').isVisible(), 'A: setup state explains missing Firebase config')
    ok(await page.getByText('Not legal advice.').first().isVisible(), 'A: "Not legal advice" visible in footer')
    ok(await page.getByTestId('extract').isDisabled(), 'A: Extract disabled without keys')
    await axe(page, 'intake')

    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.includes('Technology Package'))
    ok(true, 'A: Load Sample fills the lease text')

    // Unsupported type rejection (PDFs are accepted since Item 3)
    const tmp = mkdtempSync(join(tmpdir(), 'portia-'))
    const docx = join(tmp, 'lease.docx')
    writeFileSync(docx, 'not a pdf')
    await page.getByTestId('file-input').setInputFiles(docx)
    const rej = await page.getByTestId('rejections').innerText()
    ok(rej.includes('Portia accepts pasted text, PDFs, or JPEG/PNG page images.'), 'A: .docx rejected with the standard message')

    await page.getByRole('button', { name: 'Load sample photos' }).click()
    await page.getByRole('img', { name: 'Page 2 thumbnail' }).waitFor()
    ok(true, 'A: sample JPEG/PNG photos queue with ordered thumbnails')

    await page.getByRole('button', { name: 'Explore with the sample extract' }).click()
    ok((await page.getByTestId('badge-Extract').getAttribute('data-source')) === 'FIXTURE' && (await page.getByTestId('badge-Extract').innerText()).includes('Sample data'), 'A: fixture extract is labelled as sample data, not a model result')
    ok(await page.getByTestId('cost-panel').isVisible(), 'A: full extract leads with the cost panel')
    await axe(page, 'review')
    await page.getByTestId('approve').click()
    await page.getByTestId('findings').waitFor()
    const red = Number(await page.getByTestId('count-RED').locator('span.font-mono').innerText())
    const amber = Number(await page.getByTestId('count-AMBER').locator('span.font-mono').innerText())
    ok(red >= 1 && amber >= 1, `A: playbook rules give RED (${red}) and AMBER (${amber}) on the fixture`)
    ok((await page.getByTestId('citation').first().innerText()).includes('Playbook'), 'A: findings show playbook citations')
    ok((await page.getByTestId('questions').locator('li').count()) > 0, 'A: printable question list is populated')
    ok(await page.getByText('Not legal advice.').nth(0).isVisible(), 'A: not-legal-advice on results screen')
    await axe(page, 'results')

    // dark mode renders with tokens
    await page.getByRole('button', { name: /^Theme:/ }).click() // system -> light
    await page.getByRole('button', { name: /^Theme:/ }).click() // light -> dark
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    ok(bg === 'rgb(16, 15, 11)', `A: dark theme background is #100F0B (${bg})`)
    await axe(page, 'results (dark)')

    await page.goto('http://localhost:4317/privacy')
    ok(await page.getByRole('heading', { name: 'How your data flows' }).isVisible(), 'A: /privacy route served (SPA rewrite in preview)')
    await axe(page, 'privacy')
    ok(errors.length === 0, `A: no uncaught page errors ${errors.join(' | ')}`)
    await page.close()
  }

  // ---------- B) fake engine, no Nano ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto('http://localhost:4318/app')
    await page.waitForTimeout(500)
    ok((await page.evaluate(() => window.__portiaWarmAt)) === undefined, 'B: no pre-warm outside Judge Mode')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.getByTestId('extract').click()
    await page.getByTestId('consent-banner').waitFor()
    ok((await page.getByTestId('extract').count()) === 0, 'B: no Extract button while the consent banner is open')
    const callsBefore = await page.evaluate(() => (window.__portiaCalls ?? []).length)
    ok(callsBefore === 0, 'B: consent banner shown and NO model call made before consent')
    await axe(page, 'consent banner')

    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('badge-Extract').waitFor()
    ok((await page.getByTestId('badge-Extract').getAttribute('data-source')) === 'IN_CLOUD', 'B: extract badge source is IN_CLOUD after consent')
    ok((await page.getByTestId('badge-Extract').innerText()).includes('Extracted in the cloud. Gemini Nano is not on this device'), 'B: plain-language extract badge')
    ok((await page.getByTestId('badge-Extract').getAttribute('title')).includes('in_cloud'), 'B: raw inferenceSource in the badge tooltip')

    // edit a field (fields are collapsed behind a toggle when the extract is full)
    await page.getByTestId('toggle-fields').click()
    await page.locator('#f-rentAmount').fill('1900')
    await page.getByTestId('approve').click()
    await page.getByTestId('badge-Check').waitFor()
    ok((await page.getByTestId('badge-Check').getAttribute('data-source')) === 'IN_CLOUD' && (await page.getByTestId('badge-Check').innerText()).includes('Checked in the cloud'), 'B: check badge says "Checked in the cloud"')

    const calls = await page.evaluate(() => window.__portiaCalls)
    const check = calls.find((c) => c.kind === 'check')
    ok(check && check.imageCount === 0, 'B: check request has no image parts')
    ok(check && check.prompt.includes('"rentAmount":1900'), 'B: check request carries the user-edited JSON')
    ok(check && !check.prompt.includes('RESIDENTIAL LEASE AGREEMENT') && !check.prompt.includes('Maple Court'), 'B: check request contains no raw lease text')
    ok(await page.getByText('cited no playbook rule').isVisible(), 'B: uncited RED from the model is shown as AMBER')

    // photos path: new document => consent again
    await page.getByRole('button', { name: 'Start over' }).click()
    await page.getByRole('button', { name: 'Load sample photos' }).click()
    await page.getByRole('img', { name: 'Page 2 thumbnail' }).waitFor()
    await page.getByTestId('extract').click()
    await page.getByTestId('consent-banner').waitFor()
    ok(true, 'B: consent required again for a new document')
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('badge-Extract').waitFor()
    const calls2 = await page.evaluate(() => window.__portiaCalls)
    const ex = calls2.filter((c) => c.kind === 'extract').at(-1)
    ok(ex.imageCount === 2, 'B: two page photos sent in one single-turn extract')

    // phone width renders
    await page.setViewportSize({ width: 412, height: 915 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    ok(!overflow, 'B: no horizontal scroll at Pixel 7 width')
    await page.close()
  }

  // ---------- C) Judge Mode, one click, 10-second loop ----------
  const counts = async (page) =>
    Promise.all(['RED', 'AMBER', 'GREEN'].map(async (k) => Number(await page.getByTestId(`count-${k}`).locator('span.font-mono').innerText())))

  async function oneClick(query) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const tLoad = Date.now()
    await page.goto(`http://localhost:4318/?judge=1&${query}`)
    if (query === 'fakeCheck=ok') ok((await page.getByTestId('run-sample').waitFor({ timeout: 5000 }).then(() => true, () => false)) && (await page.getByTestId('judge-banner').isVisible()) && (await page.getByTestId('run-sample').isVisible()) && (await page.getByTestId('landing-sample').count()) === 0, 'L: /?judge=1 lands straight in the tool in Judge Mode')
    await page.waitForFunction(() => typeof window.__portiaWarmAt === 'number', null, { timeout: 3000 })
    const prewarmedBeforeTap = await page.evaluate(() => (window.__portiaCalls ?? []).length === 0)
    const btn = page.getByTestId('run-sample')
    const label = await btn.innerText()
    const t0 = Date.now()
    await btn.click()
    await page.getByTestId('verdict-time').waitFor({ timeout: 10000 })
    const ms = Date.now() - t0
    const total = Date.now() - tLoad
    return { page, ms, total, label, prewarmedBeforeTap }
  }

  {
    const { page, ms, total, label, prewarmedBeforeTap } = await oneClick('fakeCheck=ok')
    ok(prewarmedBeforeTap, 'C(ok): models pre-warmed on landing before any tap, without a model call')
    ok(label === 'Send the sample to cloud Gemini and check', `C(ok): no-Nano one-click button is the consent ("${label}")`)
    ok(ms <= 10000 && total <= 10000, `C(ok): one click to full verdict in ${ms} ms (${total} ms including page load)`)
    ok((await page.getByTestId('badge-Check').getAttribute('data-source')) === 'IN_CLOUD', 'C(ok): live cloud check')
    ok((await page.getByTestId('verdict-time').innerText()).includes('one click'), 'C(ok): one-click verdict time shown')
    ok((await page.getByTestId('results-true-monthly').innerText()).includes('$1,961.95'), 'C(ok): full evidence: true monthly cost $1,961.95')
    ok(JSON.stringify(await counts(page)) === '[3,6,0]', `C(ok): canonical counts 3/6/0 (${await counts(page)})`)
    ok((await page.getByTestId('consent-banner').count()) === 0 && (await page.getByTestId('cached-banner').count()) === 0, 'C(ok): no consent banner and no cached label')
    await page.close()
  }

  {
    const { page, ms } = await oneClick('fakeCheck=fail')
    const banner = await page.getByTestId('cached-banner').innerText()
    ok(ms <= 10000 && banner.includes('Cached sample result (live check unavailable)'), `C(fail): labelled cached result within 10 s (${ms} ms)`)
    ok((await page.getByTestId('badge-Check').getAttribute('data-source')) === 'CACHED', 'C(fail): check badge is the cached sample')
    ok((await page.getByTestId('verdict-time').innerText()).includes('cached sample'), 'C(fail): elapsed time names the cached source')
    ok(JSON.stringify(await counts(page)) === '[3,6,0]', 'C(fail): same canonical counts 3/6/0')
    ok((await page.getByText('Cloud review:').count()) >= 1, 'C(fail): recorded cloud review shown as commentary on rule cards (counts unchanged)')
    ok((await page.getByText('2700').count()) === 0, 'C(fail): recorded commentary about the misread notice period is not shown')
    ok(banner.includes('Retrying the live check in the background'), 'C(fail): live check keeps retrying in the background')
    await page.close()
  }

  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/?judge=1&fakeCheck=slow')
    await page.getByTestId('run-sample').click()
    await page.getByTestId('preliminary').waitFor({ timeout: 3000 })
    const pre = await page.getByTestId('preliminary').innerText()
    ok(pre.includes('Preliminary: playbook rules in your browser') && (await page.getByTestId('verdict-time').count()) === 0, 'C(slow): preliminary label and timer, no verdict line mid-check')
    await page.getByTestId('cached-banner').waitFor({ timeout: 10000 })
    await page.getByTestId('live-swapped').waitFor({ timeout: 8000 })
    ok((await page.getByTestId('badge-Check').getAttribute('data-source')) === 'IN_CLOUD' && (await page.getByTestId('cached-banner').count()) === 0, 'C(slow): cached at 8 s, then live result swapped in')
    await page.close()
  }

  {
    const seen = []
    for (let i = 0; i < 5; i++) {
      const { page, ms } = await oneClick('fakeCheck=ok&fakeExtract=wild')
      seen.push(`${(await counts(page)).join('/')}@${ms}`)
      await page.close()
    }
    const uniq = new Set(seen.map((x) => x.split('@')[0]))
    ok(uniq.size === 1 && seen[0].startsWith('3/6/0'), `C(stable): 5 one-click runs with drifting live extracts give identical counts (${seen.join(', ')})`)
  }

  {
    const { page } = await oneClick('fakeCheck=ok&fakeExtract=thinonce')
    const calls = await page.evaluate(() => window.__portiaCalls.filter((c) => c.kind === 'extract').length)
    ok(calls === 2, 'C(thin once): thin sample extract retried once, then the verdict')
    await page.close()
  }

  {
    const { page } = await oneClick('fakeCheck=ok&fakeExtract=thin')
    ok((await page.getByText('Fallback: the live extract was incomplete').count()) === 1 && JSON.stringify(await counts(page)) === '[3,6,0]', 'C(thin): still thin after retry, labelled bundled fallback, never a 0-finding map')
    await page.close()
  }

  {
    // Manual path, NOT the sample (text edited), thin extract: Approve blocked until hand edits.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/app?fakeExtract=thin')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('thin-warning').waitFor()
    ok(await page.getByTestId('approve').isDisabled(), 'C(thin manual): Approve disabled on a thin extract')
    ok((await page.getByTestId('thin-warning').innerText()).includes('This extract is missing too many fields to check. Fill them in, or go back and extract again.'), 'C(thin manual): thin-extract copy shown')
    await page.locator('#f-depositAmount').fill('4625')
    ok(!(await page.getByTestId('approve').isDisabled()), 'C(thin manual): override allowed after editing fields by hand')
    await page.close()
  }

  {
    // Judge Mode, non-sample document, cloud failing: real error, never a cached result.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/?judge=1&fakeCheck=fail')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.locator('#lease-text').press('End')
    await page.keyboard.type(' Extra clause.')
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    ok((await page.getByTestId('pin-note').count()) === 0, 'C(non-sample): user document is never pinned to fixture values')
    await page.getByTestId('approve').click()
    await page.getByText('The cloud review failed.').waitFor({ timeout: 10000 })
    ok((await page.getByTestId('cached-banner').count()) === 0, 'C(non-sample): no cached result for a modified document, real error shown')
    await page.close()
  }

  {
    // 412px fold on results: stepper, counts and true monthly cost visible without scrolling.
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } })
    await page.goto('http://localhost:4318/?judge=1&fakeCheck=ok')
    await page.getByTestId('run-sample').click()
    await page.getByTestId('verdict-time').waitFor({ timeout: 10000 })
    await page.evaluate(() => window.scrollTo(0, 0))
    const inFold = await page.evaluate(() =>
      ['count-RED', 'results-true-monthly'].every((id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().bottom <= window.innerHeight),
    )
    ok(inFold, 'C(412px): counts and true monthly cost above the fold')
    await page.close()
  }

  {
    // 1280x800 fold on review: cost math and Approve visible without scrolling.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/app')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('cost-panel').waitFor()
    await page.evaluate(() => window.scrollTo(0, 0))
    const inFold = await page.evaluate(() =>
      ['cost-panel', 'approve', 'due-at-signing'].every((id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().bottom <= window.innerHeight),
    )
    ok(inFold, 'C(1280x800): review fold shows the cost panel and Approve')
    ok((await page.getByTestId('due-at-signing').innerText()) === '$6,586.95', 'C(1280x800): due at signing $6,586.95')
    await page.close()
  }

  // ---------- D) Item 1: offline rules-only verdict ----------
  {
    // Cloud check fails with a network TypeError (fake engine), not Judge Mode.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/app?fakeCheck=offline')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('approve').click()
    await page.getByTestId('offline-panel').waitFor({ timeout: 10000 })
    ok(JSON.stringify(await counts(page)) === '[3,6,0]', 'D(fakeCheck=offline): rules counts 3/6/0')
    ok((await page.getByTestId('results-true-monthly').innerText()).includes('$1,961.95'), 'D(fakeCheck=offline): true monthly cost $1,961.95')
    const badge = page.getByTestId('badge-Check')
    ok((await badge.innerText()) === 'Offline: checked on this device' && (await badge.getAttribute('data-source')) === 'RULES_ONLY', 'D(fakeCheck=offline): badge "Offline: checked on this device"')
    ok(!(await badge.innerText()).includes('ON_DEVICE') && (await page.locator('[data-testid="badge-Check"][data-source="ON_DEVICE"]').count()) === 0, 'D(fakeCheck=offline): check never labelled ON_DEVICE')
    ok((await page.getByText('The cloud review failed.').count()) === 0, 'D(fakeCheck=offline): no red error')
    ok((await page.getByTestId('run-cloud-now').count()) === 1, 'D(fakeCheck=offline): "Run cloud review now" exists')
    await page.close()
  }

  {
    // Real offline (no keys build): explore sample + approve gives a full rules-only verdict.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await page.goto('http://localhost:4317/app')
    await page.getByTestId('setup-state').waitFor()
    await ctx.setOffline(true)
    await page.getByRole('button', { name: 'Explore with the sample extract' }).click()
    await page.getByTestId('approve').click()
    await page.getByTestId('offline-panel').waitFor({ timeout: 5000 })
    ok(JSON.stringify(await counts(page)) === '[3,6,0]' && (await page.getByTestId('results-true-monthly').innerText()).includes('$1,961.95'), 'D(setOffline): explore sample gives 3/6/0 and $1,961.95 offline')
    ok((await page.getByTestId('badge-Check').innerText()) === 'Offline: checked on this device', 'D(setOffline): offline badge shown')
    ok(await page.getByTestId('run-cloud-now').isDisabled(), 'D(setOffline): "Run cloud review now" disabled while offline')
    await ctx.close()
  }

  {
    // Offline with no Nano (e2e fake reports unsupported): no consent banner, clear message.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
    const page = await ctx.newPage()
    await page.goto('http://localhost:4318/app')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await ctx.setOffline(true)
    await page.getByTestId('extract').click()
    await page.getByTestId('extract-error').waitFor()
    ok((await page.getByTestId('consent-banner').count()) === 0 && (await page.getByTestId('extract-error').innerText()).includes('You are offline and this browser has no on-device model'), 'D(offline extract, no Nano): no consent banner, offline message')
    await ctx.close()
  }

  // ---------- E) Item 2: privacy receipt ----------
  const onDeviceRowsHonest = (page) =>
    page.evaluate(() => [...document.querySelectorAll('[data-testid^="receipt-row-"]')].every((r) => r.dataset.ran !== 'ON_DEVICE' || r.dataset.sdk === 'on_device'))
  {
    // Sample one click with Gemini Nano ready (fake engine reports inferenceSource "on_device").
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/?judge=1&fakeCheck=ok&fakeDevice=available')
    const nanoLabel = await page
      .waitForFunction(() => document.querySelector('[data-testid="run-sample"]')?.textContent === 'Run the sample lease', null, { timeout: 5000 })
      .then(() => true, () => false)
    ok(nanoLabel, 'E: with Nano ready the one-click label is "Run the sample lease"')
    await page.getByTestId('run-sample').click()
    await page.getByTestId('verdict-time').waitFor({ timeout: 10000 })
    const rows = await page.locator('[data-testid^="receipt-row-"]').count()
    ok(rows === 3, `E: receipt has three rows (${rows})`)
    ok((await page.getByTestId('receipt-row-extract').getAttribute('data-ran')) === 'ON_DEVICE' && (await page.getByTestId('receipt-row-extract').getAttribute('data-kind')) === 'nothing', 'E: on-device extract sent nothing')
    ok((await page.getByTestId('receipt-row-check').getAttribute('data-kind')) === 'approved-json', 'E: check row is approved-json')
    const head = await page.getByTestId('receipt-headline').innerText()
    ok(head.includes('The lease never left this device') && !head.includes('Lease text sent'), `E: headline is truthful for the sample ("${head.slice(0, 80)}...")`)
    ok(await onDeviceRowsHonest(page), 'E: no row says ON_DEVICE without sdkInferenceSource "on_device"')
    ok((await page.getByText('View the exact text sent to the check model').count()) === 1, 'E: exact check text shown once, inside the receipt')
    ok(JSON.stringify(await counts(page)) === '[3,6,0]', 'E: Nano path keeps 3/6/0')
    await page.close()
  }
  {
    // Consent cloud path: the headline must not claim 0.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/app?fakeCheck=ok')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('approve').click()
    await page.getByTestId('badge-Check').waitFor({ timeout: 10000 })
    const h = page.getByTestId('receipt-headline')
    ok((await h.getAttribute('data-zero')) === 'false' && (await h.innerText()).startsWith('Lease text sent to cloud Gemini with your consent:'), `E: consent path headline states what was sent ("${await h.innerText()}")`)
    ok((await page.getByTestId('receipt-row-extract').getAttribute('data-kind')) === 'lease-text-and-images', 'E: consent extract row is lease-text-and-images')
    ok(await onDeviceRowsHonest(page), 'E: consent path has no ON_DEVICE rows')
    await page.close()
  }

  // ---------- F) Item 3: PDF intake, in the browser, no network to AI hosts ----------
  {
    const tmpPdf = mkdtempSync(join(tmpdir(), 'portia-pdf-'))
    const maker = await browser.newPage()
    const leaseTxt = readFileSync(new URL('../public/fixture-lease.txt', import.meta.url), 'utf8')
    const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    await maker.setContent(`<pre style="font:13px/1.4 Georgia;white-space:pre-wrap">SYNTHETIC\n${esc(leaseTxt)}</pre>`)
    const textPdf = join(tmpPdf, 'lease-text.pdf')
    await maker.pdf({ path: textPdf, format: 'Letter' })
    const png = readFileSync(new URL('../public/fixtures/lease-page-2.png', import.meta.url)).toString('base64')
    await maker.setContent(`<img style="width:100%" src="data:image/png;base64,${png}">`)
    const scanPdf = join(tmpPdf, 'lease-scan.pdf')
    await maker.pdf({ path: scanPdf, format: 'Letter' })
    await maker.close()

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    const aiRequests = []
    const workerOnLanding = []
    page.on('request', (r) => {
      if (/firebasevertexai|generativelanguage/.test(r.url())) aiRequests.push(r.url())
      if (/pdf\.worker|\/pdf-[\w-]+\.js/.test(r.url())) workerOnLanding.push(r.url())
    })
    await page.goto('http://localhost:4318/')
    await page.waitForLoadState('networkidle')
    ok(workerOnLanding.length === 0, 'F: landing page does not fetch pdfjs or pdf.worker')
    await page.goto('http://localhost:4318/app')
    await page.getByTestId('file-input').setInputFiles(textPdf)
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.includes('Technology Package'), null, { timeout: 15000 })
    const val = await page.locator('#lease-text').inputValue()
    ok(val.startsWith('--- page 1 ---') && val.includes('Valet Trash Service'), 'F: text PDF fills the textarea with page markers')
    ok((await page.getByTestId('pdf-status').innerText()).includes('Text read from your PDF in this browser. Nothing was uploaded.'), 'F: text PDF status line')
    await page.getByTestId('file-input').setInputFiles(scanPdf)
    await page.getByRole('img', { name: 'Page 1 thumbnail' }).waitFor({ timeout: 15000 })
    const thumbs = await page.locator('img[alt$="thumbnail"]').count()
    ok(thumbs >= 1 && (await page.getByTestId('pdf-status').innerText()).startsWith('Scanned PDF: pages were turned into images in this browser.'), `F: scanned PDF becomes PNG page thumbnails (${thumbs})`)
    ok(aiRequests.length === 0, 'F: no request to firebasevertexai or generativelanguage while parsing PDFs')
    await page.close()
  }

  // ---------- G) Item 4: thin-extract guard and preliminary state ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/app?fakeExtract=thin')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('thin-warning').waitFor()
    const approve = page.getByTestId('approve')
    const desc = await approve.getAttribute('aria-describedby')
    const descText = desc ? await page.locator(`#${desc}`).innerText() : ''
    ok((await approve.isDisabled()) && descText.includes('missing too many fields'), 'G: disabled Approve exposes its reason via aria-describedby')
    await page.locator('#f-depositAmount').fill('4625')
    const desc2 = await approve.getAttribute('aria-describedby')
    ok(!(await approve.isDisabled()) && (desc2 === null || (await page.locator(`#${desc2}`).count()) === 1), 'G: after a hand edit Approve is enabled and never points at a missing id')
    await page.close()
  }
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/?judge=1&fakeCheck=slow')
    await page.getByTestId('run-sample').click()
    await page.getByTestId('preliminary').waitFor({ timeout: 5000 })
    const tiles = page.getByTestId('tiles')
    ok((await tiles.getAttribute('aria-busy')) === 'true' && (await page.getByTestId('preliminary').innerText()).includes('Preliminary'), 'G: tiles are aria-busy with a visible "Preliminary" label while checking')
    await page.getByTestId('cached-banner').waitFor({ timeout: 10000 })
    ok((await tiles.getAttribute('aria-busy')) === 'false', 'G: tiles stop being busy once the result is final')
    await page.close()
  }
  {
    const seen = []
    for (let i = 0; i < 3; i++) {
      const { page } = await oneClick('fakeCheck=ok')
      seen.push((await counts(page)).join('/'))
      await page.close()
    }
    ok(seen.every((c) => c === '3/6/0'), `G: 3 consecutive one-click runs give 3/6/0 (${seen.join(', ')})`)
  }

  // ---------- H) Item 5: no unconditional on-device claims without Nano ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const bad = []
    for (const url of ['http://localhost:4318/', 'http://localhost:4318/app', 'http://localhost:4318/?judge=1']) {
      await page.goto(url)
      await page.waitForTimeout(400)
      const text = await page.evaluate(() => document.body.innerText + ' ' + (document.querySelector('meta[name="description"]')?.content ?? ''))
      for (const s of text.split(/(?<=[.!?])\s+/)) {
        if (/on your device|on this device|never leaves|never left|stays? (in|on) (this|your) (browser|device)/i.test(s) && !/\b(when|if|once|while|until|first|can)\b|not available|cannot|without|\bremember\b|\bsaved?\b|\bstored?\b/i.test(s)) bad.push(`${url}: ${s.trim()}`)
      }
    }
    ok(bad.length === 0, `H: no unconditional on-device claim with Nano unsupported${bad.length ? ': ' + bad.join(' | ') : ''}`)
    await page.close()
  }

  // ---------- I) Item 6: copy all and email ----------
  {
    const { page } = await oneClick('fakeCheck=ok')
    const href = await page.getByTestId('email-questions').getAttribute('href')
    ok(href.startsWith('mailto:?subject='), 'I: "Email these questions" is a mailto:?subject= link with no recipient')
    ok(decodeURIComponent(href).includes('$1,961.95'), 'I: email body carries the true monthly cost')
    ok((await page.getByTestId('copy-all').count()) === 1 && (await page.getByText('Print or save as PDF').count()) === 1, 'I: Copy all sits next to Print')
    await page.close()
  }

  // ---------- J) Item 7: eval page ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4317/eval')
    ok((await page.getByTestId('eval-empty').innerText()) === 'No eval run recorded yet.' && (await page.getByTestId('eval-summary').count()) === 0, 'J: /eval shows the empty state and no numbers')
    await axe(page, 'eval')
    await page.goto('http://localhost:4318/eval?run=1&limit=1')
    await page.getByTestId('eval-runner').waitFor()
    ok(await page.getByTestId('eval-start').isDisabled(), 'J: runner Start is disabled until the synthetic-data consent is ticked (no Nano)')
    await page.getByTestId('eval-consent').check()
    await page.getByTestId('eval-start').click()
    await page.getByTestId('eval-download').waitFor({ timeout: 10000 })
    const row = await page.getByTestId('eval-rows').innerText()
    ok(/^dev-01 IN_CLOUD \d+ ms, rules \d+\/\d+\/\d+/.test(row), `J: runner records ranOn from the engine and the rule counts ("${row}")`)
    await page.close()
  }

  // ---------- K) Item 8: Remote Config defaults ----------
  {
    const { page } = await oneClick('fakeCheck=ok')
    ok(JSON.stringify(await counts(page)) === '[3,6,0]' && (await page.getByTestId('results-true-monthly').innerText()).includes('$1,961.95'), 'K: one click gives 3/6/0 and $1,961.95 with Remote Config unreachable')
    const cfgText = await page.getByTestId('receipt-config').innerText()
    ok(cfgText.includes('gemini-3.5-flash-lite') && cfgText.includes('8000 ms') && cfgText.includes('source default'), `K: receipt footer shows the active config ("${cfgText}")`)
    ok((await page.getByTestId('playbook-notice').count()) === 0, 'K: no playbook notice with the default config')
    await page.close()
  }

  // ---------- L) Item 9a/9b: OG tags, manifest, service worker files ----------
  {
    const page = await browser.newPage()
    const html = await (await page.request.get('http://localhost:4317/')).text()
    ok(['og:title', 'og:description', 'og:image', 'og:url', 'twitter:card', 'twitter:image'].every((t) => html.includes(t)) && html.includes('https://askportia.vercel.app/og.png') && html.includes('summary_large_image'), 'L: OG and Twitter meta tags in the built index.html')
    const man = await page.request.get('http://localhost:4317/manifest.webmanifest')
    let manifest = null
    try { manifest = JSON.parse(await man.text()) } catch {}
    ok(man.ok() && manifest?.start_url === '/app' && manifest?.display === 'standalone' && manifest?.icons?.length >= 2, 'L: /manifest.webmanifest returns the JSON manifest')
    const sw = await page.request.get('http://localhost:4317/sw.js')
    ok(sw.ok() && (await sw.text()).includes('portia-shell'), 'L: /sw.js is served as a file, not the SPA')
    const og = await page.request.get('http://localhost:4317/og.png')
    ok(og.ok() && og.headers()['content-type'].includes('image/png'), 'L: /og.png is served')
    await page.close()
  }

  // ---------- M) Item 9c: accessibility pass ----------
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/app?fakeCheck=ok')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('approve').click()
    await page.getByTestId('badge-Check').waitFor({ timeout: 10000 })
    ok((await page.evaluate(() => document.activeElement?.id)) === 'results-title', 'M: focus lands on the results h2 after approve')
    const said = await page.getByTestId('results-announcer').innerText()
    ok(said === 'Results ready: 3 red, 6 amber, 0 green. Cloud review added.', `M: live region announces the final counts once ("${said}")`)
    await page.goto('http://localhost:4318/app')
    ok((await page.getByTestId('file-input').getAttribute('aria-label')) === 'Choose a PDF or page images', 'M: the PDF / image file input is labelled')
    await page.close()
  }

  // ---------- N) Addendum 5: Judge Mode error fallback (App Check 401) ----------
  for (const [label, query] of [
    ['extract rejected', 'fakeExtract=appcheck&fakeCheck=ok'],
    ['extract and check rejected', 'fakeExtract=appcheck&fakeCheck=appcheck'],
    ['check rejected', 'fakeExtract=ok&fakeCheck=appcheck'],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(`http://localhost:4318/?judge=1&${query}`)
    const t0 = Date.now()
    await page.getByTestId('run-sample').click()
    await page.getByTestId('cached-banner').waitFor({ timeout: 4000 })
    const ms = Date.now() - t0
    const banner = await page.getByTestId('cached-banner').innerText()
    ok(ms <= 2000, `N(${label}): recorded result within 2 s of the click (${ms} ms)`)
    ok(JSON.stringify(await counts(page)) === '[3,6,0]' && (await page.getByTestId('results-true-monthly').innerText()).includes('$1,961.95'), `N(${label}): recorded 3/6/0 and $1,961.95`)
    ok(banner.includes('Cached sample result (live check unavailable)') && banner.includes('Live check could not reach Gemini from this browser, so this is the recorded result for the sample lease. Try again or paste your own lease.'), `N(${label}): recorded label and calm note`)
    const cb = await page.getByTestId('badge-Check').getAttribute('data-source')
    ok(cb === 'CACHED', `N(${label}): check badge is the recorded result, never ON_DEVICE or IN_CLOUD (${cb})`)
    const eb = await page.getByTestId('badge-Extract').getAttribute('data-source')
    ok(label === 'check rejected' ? eb === 'IN_CLOUD' : eb === 'CACHED', `N(${label}): extract badge is truthful (${eb})`)
    const body = await page.evaluate(() => document.body.innerText)
    ok(!/debug token/i.test(body) && !/Firebase App Check token is invalid/i.test(body), `N(${label}): no debug-token text or raw SDK error on the page`)
    if (label !== 'check rejected') {
      const head = await page.getByTestId('receipt-headline').innerText()
      ok(head.startsWith('No lease text of yours was sent in this run.') && (await page.getByTestId('receipt-row-extract').getAttribute('data-kind')) === 'nothing', `N(${label}): receipt says no lease text was sent ("${head.slice(0, 60)}...")`)
      ok((await page.locator('[data-testid^="receipt-row-"][data-ran="ON_DEVICE"], [data-testid^="receipt-row-"][data-ran="IN_CLOUD"][data-testid="receipt-row-extract"]').count()) === 0, `N(${label}): receipt never shows the extract as ON_DEVICE or IN_CLOUD`)
    }
    await axe(page, `judge fallback (${label})`)
    const before = await page.evaluate(() => window.__portiaCalls.filter((c) => c.kind === 'extract').length + window.__portiaCalls.filter((c) => c.kind === 'check').length)
    await page.getByTestId('retry-live').click()
    await page.waitForFunction((n) => window.__portiaCalls.filter((c) => c.kind === 'extract').length + window.__portiaCalls.filter((c) => c.kind === 'check').length > n, before, { timeout: 5000 })
    ok(true, `N(${label}): Retry calls the live path again`)
    await page.close()
  }
  {
    // Judge Mode, your own lease: never substituted, plain error with Retry, no debug token text.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/?judge=1&fakeExtract=appcheck')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.locator('#lease-text').press('End')
    await page.keyboard.type(' Extra clause.')
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('extract-error').waitFor({ timeout: 4000 })
    const t = await page.getByTestId('extract-error').innerText()
    ok(!/debug token/i.test(t) && t.includes('Retry') && (await page.getByTestId('cached-banner').count()) === 0 && (await page.getByTestId('pin-note').count()) === 0, 'N(own lease): plain error with Retry, no recorded fallback, no debug token text')
    await page.close()
  }
  {
    // Non-judge flow: plain-language error with Retry.
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto('http://localhost:4318/app?fakeExtract=appcheck')
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    await page.getByTestId('extract').click()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('extract-error').waitFor({ timeout: 4000 })
    const t = await page.getByTestId('extract-error').innerText()
    ok(t.includes('could not reach the cloud model') && !/debug token/i.test(t) && (await page.getByTestId('cached-banner').count()) === 0, 'N(non-judge): plain-language error with Retry, nothing recorded shown')
    await page.close()
  }

} finally {
  await browser.close()
  prod.kill()
  e2e.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed')
process.exit(failures ? 1 : 0)

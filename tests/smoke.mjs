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
    await page.goto('http://localhost:4317/')
    ok(await page.getByTestId('setup-state').isVisible(), 'A: setup state explains missing Firebase config')
    ok(await page.getByText('Not legal advice.').first().isVisible(), 'A: "Not legal advice" visible in footer')
    ok(await page.getByTestId('extract').isDisabled(), 'A: Extract disabled without keys')
    await axe(page, 'intake')

    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.includes('Technology Package'))
    ok(true, 'A: Load Sample fills the lease text')

    // PDF rejection
    const tmp = mkdtempSync(join(tmpdir(), 'portia-'))
    const pdf = join(tmp, 'lease.pdf')
    writeFileSync(pdf, '%PDF-1.4 fake')
    await page.getByTestId('file-input').setInputFiles(pdf)
    const rej = await page.getByTestId('rejections').innerText()
    ok(rej.includes('Portia accepts pasted text or JPEG/PNG page images. Export or photograph each page.'), 'A: PDF rejected with the standard message')

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
    await page.goto('http://localhost:4318/')
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
    await page.goto('http://localhost:4318/?fakeExtract=thin')
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
    await page.goto('http://localhost:4318/')
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

} finally {
  await browser.close()
  prod.kill()
  e2e.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed')
process.exit(failures ? 1 : 0)

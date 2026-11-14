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
    ok(await page.getByTestId('badge-Extract').innerText().then((t) => t.includes('SAMPLE DATA')), 'A: fixture extract is labelled SAMPLE DATA, not a model result')
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
    const callsBefore = await page.evaluate(() => (window.__portiaCalls ?? []).length)
    ok(callsBefore === 0, 'B: consent banner shown and NO model call made before consent')
    await axe(page, 'consent banner')

    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('badge-Extract').waitFor()
    ok((await page.getByTestId('badge-Extract').innerText()).includes('IN_CLOUD'), 'B: extract badge shows IN_CLOUD after consent')

    // edit a field
    await page.locator('#f-rentAmount').fill('1900')
    await page.getByTestId('approve').click()
    await page.getByTestId('badge-Check').waitFor()
    ok((await page.getByTestId('badge-Check').innerText()).includes('IN_CLOUD'), 'B: check badge shows IN_CLOUD')

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

  // ---------- C) Judge Mode, 10-second loop ----------
  async function judgeLoop(fakeCheck, { editText = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.goto(`http://localhost:4318/?judge=1&fakeCheck=${fakeCheck}`)
    await page.waitForFunction(() => typeof window.__portiaWarmAt === 'number', null, { timeout: 3000 })
    const calledBeforeTap = await page.evaluate(() => (window.__portiaCalls ?? []).length === 0)
    await page.getByRole('button', { name: 'Load sample lease' }).click()
    await page.waitForFunction(() => document.querySelector('#lease-text')?.value.length > 100)
    if (editText) await page.locator('#lease-text').press('End').then(() => page.keyboard.type(' Extra clause.'))
    await page.getByTestId('extract').click()
    await page.getByTestId('consent-banner').waitFor()
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Send to cloud Gemini' }).click()
    await page.getByTestId('approve').click()
    return { page, t0, calledBeforeTap }
  }

  {
    const { page, t0, calledBeforeTap } = await judgeLoop('ok')
    ok(calledBeforeTap, 'C(ok): models pre-warmed on landing before any tap, without a model call')
    await page.getByTestId('badge-Check').waitFor({ timeout: 10000 })
    const ms = Date.now() - t0
    ok(ms <= 10000 && (await page.getByTestId('badge-Check').innerText()).includes('IN_CLOUD'), `C(ok): live verdict within 10 s (${ms} ms)`)
    const t = await page.getByTestId('verdict-time').innerText()
    ok(/^Verdict in \d+\.\ds, cloud \+ cloud/.test(t), `C(ok): elapsed time shown ("${t}")`)
    ok((await page.getByTestId('cached-banner').count()) === 0, 'C(ok): no cached label when live succeeds')
    await page.close()
  }

  {
    const { page, t0 } = await judgeLoop('fail')
    await page.getByTestId('cached-banner').waitFor({ timeout: 10000 })
    const ms = Date.now() - t0
    const banner = await page.getByTestId('cached-banner').innerText()
    ok(ms <= 10000 && banner.includes('Cached sample result (live check unavailable)'), `C(fail): cached sample result labelled within 10 s (${ms} ms)`)
    ok((await page.getByTestId('badge-Check').innerText()).includes('CACHED SAMPLE'), 'C(fail): check badge says CACHED SAMPLE')
    ok((await page.getByTestId('verdict-time').innerText()).includes('cached sample'), 'C(fail): elapsed time names the cached source')
    const red = Number(await page.getByTestId('count-RED').locator('span.font-mono').innerText())
    ok(red >= 1, `C(fail): cached verdict still shows red flags (${red})`)
    ok(banner.includes('Retrying the live check in the background'), 'C(fail): live check keeps retrying in the background')
    await page.close()
  }

  {
    const { page, t0 } = await judgeLoop('slow')
    await page.getByTestId('cached-banner').waitFor({ timeout: 10000 })
    const ms = Date.now() - t0
    ok(ms >= 7500 && ms <= 10000, `C(slow): cached result shown at the 8 s cutoff (${ms} ms)`)
    await page.getByTestId('live-swapped').waitFor({ timeout: 8000 })
    ok((await page.getByTestId('badge-Check').innerText()).includes('IN_CLOUD') && (await page.getByTestId('cached-banner').count()) === 0, 'C(slow): live result swapped in when it arrived')
    await page.close()
  }

  {
    const { page } = await judgeLoop('fail', { editText: true })
    await page.getByText('The cloud review failed.').waitFor({ timeout: 10000 })
    ok((await page.getByTestId('cached-banner').count()) === 0, 'C(non-sample): no cached result for a modified document, real error shown')
    await page.close()
  }
} finally {
  await browser.close()
  prod.kill()
  e2e.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll smoke checks passed')
process.exit(failures ? 1 : 0)

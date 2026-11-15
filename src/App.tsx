import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConsentBanner } from './components/ConsentBanner'
import { DeviceStatus, heroLine } from './components/DeviceStatus'
import { ExtractEditor } from './components/ExtractEditor'
import { Intake, toPage } from './components/Intake'
import { Privacy } from './components/Privacy'
import { Results } from './components/Results'
import { Footer, Header, routeFromPath, type Route } from './components/Shell'
import { Hero } from './components/Hero'
import { Landing } from './components/Landing'
import type { AiEngine } from './lib/engine'
import { missingEnv } from './lib/firebase'
import { loadEngine } from './lib/getEngine'
import { fileToGenerativePart } from './lib/intake'
import { checkDeviceAvailability, type DeviceAvailability } from './lib/onDevice'
import { getPlaybook, type Playbook } from './lib/playbooks'
import { buildCheckPrompt, MAX_IMAGES_PER_EXTRACT } from './lib/prompts'
import {
  cleanExtract,
  ConsentRequiredError,
  mergeExtracts,
  mergeFindings,
  ParseError,
  runCheck,
  runExtract,
  type CheckOutput,
} from './lib/pipeline'
import {
  CACHED_LABEL,
  cachedSampleVerdict,
  isJudgeMode,
  isRecordMode,
  JUDGE_RETRY_DELAYS_MS,
  JUDGE_TIMEOUT_MS,
  isThinExtract,
  matchSample,
  SAMPLE_EXTRACT,
  sleep,
  verdictFixture,
} from './lib/judge'
import { CLOUD_MODEL } from './lib/firebase'
import { runPlaybook } from './lib/rules'
import {
  forgetApproved,
  loadApproved,
  rememberEnabled,
  saveApproved,
  setRememberEnabled,
  type Remembered,
} from './lib/storage'
import type { DisplayFinding, LeaseExtract, PageImage, SourceLabel } from './lib/types'
import type { CachedInfo, LiveRetry } from './components/Results'
import sampleExtract from './fixtures/sample-extract.json'

type Step = 'intake' | 'review' | 'results'

interface PinInfo {
  kind: 'pinned' | 'fallback'
  matched: number
  total: number
  differs: string[]
  retried: boolean
}

interface ExtractOverride {
  text: string
  pages: PageImage[]
  batchIds: string[]
  sample: boolean
}

interface CheckCtx {
  sample: boolean
  original: string | null
  playbook: Playbook
  unsure: string[]
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/app.?check|attestation|recaptcha/i.test(msg)) {
    return `Firebase App Check rejected the request. If this is a local or preview build, register the debug token from the browser console in the Firebase console. (${msg})`
  }
  if (/429|quota|resource.?exhausted|rate/i.test(msg)) return `The model is rate limited right now. Wait a moment and retry. (${msg})`
  if (/503|unavailable|overloaded/i.test(msg)) return `The model is temporarily unavailable. Retry in a few seconds. (${msg})`
  if (/fetch|network|failed to load/i.test(msg)) return `Network error. Check your connection and retry. (${msg})`
  if (/input.?quota|too large|exceed/i.test(msg)) return `The input is too large for the on-device model. Extract in smaller batches. (${msg})`
  return msg
}

const STEPS: { id: Step; label: string }[] = [
  { id: 'intake', label: 'Document' },
  { id: 'review', label: 'Review extract' },
  { id: 'results', label: 'Clause map' },
]

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromPath())
  useEffect(() => {
    const on = () => setRoute(routeFromPath())
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])

  const [engine, setEngine] = useState<AiEngine | null | undefined>(undefined)
  const [avail, setAvail] = useState<DeviceAvailability | 'checking'>('checking')
  const [progress, setProgress] = useState<number | null>(null)
  const [preparing, setPreparing] = useState(false)
  const [prepError, setPrepError] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('intake')
  const [leaseText, setLeaseText] = useState('')
  const [pages, setPages] = useState<PageImage[]>([])
  const [batch, setBatch] = useState<string[]>([])
  const [donePages, setDonePages] = useState<string[]>([])
  const [rejections, setRejections] = useState<string[]>([])
  const [playbookId, setPlaybookId] = useState('us-typical')

  const [cloudConsent, setCloudConsent] = useState(false)
  const [showConsent, setShowConsent] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<{ message: string; raw?: string } | null>(null)
  const [batchMode, setBatchMode] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const [extract, setExtract] = useState<LeaseExtract | null>(null)
  const [extractSource, setExtractSource] = useState<SourceLabel>('FIXTURE')
  const [unsure, setUnsure] = useState<string[]>([])

  const [findings, setFindings] = useState<DisplayFinding[]>([])
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checkSource, setCheckSource] = useState<SourceLabel | null>(null)
  const [checkPrompt, setCheckPrompt] = useState<string | null>(null)

  // Judge Mode (?judge=1): pre-warm, timing, cached verdict for the sample lease only.
  const judge = useMemo(() => isJudgeMode(), [])
  const record = useMemo(() => isRecordMode(), [])
  const [sampleText, setSampleText] = useState<string | null>(null)
  const [samplePageIds, setSamplePageIds] = useState<string[]>([])
  const [extractIsSample, setExtractIsSample] = useState(false)
  const [originalExtract, setOriginalExtract] = useState<string | null>(null)
  const [cached, setCached] = useState<CachedInfo | null>(null)
  const [liveRetry, setLiveRetry] = useState<LiveRetry | null>(null)
  const [extractMs, setExtractMs] = useState<number | null>(null)
  const [checkMs, setCheckMs] = useState<number | null>(null)
  const [lastRaw, setLastRaw] = useState<string | null>(null)
  const checkRun = useRef(0)
  /** Judge Mode: why the review shows the pinned sample values, and how the live extract compared. */
  const [pin, setPin] = useState<PinInfo | null>(null)
  const [oneClickMs, setOneClickMs] = useState<number | null>(null)
  const oneClickStart = useRef<number | null>(null)
  const [oneClickBusy, setOneClickBusy] = useState(false)
  const [checkStartedAt, setCheckStartedAt] = useState<number | null>(null)

  const [remember, setRemember] = useState(rememberEnabled())
  const [saved, setSaved] = useState<Remembered | null>(loadApproved())

  const playbook = useMemo(() => getPlaybook(playbookId), [playbookId])

  useEffect(() => {
    loadEngine()
      .then((e) => setEngine(e))
      .catch(() => setEngine(null))
  }, [])

  const refreshAvailability = useCallback(async () => {
    if (engine) setAvail(await engine.availability())
    else setAvail(await checkDeviceAvailability())
  }, [engine])

  useEffect(() => {
    if (engine !== undefined) void refreshAvailability()
  }, [engine, refreshAvailability])

  // Judge Mode pre-warm: on landing, without blocking the page or waiting for a tap.
  useEffect(() => {
    if (!judge || !engine) return
    const run = () => {
      engine.warmUp().catch(() => {
        /* warm-up is best effort; the real call reports errors */
      })
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 1500 })
    else setTimeout(run, 0)
  }, [judge, engine])

  /** True only while the document is the unmodified bundled sample (text and/or photos). */
  const isSampleDoc = useMemo(() => {
    const textOk = leaseText === '' || (sampleText !== null && leaseText === sampleText)
    const pagesOk = pages.every((p) => samplePageIds.includes(p.id))
    return textOk && pagesOk && (leaseText !== '' || pages.length > 0)
  }, [leaseText, pages, sampleText, samplePageIds])

  // Consent is per document: any change to the text or pages resets it.
  useEffect(() => {
    setCloudConsent(false)
    setShowConsent(false)
  }, [leaseText, pages])

  const step2Ready = extract !== null

  async function prepare() {
    if (!engine) return
    setPreparing(true)
    setPrepError(null)
    try {
      // Must run on a user gesture (button click). Shows progress 0..1 while Chrome downloads.
      await engine.prepareDevice((v) => setProgress(v))
    } catch (e) {
      setPrepError(`Could not prepare the on-device model: ${friendlyError(e)}. You can retry, or extract with cloud consent.`)
    } finally {
      setPreparing(false)
      await refreshAvailability()
    }
  }

  /**
   * Runs the extract. Returns the extract placed on the review screen, or null.
   * Judge Mode + unmodified bundled sample only: a thin live extract is retried
   * once, and the review is pinned to the canonical sample values (labelled),
   * so every run scores the same. User documents are never substituted.
   */
  async function doExtract(consent: boolean, override?: ExtractOverride): Promise<{ extract: LeaseExtract; sample: boolean } | null> {
    if (!engine) return null
    setExtractError(null)
    setNotice(null)
    const text = override ? override.text : leaseText
    const pageList = override ? override.pages : pages
    const batchIds = override ? override.batchIds : batch
    const batchPages = pageList.filter((p) => batchIds.includes(p.id))
    if (!text.trim() && batchPages.length === 0) {
      setExtractError({ message: 'Paste the lease text or add at least one page photo first.' })
      return null
    }
    // User gesture: start (or attach to) the on-device model, never at module load.
    if (avail === 'downloadable' && !preparing) void prepare()
    if (avail === 'available') {
      try {
        await engine.prepareDevice(() => {})
      } catch {
        /* availability is re-checked by the gate below */
      }
    }
    setExtracting(true)
    const t0 = performance.now()
    try {
      const images = await Promise.all(batchPages.map((p) => fileToGenerativePart(p.file)))
      let out = await runExtract(engine, { leaseText: text, images, cloudConsent: consent })
      const sampleNow = override ? override.sample : batchMode ? extractIsSample && isSampleDoc : isSampleDoc
      let next = batchMode && extract ? mergeExtracts(extract, out.extract) : out.extract
      let pinInfo: PinInfo | null = null
      if (judge && sampleNow && !batchMode) {
        let retried = false
        if (isThinExtract(out.extract, { sample: true })) {
          retried = true
          try {
            out = await runExtract(engine, { leaseText: text, images, cloudConsent: consent })
          } catch {
            /* fall through to the labelled fallback */
          }
        }
        const m = matchSample(out.extract)
        pinInfo = { kind: isThinExtract(out.extract, { sample: true }) ? 'fallback' : 'pinned', ...m, retried }
        next = structuredClone(SAMPLE_EXTRACT)
      }
      setExtract(next)
      setPin(pinInfo)
      setUnsure([])
      setExtractMs(performance.now() - t0)
      setExtractIsSample(sampleNow)
      setOriginalExtract(JSON.stringify(cleanExtract(next)))
      setExtractSource(batchMode && extractSource === 'IN_CLOUD' ? 'IN_CLOUD' : out.source)
      setDonePages((d) => [...d, ...batchPages.map((p) => p.id)])
      setShowConsent(false)
      setBatchMode(false)
      setStep('review')
      if (out.source === 'IN_CLOUD' && !consent) {
        setNotice('The SDK reported this extract ran in the cloud even though the on-device model was ready.')
      }
      return { extract: next, sample: sampleNow }
    } catch (e) {
      if (e instanceof ConsentRequiredError) setShowConsent(true)
      else if (e instanceof ParseError) setExtractError({ message: e.message, raw: e.raw })
      else setExtractError({ message: friendlyError(e) })
      return null
    } finally {
      setExtracting(false)
    }
  }

  function exploreSample() {
    setExtract(structuredClone(sampleExtract) as LeaseExtract)
    setExtractSource('FIXTURE')
    setExtractMs(null)
    setExtractIsSample(false)
    setOriginalExtract(JSON.stringify(cleanExtract(sampleExtract as LeaseExtract)))
    setPin(null)
    setUnsure([])
    setStep('review')
  }

  /** Records the one-click wall-clock time when the verdict becomes final (live or cached). */
  function finishOneClick() {
    if (oneClickStart.current != null) {
      setOneClickMs(performance.now() - oneClickStart.current)
      oneClickStart.current = null
    }
  }

  async function runCloudCheck(approved: LeaseExtract, ruleFindings: DisplayFinding[], ctx: CheckCtx) {
    if (!engine) {
      finishOneClick()
      return
    }
    const runId = ++checkRun.current
    const current = () => runId === checkRun.current
    setCheckStartedAt(performance.now())
    setChecking(true)
    setCheckError(null)
    setCached(null)
    setLiveRetry(null)
    setCheckMs(null)
    setLastRaw(null)
    setCheckPrompt(buildCheckPrompt(approved, ctx.playbook, ctx.unsure))
    const t0 = performance.now()
    const applyLive = (out: CheckOutput) => {
      setFindings(mergeFindings(ruleFindings, out.findings))
      setCheckSource(out.source)
      setCheckMs(performance.now() - t0)
      setLastRaw(out.raw)
      setCached(null)
    }
    const live = runCheck(engine, approved, ctx.playbook, ctx.unsure)

    // Cached fallback is allowed ONLY in Judge Mode and ONLY for the bundled sample lease.
    const useCache = judge && ctx.sample
    if (!useCache) {
      try {
        const out = await live
        if (current()) applyLive(out)
      } catch (e) {
        if (current()) setCheckError(e instanceof ParseError ? `${e.message} Retry to ask again.` : friendlyError(e))
      } finally {
        if (current()) {
          setChecking(false)
          finishOneClick()
        }
      }
      return
    }

    type Race = { kind: 'ok'; out: CheckOutput } | { kind: 'err'; e: unknown } | { kind: 'timeout' }
    const r = await Promise.race<Race>([
      live.then(
        (out) => ({ kind: 'ok', out }) as Race,
        (e) => ({ kind: 'err', e }) as Race,
      ),
      sleep(JUDGE_TIMEOUT_MS).then(() => ({ kind: 'timeout' }) as Race),
    ])
    if (!current()) return
    if (r.kind === 'ok') {
      applyLive(r.out)
      setChecking(false)
      finishOneClick()
      return
    }

    const cv = cachedSampleVerdict(ctx.playbook, approved)
    setFindings(mergeFindings(ruleFindings, cv.cloudFindings))
    setCheckSource('CACHED')
    setCheckMs(performance.now() - t0)
    setCached({
      reason: r.kind === 'timeout' ? `The live check took longer than ${JUDGE_TIMEOUT_MS / 1000} seconds.` : friendlyError(r.e),
      hasRecordedCloud: cv.hasRecordedCloud,
      recordedAt: cv.recordedAt,
      edited: ctx.original !== null && JSON.stringify(approved) !== ctx.original,
    })
    setChecking(false)
    finishOneClick()

    // Keep retrying live in the background; swap in the live result if it arrives.
    const waits = r.kind === 'timeout' ? [0, ...JUDGE_RETRY_DELAYS_MS] : JUDGE_RETRY_DELAYS_MS
    for (let i = 0; i < waits.length; i++) {
      setLiveRetry({ attempt: i + 1, total: waits.length, active: true, swapped: false })
      if (waits[i]) await sleep(waits[i])
      if (!current()) return
      try {
        const out = await (i === 0 && r.kind === 'timeout' ? live : runCheck(engine, approved, ctx.playbook, ctx.unsure))
        if (!current()) return
        applyLive(out)
        setLiveRetry({ attempt: i + 1, total: waits.length, active: false, swapped: true })
        return
      } catch {
        /* try again after the next delay */
      }
    }
    if (current()) setLiveRetry({ attempt: waits.length, total: waits.length, active: false, swapped: false })
  }

  function downloadVerdictFixture() {
    if (!extract || !lastRaw) return
    const data = verdictFixture(lastRaw, playbookId, CLOUD_MODEL, cleanExtract(extract))
    const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'sample-verdict.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  async function approve(given?: LeaseExtract, ctx?: CheckCtx) {
    const source = given ?? extract
    if (!source) return
    const approved = cleanExtract(source)
    const pb = ctx?.playbook ?? playbook
    const ruleFindings = runPlaybook(pb, approved)
    setFindings(ruleFindings)
    setCheckSource(null)
    setCheckPrompt(null)
    setCheckError(null)
    setCheckMs(null)
    setCached(null)
    setLiveRetry(null)
    setStep('results')
    window.scrollTo({ top: 0 })
    saveApproved(approved, playbookId, extractSource)
    setSaved(loadApproved())
    await runCloudCheck(approved, ruleFindings, ctx ?? { sample: extractIsSample, original: originalExtract, playbook, unsure })
  }

  /**
   * Judge Mode one-click demo: load the bundled sample, extract (the click is
   * the cloud consent when Nano is unavailable), auto-approve only if the
   * extract is full, run the cloud check and land on the clause map.
   */
  async function runSampleOneClick() {
    if (!engine || oneClickBusy) return
    setOneClickBusy(true)
    const t0 = performance.now()
    oneClickStart.current = t0
    setOneClickMs(null)
    checkRun.current++
    try {
      const r = await fetch('/fixture-lease.txt')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const text = await r.text()
      pages.forEach((p) => URL.revokeObjectURL(p.url))
      setSampleText(text)
      setLeaseText(text)
      setPages([])
      setBatch([])
      setBatchMode(false)
      setPlaybookId('us-typical')
      const consent = avail !== 'available'
      const res = await doExtract(consent, { text, pages: [], batchIds: [], sample: true })
      if (!res) {
        oneClickStart.current = null
        return
      }
      if (isThinExtract(res.extract, { sample: res.sample })) {
        // Never auto-advance a thin extract: stop on review with the warning.
        oneClickStart.current = null
        return
      }
      await approve(res.extract, {
        sample: res.sample,
        original: JSON.stringify(cleanExtract(res.extract)),
        playbook: getPlaybook('us-typical'),
        unsure: [],
      })
    } catch (e) {
      oneClickStart.current = null
      setExtractError({ message: `Could not run the sample (${friendlyError(e)}).` })
    } finally {
      setOneClickBusy(false)
    }
  }

  async function loadSample() {
    try {
      const r = await fetch('/fixture-lease.txt')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const t = await r.text()
      setSampleText(t)
      setLeaseText(t)
      setRejections([])
    } catch (e) {
      setExtractError({ message: `Could not load the sample lease (${friendlyError(e)}).` })
    }
  }

  async function loadSamplePhotos() {
    try {
      const files = await Promise.all(
        [
          ['/fixtures/lease-page-1.jpg', 'image/jpeg'],
          ['/fixtures/lease-page-2.png', 'image/png'],
        ].map(async ([url, type]) => {
          const r = await fetch(url)
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return new File([await r.blob()], url.split('/').pop()!, { type })
        }),
      )
      const added = files.map(toPage)
      setSamplePageIds(added.map((p) => p.id))
      setPages(added)
      setBatch(added.slice(0, MAX_IMAGES_PER_EXTRACT).map((p) => p.id))
      setDonePages([])
      setRejections([])
    } catch (e) {
      setExtractError({ message: `Could not load the sample photos (${friendlyError(e)}).` })
    }
  }

  function startOver() {
    checkRun.current++
    oneClickStart.current = null
    setOneClickMs(null)
    setPin(null)
    setCached(null)
    setLiveRetry(null)
    setExtractIsSample(false)
    setExtractMs(null)
    setCheckMs(null)
    pages.forEach((p) => URL.revokeObjectURL(p.url))
    setLeaseText('')
    setPages([])
    setBatch([])
    setDonePages([])
    setExtract(null)
    setFindings([])
    setUnsure([])
    setCheckSource(null)
    setCheckPrompt(null)
    setCheckError(null)
    setExtractError(null)
    setNotice(null)
    setBatchMode(false)
    setStep('intake')
  }

  function addBatch() {
    setBatchMode(true)
    setLeaseText('')
    const remaining = pages.filter((p) => !donePages.includes(p.id))
    setBatch(remaining.slice(0, MAX_IMAGES_PER_EXTRACT).map((p) => p.id))
    setStep('intake')
  }

  function restoreSaved() {
    if (!saved) return
    setExtract(saved.extract)
    setExtractSource(saved.source)
    setExtractIsSample(false)
    setExtractMs(null)
    setPin(null)
    setOriginalExtract(JSON.stringify(cleanExtract(saved.extract)))
    setPlaybookId(saved.playbookId)
    setStep('review')
  }

  const pinNote = pin ? (
    pin.kind === 'pinned' ? (
      <>
        <strong>Bundled sample values (Judge Mode).</strong> The live extract ran and matched {pin.matched} of {pin.total} key
        fields of the bundled sample{pin.differs.length ? ` (differed on ${pin.differs.join(', ')})` : ''}
        {pin.retried ? ', after one retry' : ''}. So every run scores the same, this review shows the canonical sample values from
        the bundled fixture.
      </>
    ) : (
      <>
        <strong>Fallback: bundled sample extract.</strong> The live extract came back incomplete{pin.retried ? ' twice' : ''}, so
        this review shows the bundled sample extract, not a model result for this run.
      </>
    )
  ) : null

  const setupMissing = engine === null ? missingEnv() : []
  const aiReady = !!engine
  const stepIndex = STEPS.findIndex((s) => s.id === step)
  const ONECLICK = !!(judge && engine && !batchMode && !showConsent)
  const ONECLICK_LABEL = avail === 'available' ? 'Run the sample lease' : 'Send the sample to cloud Gemini and check'
  const ONECLICK_HINT =
    avail === 'available'
      ? 'One click: loads the bundled sample lease, extracts it on this device with Gemini Nano, and checks the approved JSON in the cloud.'
      : 'Gemini Nano is not available here, so this click is your consent to send the bundled sample lease (not your data) to cloud Gemini via Firebase AI Logic, then check it.'

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:rounded focus:bg-bg focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header route={route} />
      <main id="main" className={`mx-auto w-full flex-1 px-4 sm:px-6 ${route === 'home' ? 'max-w-6xl py-0' : 'max-w-6xl py-8'}`}>
        {route === 'home' ? (
          <Landing avail={avail} />
        ) : route === 'privacy' ? (
          <Privacy />
        ) : (
          <div className="space-y-6">
            {judge && (
              <details className="judge-bar no-print rounded-2xl border border-border-subtle bg-surface px-3.5 py-1.5 text-[0.8rem] sm:rounded-full sm:open:rounded-xl" data-testid="judge-banner">
                <summary className="cursor-pointer select-none">
                  <span className="font-mono text-[0.68rem] font-medium tracking-[0.08em] text-accent-text">JUDGE MODE</span>{' '}
                  <span className="text-text-secondary">pre-warmed, timed, labelled sample fallback</span>{' '}
                  <a href="/app?judge=0" className="ml-1">
                    Turn off
                  </a>
                </summary>
                <p className="mt-1.5 pb-1 text-text-secondary">
                  Models are pre-warmed on landing and the loop is timed. For the bundled sample lease only: the review is pinned to
                  the canonical sample values (labelled) so every run scores the same, and if the live cloud check fails or takes
                  over {JUDGE_TIMEOUT_MS / 1000} s, a labelled cached result is shown while the live check keeps retrying. Your own
                  documents are never substituted.
                </p>
              </details>
            )}

            {step === 'intake' && !batchMode && (
              <Hero
                line={heroLine(avail)}
                onDevice={avail === 'available'}
                run={
                  ONECLICK ? (
                    <div className="run-card mt-6 max-w-[38rem] rounded-2xl border border-accent/40 bg-surface p-4 sm:p-5" data-testid="one-click">
                      <p className="eyebrow">Judge Mode · one click · timed</p>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
                        <button
                          type="button"
                          className="btn btn-primary btn-lg w-full sm:w-auto"
                          onClick={runSampleOneClick}
                          disabled={oneClickBusy || extracting}
                          data-testid="run-sample"
                        >
                          {oneClickBusy || extracting ? 'Running the sample…' : ONECLICK_LABEL}
                        </button>
                      </div>
                      <p className="hint mt-3 max-w-2xl">{ONECLICK_HINT}</p>
                      <p className="hint mt-1">Or use the manual path below with your own lease.</p>
                    </div>
                  ) : null
                }
              />
            )}

            <nav aria-label="Progress" className="no-print">
              <ol className="stepper flex items-center gap-1.5 text-[0.8rem] sm:gap-2 sm:text-sm">
                {STEPS.map((s, i) => (
                  <li key={s.id} className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                    <span
                      aria-current={s.id === step ? 'step' : undefined}
                      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 sm:px-3 ${s.id === step ? 'border-text bg-text text-bg font-semibold' : i < stepIndex ? 'border-border-subtle text-text' : 'border-border-subtle text-text-secondary'}`}
                    >
                      <span className="font-mono text-[0.68rem]">{i < stepIndex ? '✓' : i + 1}</span> {s.label}
                    </span>
                    {i < STEPS.length - 1 && <span className={`h-px w-3 sm:w-8 ${i < stepIndex ? 'bg-text' : 'bg-border-subtle'}`} aria-hidden="true" />}
                  </li>
                ))}
              </ol>
            </nav>

            {engine === null && (
              <section className="rounded-[14px] border border-border bg-surface p-5" aria-labelledby="setup-title" data-testid="setup-state">
                <h2 id="setup-title" className="font-semibold">
                  AI is not configured in this build
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Firebase environment variables are missing ({setupMissing.join(', ')}). Extraction and cloud review are turned
                  off. You can still explore the full flow with the sample: load it, use the pre-recorded sample extract, edit it,
                  and run the playbook rules, which execute in your browser.
                </p>
                <button type="button" className="btn mt-3 text-sm" onClick={exploreSample}>
                  Explore with the sample extract
                </button>
              </section>
            )}

            {saved && step === 'intake' && (
              <div className="paper flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <span>
                  You have a saved approved extract from {new Date(saved.savedAt).toLocaleString()} (stored only in this browser).
                </span>
                <span className="flex gap-2">
                  <button type="button" className="btn text-sm" onClick={restoreSaved}>
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-sm"
                    onClick={() => {
                      forgetApproved()
                      setSaved(null)
                    }}
                  >
                    Delete
                  </button>
                </span>
              </div>
            )}

            {step === 'intake' && (
              <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4">
                  {batchMode && (
                    <p className="rounded-lg border border-border-subtle bg-surface px-4 py-3 text-sm" role="status">
                      Adding another batch. The next extract is merged into your current map: empty fields are filled and new fees
                      are appended.
                    </p>
                  )}
                  <Intake
                    leaseText={leaseText}
                    onLeaseText={setLeaseText}
                    pages={pages}
                    onPages={setPages}
                    batch={batch}
                    onBatch={setBatch}
                    playbookId={playbookId}
                    onPlaybook={setPlaybookId}
                    onLoadSample={loadSample}
                    onLoadSamplePhotos={loadSamplePhotos}
                    rejections={rejections}
                    onRejections={setRejections}
                  />
                  {showConsent && (
                    <ConsentBanner
                      availability={avail}
                      pageCount={batch.length}
                      hasText={!!leaseText.trim()}
                      onAccept={() => {
                        setCloudConsent(true)
                        void doExtract(true)
                      }}
                      onWait={() => {
                        setShowConsent(false)
                        void prepare()
                        setNotice('Downloading Gemini Nano. Press Extract again when the download finishes.')
                      }}
                      onCancel={() => setShowConsent(false)}
                    />
                  )}
                  {extractError && (
                    <div className="rounded-[14px] border border-red-solid bg-red-bg p-4 text-sm text-red-text" role="alert" data-testid="extract-error">
                      <p className="font-semibold">Extraction did not finish.</p>
                      <p className="mt-1">{extractError.message}</p>
                      {extractError.raw && (
                        <details className="mt-2 text-text">
                          <summary className="cursor-pointer">Show raw model output</summary>
                          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs">{extractError.raw}</pre>
                        </details>
                      )}
                      {engine && (
                        <button type="button" className="btn mt-3 text-sm" onClick={() => doExtract(cloudConsent)}>
                          Retry
                        </button>
                      )}
                    </div>
                  )}
                  {notice && (
                    <p className="rounded-lg border border-border-subtle bg-surface px-4 py-3 text-sm" role="status">
                      {notice}
                    </p>
                  )}
                  {!showConsent && (
                  <div className="no-print flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className={`btn px-5 ${judge ? '' : 'btn-primary'}`}
                      onClick={() => doExtract(cloudConsent)}
                      disabled={!aiReady || extracting}
                      data-testid="extract"
                    >
                      {extracting ? 'Extracting…' : batchMode ? 'Extract and add to map' : 'Extract fee map'}
                    </button>
                    {batchMode && (
                      <button type="button" className="btn" onClick={() => { setBatchMode(false); setStep('review') }}>
                        Back to review
                      </button>
                    )}
                    {step2Ready && !batchMode && (
                      <button type="button" className="btn" onClick={() => setStep('review')}>
                        Back to review
                      </button>
                    )}
                    {cloudConsent && (
                      <span className="text-xs text-amber-text">Cloud consent given for this document.</span>
                    )}
                    {!aiReady && engine === null && <span className="hint">Extraction needs Firebase configuration.</span>}
                  </div>
                  )}
                </div>
                <aside className="space-y-4">
                  <DeviceStatus
                    availability={avail}
                    progress={progress}
                    preparing={preparing}
                    error={prepError}
                    onPrepare={prepare}
                    aiReady={aiReady}
                  />
                  <div className="paper p-4 text-sm">
                    <p className="eyebrow">Why this matters</p>
                    <p className="mt-2">
                      In a study of 70 Greater Boston leases, 51 (73%) contained at least one unenforceable clause.
                    </p>
                    <p className="hint mt-1">Furth-Matzkin, Journal of Legal Analysis, 2017.</p>
                    <p className="mt-3">Only 24% of UK tenants read the tenancy agreement before signing.</p>
                    <p className="hint mt-1">Weightmans / The Negotiator, May 2024.</p>
                  </div>
                </aside>
              </div>
            )}

            {step === 'review' && extract && (
              <ExtractEditor
                value={extract}
                onChange={setExtract}
                unsure={unsure}
                onUnsure={setUnsure}
                source={extractSource}
                playbookId={playbookId}
                cloudReviewAvailable={aiReady}
                busy={checking}
                onApprove={() => void approve()}
                onBack={() => setStep('intake')}
                onAddBatch={addBatch}
                canAddBatch={aiReady && !pin}
                thin={isThinExtract(extract, { sample: judge && extractIsSample })}
                editedByHand={originalExtract !== null && JSON.stringify(cleanExtract(extract)) !== originalExtract}
                nanoMissing={avail !== 'available'}
                pinNote={pinNote}
              />
            )}
            {step === 'review' && notice && (
              <p className="rounded-lg border border-amber-solid bg-amber-bg px-4 py-3 text-sm text-amber-text" role="status">
                {notice}
              </p>
            )}

            {step === 'results' && extract && (
              <Results
                findings={findings}
                playbook={playbook}
                extract={cleanExtract(extract)}
                extractSource={extractSource}
                checkSource={checkSource}
                checkError={checkError}
                checkPrompt={checkPrompt}
                checking={checking}
                onRetryCheck={() => {
                  const approved = cleanExtract(extract)
                  void runCloudCheck(approved, runPlaybook(playbook, approved), {
                    sample: extractIsSample,
                    original: originalExtract,
                    playbook,
                    unsure,
                  })
                }}
                onEdit={() => {
                  checkRun.current++
                  setStep('review')
                }}
                cached={cached}
                cachedLabel={CACHED_LABEL}
                liveRetry={liveRetry}
                timing={{ extractMs, checkMs, oneClickMs }}
                checkStartedAt={checkStartedAt}
                nanoMissing={avail !== 'available'}
                pinnedNote={
                  pin
                    ? pin.kind === 'pinned'
                      ? 'Judge Mode: extract values are pinned to the bundled sample so every run scores the same.'
                      : 'Fallback: the live extract was incomplete, so these results use the bundled sample extract.'
                    : null
                }
                onDownloadFixture={
                  judge && record && checkSource === 'IN_CLOUD' && extractIsSample && lastRaw ? downloadVerdictFixture : undefined
                }
                onStartOver={startOver}
                cloudReviewAvailable={aiReady}
              />
            )}
          </div>
        )}
      </main>
      <Footer>
        {route === 'check' && (
        <label className="inline-flex items-center gap-2 text-text">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => {
              setRememberEnabled(e.target.checked)
              setRemember(e.target.checked)
              if (!e.target.checked) setSaved(null)
            }}
            data-testid="remember"
          />
          Remember my last approved extract on this device (JSON only, off by default)
        </label>
        )}
      </Footer>
    </div>
  )
}

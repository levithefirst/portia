import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ConsentBanner } from './components/ConsentBanner'
import { DeviceStatus } from './components/DeviceStatus'
import { ExtractEditor } from './components/ExtractEditor'
import { Intake, toPage } from './components/Intake'
import { Privacy } from './components/Privacy'
import { Results } from './components/Results'
import { Footer, Header, routeFromPath, type Route } from './components/Shell'
import { IconChip, IconCloud, IconLock } from './components/icons'
import type { AiEngine } from './lib/engine'
import { missingEnv } from './lib/firebase'
import { loadEngine } from './lib/getEngine'
import { fileToGenerativePart } from './lib/intake'
import { checkDeviceAvailability, type DeviceAvailability } from './lib/onDevice'
import { getPlaybook } from './lib/playbooks'
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

  async function doExtract(consent: boolean) {
    if (!engine) return
    setExtractError(null)
    setNotice(null)
    const batchPages = pages.filter((p) => batch.includes(p.id))
    if (!leaseText.trim() && batchPages.length === 0) {
      setExtractError({ message: 'Paste the lease text or add at least one page photo first.' })
      return
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
      const out = await runExtract(engine, { leaseText, images, cloudConsent: consent })
      const next = batchMode && extract ? mergeExtracts(extract, out.extract) : out.extract
      setExtract(next)
      setExtractMs(performance.now() - t0)
      setExtractIsSample(batchMode ? extractIsSample && isSampleDoc : isSampleDoc)
      setOriginalExtract(JSON.stringify(cleanExtract(next)))
      setExtractSource(batchMode && extractSource === 'IN_CLOUD' ? 'IN_CLOUD' : out.source)
      setDonePages((d) => [...d, ...batchPages.map((p) => p.id)])
      setShowConsent(false)
      setBatchMode(false)
      setStep('review')
      if (out.source === 'IN_CLOUD' && !consent) {
        setNotice('The SDK reported this extract ran in the cloud even though the on-device model was ready.')
      }
    } catch (e) {
      if (e instanceof ConsentRequiredError) setShowConsent(true)
      else if (e instanceof ParseError) setExtractError({ message: e.message, raw: e.raw })
      else setExtractError({ message: friendlyError(e) })
    } finally {
      setExtracting(false)
    }
  }

  function exploreSample() {
    setExtract(structuredClone(sampleExtract) as LeaseExtract)
    setExtractSource('FIXTURE')
    setExtractMs(null)
    setExtractIsSample(false)
    setUnsure([])
    setStep('review')
  }

  async function runCloudCheck(approved: LeaseExtract, ruleFindings: DisplayFinding[]) {
    if (!engine) return
    const runId = ++checkRun.current
    const current = () => runId === checkRun.current
    setChecking(true)
    setCheckError(null)
    setCached(null)
    setLiveRetry(null)
    setCheckMs(null)
    setLastRaw(null)
    setCheckPrompt(buildCheckPrompt(approved, playbook, unsure))
    const t0 = performance.now()
    const applyLive = (out: CheckOutput) => {
      setFindings(mergeFindings(ruleFindings, out.findings))
      setCheckSource(out.source)
      setCheckMs(performance.now() - t0)
      setLastRaw(out.raw)
      setCached(null)
    }
    const live = runCheck(engine, approved, playbook, unsure)

    // Cached fallback is allowed ONLY in Judge Mode and ONLY for the bundled sample lease.
    const useCache = judge && extractIsSample
    if (!useCache) {
      try {
        const out = await live
        if (current()) applyLive(out)
      } catch (e) {
        if (current()) setCheckError(e instanceof ParseError ? `${e.message} Retry to ask again.` : friendlyError(e))
      } finally {
        if (current()) setChecking(false)
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
      return
    }

    const cv = cachedSampleVerdict(playbook, ruleFindings)
    setFindings(cv.findings)
    setCheckSource('CACHED')
    setCheckMs(performance.now() - t0)
    setCached({
      reason: r.kind === 'timeout' ? `The live check took longer than ${JUDGE_TIMEOUT_MS / 1000} seconds.` : friendlyError(r.e),
      hasRecordedCloud: cv.hasRecordedCloud,
      recordedAt: cv.recordedAt,
      edited: originalExtract !== null && JSON.stringify(approved) !== originalExtract,
    })
    setChecking(false)

    // Keep retrying live in the background; swap in the live result if it arrives.
    const waits = r.kind === 'timeout' ? [0, ...JUDGE_RETRY_DELAYS_MS] : JUDGE_RETRY_DELAYS_MS
    for (let i = 0; i < waits.length; i++) {
      setLiveRetry({ attempt: i + 1, total: waits.length, active: true, swapped: false })
      if (waits[i]) await sleep(waits[i])
      if (!current()) return
      try {
        const out = await (i === 0 && r.kind === 'timeout' ? live : runCheck(engine, approved, playbook, unsure))
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

  async function approve() {
    if (!extract) return
    const approved = cleanExtract(extract)
    const ruleFindings = runPlaybook(playbook, approved)
    setFindings(ruleFindings)
    setCheckSource(null)
    setCheckPrompt(null)
    setCheckError(null)
    setCached(null)
    setLiveRetry(null)
    setStep('results')
    window.scrollTo({ top: 0 })
    saveApproved(approved, playbookId, extractSource)
    setSaved(loadApproved())
    await runCloudCheck(approved, ruleFindings)
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
    setPlaybookId(saved.playbookId)
    setStep('review')
  }

  const setupMissing = engine === null ? missingEnv() : []
  const aiReady = !!engine
  const stepIndex = STEPS.findIndex((s) => s.id === step)

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-10 focus:rounded focus:bg-bg focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Header route={route} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {route === 'privacy' ? (
          <Privacy />
        ) : (
          <div className="space-y-6">
            {step === 'intake' && !batchMode && (
              <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-end">
                <div>
                  <h1 className="font-serif text-4xl leading-[1.08] font-medium tracking-tight sm:text-5xl">
                    See what a lease really costs before you sign.
                  </h1>
                  <p className="mt-3 max-w-xl text-text-secondary">
                    Portia maps every fee and obligation in a rental agreement, then flags terms worth questioning against a curated
                    playbook. The document is read on your device. Only the facts you approve go to the cloud.
                  </p>
                </div>
                <ol className="grid gap-2 text-sm" aria-label="How Portia works">
                  <li className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-accent text-on-accent">
                      <IconChip width={15} height={15} />
                    </span>
                    <span>
                      <strong>Extract on-device.</strong> Gemini Nano builds a JSON fee map.
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-surface">
                      <IconLock width={15} height={15} />
                    </span>
                    <span>
                      <strong>You review and approve.</strong> Edit anything; nothing leaves yet.
                    </span>
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-surface">
                      <IconCloud width={15} height={15} />
                    </span>
                    <span>
                      <strong>Check in the cloud.</strong> Only the approved JSON is scored red, amber, green.
                    </span>
                  </li>
                </ol>
              </div>
            )}

            {judge && (
              <p className="no-print rounded-lg border border-border-subtle bg-surface px-4 py-2.5 text-sm" data-testid="judge-banner">
                <span className="font-mono text-xs font-medium text-accent-text">JUDGE MODE</span>{' '}
                Models are pre-warmed on landing and the core loop is timed. For the sample lease only, if the live cloud check
                fails or takes over {JUDGE_TIMEOUT_MS / 1000} s, a cached sample result is shown and clearly labelled while the live
                check keeps retrying. <a href="/?judge=0">Turn off</a>
              </p>
            )}

            <nav aria-label="Progress" className="no-print">
              <ol className="flex flex-wrap items-center gap-2 text-sm">
                {STEPS.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span
                      aria-current={s.id === step ? 'step' : undefined}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${s.id === step ? 'border-text text-text font-semibold' : i < stepIndex ? 'border-border-subtle text-text' : 'border-border-subtle text-text-secondary'}`}
                    >
                      <span className="font-mono text-xs">{i + 1}</span> {s.label}
                    </span>
                    {i < STEPS.length - 1 && <span className="text-text-secondary" aria-hidden="true">→</span>}
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
                  <div className="no-print flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className="btn btn-primary px-5"
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
                onApprove={approve}
                onBack={() => setStep('intake')}
                onAddBatch={addBatch}
                canAddBatch={aiReady}
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
                  void runCloudCheck(approved, runPlaybook(playbook, approved))
                }}
                onEdit={() => {
                  checkRun.current++
                  setStep('review')
                }}
                cached={cached}
                cachedLabel={CACHED_LABEL}
                liveRetry={liveRetry}
                timing={{ extractMs, checkMs }}
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
      </Footer>
    </div>
  )
}

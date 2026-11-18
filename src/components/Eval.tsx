import { useMemo, useRef, useState } from 'react'
import type { AiEngine } from '../lib/engine'
import { getConfig } from '../lib/config'
import type { DeviceAvailability } from '../lib/onDevice'
import { getPlaybook } from '../lib/playbooks'
import { cleanExtract, runCheck, runExtract } from '../lib/pipeline'
import { runPlaybook } from '../lib/rules'
import { sleep } from '../lib/judge'
import type { LeaseExtract, SourceLabel } from '../lib/types'

/** Committed summaries only (written by `npm run eval:score`). Never placeholder numbers. */
const SUMMARIES = import.meta.glob('/eval/results/summary-*.json', { eager: true, import: 'default' }) as Record<string, Summary>
const TEXTS = import.meta.glob('/eval/fixtures/*/*.txt', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>
const META = import.meta.glob('/eval/fixtures/*/*.json', { import: 'default' }) as Record<string, () => Promise<{ id: string; split: string; jurisdiction: string }>>

export const EVAL_PACE_MS = 4000

interface Metrics {
  runs: number
  scored: number
  errors: number
  feeRecall: number | null
  feesFound: number
  feesPlanted: number
  rentExact: number | null
  depositExact: number | null
  lateFeeExact: number | null
  monthlyFeesExact: number | null
  trueMonthlyExact: number | null
  medianExtractMs: number | null
  p90ExtractMs: number | null
  onDeviceShare: number | null
  inCloudShare: number | null
}

interface Summary {
  date: string
  ranOn: string
  model: unknown
  machine: { chrome: string | null; note: string }
  overall: Metrics
  dev: Metrics
  holdout: Metrics
}

interface RunRow {
  id: string
  split: string
  ranOn?: SourceLabel
  rawSource?: string
  extractMs?: number
  extract?: LeaseExtract
  rules?: { red: number; amber: number; green: number }
  check?: { ranOn: SourceLabel; rawSource?: string; ms: number; findings: number }
  error?: string
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(1)}%`)
const msf = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v).toLocaleString('en')} ms`)
const PLAYBOOK_FOR: Record<string, string> = { US: 'us-typical', 'England & Wales': 'england-wales', Lagos: 'lagos' }

function chromeVersion(): string | null {
  const n = navigator as Navigator & { userAgentData?: { brands?: { brand: string; version: string }[] } }
  const b = n.userAgentData?.brands?.find((x) => /Google Chrome|Chromium/.test(x.brand))
  if (b) return `${b.brand} ${b.version}`
  const m = navigator.userAgent.match(/Chrome\/([\d.]+)/)
  return m ? `Chrome ${m[1]}` : null
}

function SummaryTable({ s }: { s: Summary }) {
  const rows: [string, (m: Metrics) => string][] = [
    ['Fee recall (required fees found / planted)', (m) => `${pct(m.feeRecall)} (${m.feesFound}/${m.feesPlanted})`],
    ['Rent exact (within 1 cent)', (m) => pct(m.rentExact)],
    ['Deposit exact', (m) => pct(m.depositExact)],
    ['Late fee exact', (m) => pct(m.lateFeeExact)],
    ['Total monthly fees exact', (m) => pct(m.monthlyFeesExact)],
    ['True monthly cost exact', (m) => pct(m.trueMonthlyExact)],
    ['Extract latency, median', (m) => msf(m.medianExtractMs)],
    ['Extract latency, p90', (m) => msf(m.p90ExtractMs)],
    ['Ran ON_DEVICE / IN_CLOUD', (m) => `${pct(m.onDeviceShare)} / ${pct(m.inCloudShare)}`],
    ['Fixtures scored (errors)', (m) => `${m.scored}/${m.runs} (${m.errors})`],
  ]
  return (
    <section className="paper p-4 sm:p-5" data-testid="eval-summary">
      <h2 className="font-serif text-xl font-medium">
        {s.date.slice(0, 10)} · {s.ranOn}
      </h2>
      <p className="hint mt-1">
        {s.machine.chrome ?? 'Browser not recorded'}
        {s.machine.note ? ` · ${s.machine.note}` : ''} · model {typeof s.model === 'string' ? s.model : JSON.stringify(s.model)}
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="text-text-secondary">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Metric</th>
              <th scope="col" className="py-1 pr-3 font-medium">All</th>
              <th scope="col" className="py-1 pr-3 font-medium">Dev</th>
              <th scope="col" className="py-1 font-medium">Holdout</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-t border-border-subtle">
                <td className="py-1.5 pr-3">{label}</td>
                <td className="py-1.5 pr-3 font-mono">{f(s.overall)}</td>
                <td className="py-1.5 pr-3 font-mono">{f(s.dev)}</td>
                <td className="py-1.5 font-mono">{f(s.holdout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Runner({ engine, avail }: { engine: AiEngine | null | undefined; avail: DeviceAvailability | 'checking' }) {
  const params = new URLSearchParams(location.search)
  const limit = Number(params.get('limit')) || Infinity
  const [split, setSplit] = useState<'all' | 'dev' | 'holdout'>('all')
  const [consent, setConsent] = useState(false)
  const [withCheck, setWithCheck] = useState(false)
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<RunRow[]>([])
  const [running, setRunning] = useState(false)
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const stop = useRef(false)

  const ids = useMemo(
    () =>
      Object.keys(TEXTS)
        .filter((k) => split === 'all' || k.includes(`/${split}/`))
        .sort()
        .slice(0, limit),
    [split, limit],
  )

  if (!engine) {
    return <p className="mt-4 text-sm">{engine === null ? 'Firebase is not configured in this build, so the eval cannot run here.' : 'Loading...'}</p>
  }
  const canStart = !running && (consent || avail === 'available')

  async function start() {
    if (!engine) return
    stop.current = false
    setRunning(true)
    setRows([])
    setStartedAt(new Date().toISOString())
    const out: RunRow[] = []
    for (let i = 0; i < ids.length && !stop.current; i++) {
      const path = ids[i]
      const meta = await META[path.replace(/\.txt$/, '.json')]()
      const row: RunRow = { id: meta.id, split: meta.split }
      try {
        const text = await TEXTS[path]()
        const t0 = performance.now()
        const r = await runExtract(engine, { leaseText: text, images: [], cloudConsent: consent })
        row.extractMs = Math.round(performance.now() - t0)
        row.ranOn = r.source
        row.rawSource = r.rawSource
        row.extract = r.extract
        const pb = getPlaybook(PLAYBOOK_FOR[meta.jurisdiction] ?? 'general-predatory-fees')
        const f = runPlaybook(pb, cleanExtract(r.extract))
        row.rules = { red: f.filter((x) => x.status === 'RED').length, amber: f.filter((x) => x.status === 'AMBER').length, green: f.filter((x) => x.status === 'GREEN').length }
        if (withCheck && consent) {
          await sleep(EVAL_PACE_MS)
          const c0 = performance.now()
          const c = await runCheck(engine, cleanExtract(r.extract), pb, [])
          row.check = { ranOn: c.source, rawSource: c.rawSource, ms: Math.round(performance.now() - c0), findings: c.findings.length }
        }
      } catch (e) {
        row.error = e instanceof Error ? e.message : String(e)
      }
      out.push(row)
      setRows([...out])
      if (i < ids.length - 1 && !stop.current) await sleep(EVAL_PACE_MS)
    }
    setRunning(false)
  }

  function download() {
    const data = {
      schema: 'portia-eval-results/1',
      synthetic: true,
      date: startedAt ?? new Date().toISOString(),
      chrome: chromeVersion(),
      userAgent: navigator.userAgent,
      machineNote: note,
      availability: avail,
      model: { cloud: getConfig().cloudModel, onDevice: 'Gemini Nano (Chrome built-in, via Firebase AI Logic)' },
      split,
      cloudCheck: withCheck && consent,
      runs: rows,
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }))
    a.download = `portia-eval-${(startedAt ?? '').slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <section className="paper mt-6 p-4 sm:p-5" aria-labelledby="runner-title" data-testid="eval-runner">
      <h2 id="runner-title" className="font-serif text-xl font-medium">
        Run the eval
      </h2>
      <p className="hint mt-1">
        Use a normal Chrome window, not browser automation (automation may disable built-in AI). Calls go through the real Firebase AI
        Logic engine and are paced {EVAL_PACE_MS / 1000} s apart. On this browser Gemini Nano is: <span className="font-mono">{avail}</span>.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="label">Fixtures</span>
          <select className="field" value={split} onChange={(e) => setSplit(e.target.value as typeof split)} disabled={running}>
            <option value="all">All 30 (dev + holdout)</option>
            <option value="dev">Dev (20)</option>
            <option value="holdout">Holdout (10)</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Machine note (saved in the results file)</span>
          <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. desktop, Chrome flags on" disabled={running} />
        </label>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={running} data-testid="eval-consent" />
        <span>These are synthetic test leases; allow cloud. (This consent covers these synthetic files only.)</span>
      </label>
      <label className="mt-2 flex items-start gap-2 text-sm">
        <input type="checkbox" checked={withCheck} onChange={(e) => setWithCheck(e.target.checked)} disabled={running || !consent} />
        <span>Also run the cloud check on each approved extract</span>
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={start} disabled={!canStart || ids.length === 0} data-testid="eval-start">
          {running ? `Running ${rows.length + 1} of ${ids.length}...` : `Start (${ids.length} fixtures)`}
        </button>
        {running && (
          <button type="button" className="btn" onClick={() => (stop.current = true)}>
            Stop after this fixture
          </button>
        )}
        {!running && rows.length > 0 && (
          <button type="button" className="btn" onClick={download} data-testid="eval-download">
            Download results JSON
          </button>
        )}
      </div>
      {!consent && avail !== 'available' && <p className="hint mt-2">Gemini Nano is not ready here, so the eval needs the synthetic-data cloud consent above.</p>}
      {rows.length > 0 && (
        <ol className="mt-4 space-y-1 font-mono text-xs" data-testid="eval-rows">
          {rows.map((r) => (
            <li key={r.id}>
              {r.id} {r.error ? `error: ${r.error}` : `${r.ranOn} ${r.extractMs} ms, rules ${r.rules?.red}/${r.rules?.amber}/${r.rules?.green}${r.check ? `, check ${r.check.ranOn} ${r.check.ms} ms` : ''}`}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export function Eval({ engine, avail }: { engine: AiEngine | null | undefined; avail: DeviceAvailability | 'checking' }) {
  const list = Object.entries(SUMMARIES)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([, s]) => s)
  const run = new URLSearchParams(location.search).get('run') === '1'
  return (
    <article className="mx-auto max-w-4xl">
      <p className="eyebrow">Accuracy eval</p>
      <h1 className="mt-1 font-serif text-4xl font-medium">How accurate is the fee map?</h1>
      {list.length === 0 ? (
        <p className="mt-4 text-lg" data-testid="eval-empty">
          No eval run recorded yet.
        </p>
      ) : (
        <div className="mt-6 space-y-5">
          <p className="text-sm text-text-secondary">
            Each table is a committed summary of one real run over 30 SYNTHETIC leases (20 dev, 10 holdout written blind). Scored by{' '}
            <span className="font-mono">npm run eval:score</span>.
          </p>
          {list.map((s) => (
            <SummaryTable key={`${s.date}-${s.ranOn}`} s={s} />
          ))}
        </div>
      )}
      {run && <Runner engine={engine} avail={avail} />}
    </article>
  )
}

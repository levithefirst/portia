import { useEffect, useMemo, useState } from 'react'
import type { Playbook } from '../lib/playbooks'
import { findRule } from '../lib/playbooks'
import { formatMoney, monthlyRent, sortFindings, totalMonthlyFees } from '../lib/rules'
import type { DisplayFinding, LeaseExtract, SourceLabel, Status } from '../lib/types'
import { SourceBadge, StatusPill } from './Badges'
import { IconCopy, IconPrint } from './icons'
import { verdictTimeText } from '../lib/judge'

export interface CachedInfo {
  reason: string
  hasRecordedCloud: boolean
  recordedAt: string | null
  /** The user edited the extract, so cached cloud commentary may not reflect the edits. */
  edited: boolean
}

export interface LiveRetry {
  attempt: number
  total: number
  active: boolean
  swapped: boolean
}

interface Props {
  findings: DisplayFinding[]
  playbook: Playbook
  extract: LeaseExtract
  extractSource: SourceLabel
  checkSource: SourceLabel | null
  checkError: string | null
  checkPrompt: string | null
  checking: boolean
  /** performance.now() when the cloud check started; drives the preliminary timer. */
  checkStartedAt: number | null
  onRetryCheck: () => void
  onEdit: () => void
  onStartOver: () => void
  cloudReviewAvailable: boolean
  cached: CachedInfo | null
  cachedLabel: string
  liveRetry: LiveRetry | null
  timing: { extractMs: number | null; checkMs: number | null; oneClickMs: number | null }
  nanoMissing: boolean
  pinnedNote: string | null
  onDownloadFixture?: () => void
}

const ALL: Status[] = ['RED', 'AMBER', 'GREEN']

function useElapsed(startedAt: number | null, running: boolean): number {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    if (!running || startedAt == null) return
    const id = setInterval(() => setNow(performance.now()), 100)
    return () => clearInterval(id)
  }, [running, startedAt])
  return startedAt == null ? 0 : Math.max(0, now - startedAt)
}

export function Results(p: Props) {
  const [show, setShow] = useState<Status[]>(['RED', 'AMBER', 'GREEN'])
  const [copied, setCopied] = useState<string | null>(null)
  const sorted = useMemo(() => sortFindings(p.findings), [p.findings])
  // Counts come from the deterministic playbook rules (source of truth). Cloud review is commentary.
  const rules = sorted.filter((f) => f.origin === 'playbook-rule')
  const commentary = sorted.filter((f) => f.origin === 'cloud-review')
  const counts = ALL.map((s) => [s, rules.filter((f) => f.status === s).length] as const)
  const visible = rules.filter((f) => show.includes(f.status))
  const questions = Array.from(new Set(sorted.filter((f) => f.status !== 'GREEN' && f.askTheLandlord).map((f) => f.askTheLandlord)))
  const rent = monthlyRent(p.extract)
  const fees = totalMonthlyFees(p.extract)

  const preliminary = p.checking && !p.cached
  const elapsed = useElapsed(p.checkStartedAt, preliminary)
  const verdict = !p.checking ? verdictTimeText(p.timing.extractMs, p.timing.checkMs, p.extractSource, p.checkSource, p.timing.oneClickMs) : null

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  function Card({ f }: { f: DisplayFinding }) {
    const rule = findRule(p.playbook, f.playbookId)
    const bar = f.status === 'RED' ? 'border-l-red-solid' : f.status === 'AMBER' ? 'border-l-amber-solid' : 'border-l-green-solid'
    return (
      <li className={`paper break-inside-avoid border-l-4 p-4 sm:p-5 ${bar}`} data-status={f.status}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={f.status} />
          <span className="font-mono text-xs text-text-secondary">{f.field}</span>
          <span className="ml-auto text-xs text-text-secondary">
            {f.origin === 'playbook-rule' ? 'Playbook rule · ran in your browser' : f.key.startsWith('cached:') ? 'Cloud review · cached sample' : 'Cloud review · Gemini'}
          </span>
        </div>
        <h3 className="mt-2 font-serif text-lg font-medium leading-snug">{f.title}</h3>
        <p className="mt-1 text-sm leading-relaxed">{f.reason}</p>
        {f.cloudNote && (
          <p className="mt-2 text-sm text-text-secondary">
            <span className="font-medium text-text">Cloud review:</span> {f.cloudNote}
          </p>
        )}
        {f.downgraded && <p className="mt-2 text-xs text-text-secondary">Shown as amber: the cloud review rated this red but cited no playbook rule.</p>}
        {f.askTheLandlord && f.status !== 'GREEN' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-bg px-3 py-2">
            <p className="flex-1 text-sm">
              <span className="eyebrow block">Ask the landlord</span>“{f.askTheLandlord}”
            </p>
            <button type="button" className="no-print btn btn-ghost p-1.5" onClick={() => copy(f.askTheLandlord, f.key)} aria-label="Copy question">
              <IconCopy />
              <span className="sr-only" aria-live="polite">
                {copied === f.key ? 'Copied' : ''}
              </span>
            </button>
          </div>
        )}
        <p className="mt-3 text-xs text-text-secondary" data-testid="citation">
          {rule ? (
            <>
              Playbook <span className="font-mono text-text">{rule.id}</span>: {rule.title}
              {rule.source ? <> · Source: {rule.source}</> : null}
            </>
          ) : (
            <>No playbook citation. Treat as a prompt to ask, not a rule.</>
          )}
        </p>
      </li>
    )
  }

  return (
    <section aria-labelledby="results-title" className="space-y-5">
      <div className="paper p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id="results-title" className="font-serif text-2xl font-medium">
              Clause map
            </h2>
            <p className="hint mt-0.5">
              Checked against <span className="font-mono">{p.playbook.id}</span>
              <span className="hidden sm:inline"> ({p.playbook.jurisdiction})</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <SourceBadge source={p.extractSource} step="Extract" nanoMissing={p.nanoMissing} />
            {p.checkSource && <SourceBadge source={p.checkSource} step="Check" />}
          </div>
        </div>

        {preliminary ? (
          <p className="mt-3 text-sm text-text-secondary" role="status" aria-live="polite" data-testid="preliminary">
            <span className="font-medium text-text">Preliminary: playbook rules in your browser.</span> Cloud review running{' '}
            <span className="font-mono">{(elapsed / 1000).toFixed(1)}s</span>
          </p>
        ) : null}

        <div className={`mt-3 grid grid-cols-3 gap-2 sm:max-w-xl ${preliminary ? 'opacity-75' : ''}`} role="group" aria-label="Filter findings by status">
          {counts.map(([s, n]) => {
            const on = show.includes(s)
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => setShow(on ? show.filter((x) => x !== s) : [...show, s])}
                className={`flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left sm:p-3 ${on ? 'border-border' : 'border-border-subtle opacity-60'}`}
                data-testid={`count-${s}`}
              >
                <StatusPill status={s} compact />
                <span className="font-mono text-2xl font-medium">{n}</span>
              </button>
            )
          })}
        </div>

        {verdict && (
          <p className="mt-3 font-mono text-[0.8rem] sm:text-sm" data-testid="verdict-time">
            {verdict}
          </p>
        )}

        {rent ? (
          <p className="mt-2 text-sm" data-testid="results-true-monthly">
            True monthly cost: <strong className="font-mono">{formatMoney(rent + fees, p.extract.currency)}</strong>{' '}
            <span className="text-text-secondary">
              ({formatMoney(rent, p.extract.currency)} rent + {formatMoney(fees, p.extract.currency)} required fees)
            </span>
          </p>
        ) : null}

        {p.pinnedNote && <p className="mt-2 text-xs text-text-secondary">{p.pinnedNote}</p>}

        <p className="mt-4 rounded-lg border border-border-subtle bg-bg px-3 py-2 text-sm">
          <strong>Not legal advice.</strong> Red means "likely worth pushing back on before signing", amber means "ask about this",
          green means "looks typical". Counts come from the curated static playbook rules, not from the law where you live.
        </p>
      </div>

      {p.cached && (
        <div className="rounded-[14px] border-2 border-amber-solid bg-amber-bg p-4 text-sm" role="status" data-testid="cached-banner">
          <p className="font-semibold text-amber-text">{p.cachedLabel}</p>
          <p className="mt-1">
            {p.cached.reason}{' '}
            {p.cached.hasRecordedCloud
              ? `Cloud commentary below is from a recorded live check of this sample${p.cached.recordedAt ? ` (${new Date(p.cached.recordedAt).toLocaleDateString()})` : ''}. Counts come from the playbook rules run in your browser.`
              : 'No recorded cloud commentary applies, so only the playbook rules run in your browser are shown.'}
          </p>
          {p.cached.edited && <p className="mt-1">You edited the extract: cached commentary reflects the unedited sample, while the playbook rules reflect your edits.</p>}
          {p.liveRetry && (
            <p className="mt-2 text-text-secondary" aria-live="polite">
              {p.liveRetry.active
                ? `Retrying the live check in the background (attempt ${p.liveRetry.attempt} of ${p.liveRetry.total}). The live result replaces this one if it arrives.`
                : 'The live check is still unavailable. Use "Retry cloud review" to try again.'}
            </p>
          )}
          {!p.liveRetry?.active && (
            <button type="button" className="btn mt-3 text-sm" onClick={p.onRetryCheck}>
              Retry cloud review
            </button>
          )}
        </div>
      )}
      {p.liveRetry?.swapped && !p.cached && (
        <p className="rounded-lg border border-green-solid bg-green-bg px-4 py-2.5 text-sm text-green-text" role="status" data-testid="live-swapped">
          Live result arrived and replaced the cached sample result.
        </p>
      )}

      {p.onDownloadFixture && (
        <div className="no-print paper p-4 text-sm">
          <p className="font-semibold">Record mode</p>
          <p className="hint mt-1">This live cloud verdict for the unmodified sample lease can be saved as the bundled Judge Mode fallback.</p>
          <button type="button" className="btn mt-2 text-sm" onClick={p.onDownloadFixture}>
            Download verdict fixture (sample-verdict.json)
          </button>
        </div>
      )}

      {p.checkError && (
        <div className="rounded-[14px] border border-red-solid bg-red-bg p-4 text-sm text-red-text" role="alert">
          <p className="font-semibold">The cloud review failed.</p>
          <p className="mt-1">{p.checkError}</p>
          <p className="mt-1 text-text">Playbook rule findings below are still valid.</p>
          <button type="button" className="btn mt-3 text-sm" onClick={p.onRetryCheck}>
            Retry cloud review
          </button>
        </div>
      )}
      {!p.cloudReviewAvailable && <p className="hint">Cloud review is not configured in this build, so only in-browser playbook rules are shown.</p>}

      <ol className="space-y-3" aria-label="Findings" data-testid="findings">
        {visible.map((f) => (
          <Card key={f.key} f={f} />
        ))}
        {visible.length === 0 && (
          <li className="paper p-5 text-sm text-text-secondary">
            {rules.length === 0 ? 'No findings. The extract may be mostly empty; go back and fill in what you can.' : 'No findings match the selected filters.'}
          </li>
        )}
      </ol>

      {commentary.length > 0 && (
        <section aria-labelledby="commentary-title" className="space-y-3" data-testid="commentary">
          <div>
            <h2 id="commentary-title" className="font-serif text-xl font-medium">
              Cloud review commentary
            </h2>
            <p className="hint">Extra points from the cloud review. Not counted in the tiles above.</p>
          </div>
          <ol className="space-y-3">
            {commentary.map((f) => (
              <Card key={f.key} f={f} />
            ))}
          </ol>
        </section>
      )}

      <div className="paper p-5 sm:p-6" data-testid="questions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-medium">Questions for the landlord</h2>
          <button type="button" className="no-print btn btn-primary text-sm" onClick={() => window.print()}>
            <IconPrint /> Print or save as PDF
          </button>
        </div>
        {questions.length ? (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
            {questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ol>
        ) : (
          <p className="hint mt-2">No red or amber findings, so no questions yet.</p>
        )}
        <p className="print-only mt-4 text-xs">
          Prepared with Portia. Not legal advice. Playbook {p.playbook.id} v{p.playbook.version}.
        </p>
      </div>

      {p.checkPrompt && (
        <details className="no-print paper p-5">
          <summary className="cursor-pointer text-sm font-semibold">View the exact text sent to the check model</summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-bg p-3 font-mono text-[0.72rem]">
            {p.checkPrompt}
          </pre>
        </details>
      )}

      <div className="no-print flex flex-wrap gap-3">
        <button type="button" className="btn" onClick={p.onEdit}>
          Edit the extract
        </button>
        <button type="button" className="btn btn-ghost" onClick={p.onStartOver}>
          Start over
        </button>
      </div>
    </section>
  )
}

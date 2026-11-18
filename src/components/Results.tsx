import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Playbook } from '../lib/playbooks'
import { findRule } from '../lib/playbooks'
import { formatMoney, monthlyRent, sortFindings, totalMonthlyFees } from '../lib/rules'
import type { DisplayFinding, LeaseExtract, SourceLabel, Status } from '../lib/types'
import { SourceBadge, StatusPill, statusLabel } from './Badges'
import { IconCopy, IconPrint } from './icons'
import { LogoMark } from './Shell'
import { verdictTimeText } from '../lib/judge'
import type { ReceiptStep } from '../lib/receipt'
import { Receipt } from './Receipt'
import { mailtoHref, shareText } from '../lib/share'

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
  /** Privacy receipt rows for this run, and the lease text they are measured against. */
  receipt: ReceiptStep[]
  receiptLease: string
  receiptFooter?: ReactNode
  /** Browser online state; the offline "Run cloud review now" button is enabled only when true. */
  online: boolean
}

const ALL: Status[] = ['RED', 'AMBER', 'GREEN']
const slug = (k: string) => k.replace(/[^a-zA-Z0-9_-]/g, '-')

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
  const headingRef = useRef<HTMLHeadingElement>(null)
  // Step change: move focus to the results heading so keyboard and screen reader users land on the result.
  useEffect(() => {
    headingRef.current?.focus()
  }, [])
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

  function Card({ f, i }: { f: DisplayFinding; i: number }) {
    const rule = findRule(p.playbook, f.playbookId)
    const bar = f.status === 'RED' ? 'border-l-red-solid' : f.status === 'AMBER' ? 'border-l-amber-solid' : 'border-l-green-solid'
    return (
      <li
        id={`f-${slug(f.key)}`}
        className={`finding paper break-inside-avoid border-l-4 p-4 sm:p-6 ${bar}`}
        data-status={f.status}
        style={{ ['--i' as string]: i }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[0.7rem] text-text-secondary" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
          <StatusPill status={f.status} />
          <span className="font-mono text-xs text-text-secondary">{f.field}</span>
          <span className="w-full text-xs text-text-secondary sm:ml-auto sm:w-auto">
            {f.origin === 'playbook-rule' ? 'Playbook rule · ran in your browser' : f.key.startsWith('cached:') ? 'Cloud review · cached sample' : 'Cloud review · Gemini'}
          </span>
        </div>
        <h3 className="mt-3 font-serif text-[1.3rem] font-medium leading-snug tracking-tight">{f.title}</h3>
        <p className="mt-1.5 max-w-[72ch] text-[0.92rem] leading-relaxed">{f.reason}</p>
        {f.cloudNote && (
          <p className="mt-2 text-sm text-text-secondary">
            <span className="font-medium text-text">Cloud review:</span> {f.cloudNote}
          </p>
        )}
        {f.downgraded && <p className="mt-2 text-xs text-text-secondary">Shown as amber: the cloud review rated this red but cited no playbook rule.</p>}
        {f.askTheLandlord && f.status !== 'GREEN' && (
          <div className="ask mt-4 flex items-start gap-3 rounded-r-lg bg-bg py-2.5 pr-2 pl-3.5">
            <p className="flex-1 font-serif text-[1.02rem] leading-snug">
              <span className="eyebrow mb-1 block font-sans">Ask the landlord</span>“{f.askTheLandlord}”
            </p>
            <button type="button" className="no-print btn btn-ghost gap-1.5 px-2 py-1.5 text-xs" onClick={() => copy(f.askTheLandlord, f.key)} aria-label="Copy question">
              <IconCopy />
              <span aria-hidden="true" className={copied === f.key ? 'text-green-text' : 'text-text-secondary'}>
                {copied === f.key ? 'Copied' : 'Copy'}
              </span>
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

  const total = rules.length
  return (
    <section aria-labelledby="results-title" className="space-y-5">
      <div className="paper overflow-hidden p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div>
            <p className="eyebrow">
              Checked against <span className="text-text">{p.playbook.id}</span>
              <span className="hidden sm:inline normal-case tracking-normal"> · {p.playbook.jurisdiction}</span>
            </p>
            <h2 id="results-title" ref={headingRef} tabIndex={-1} className="mt-1 font-serif text-[1.9rem] leading-tight font-medium tracking-tight sm:text-[2.3rem]">
              Clause map
            </h2>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <SourceBadge source={p.extractSource} step="Extract" nanoMissing={p.nanoMissing} />
            {p.checkSource && <SourceBadge source={p.checkSource} step="Check" />}
          </div>
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="results-announcer">
          {!p.checking && p.checkSource
            ? `Results ready: ${counts[0][1]} red, ${counts[1][1]} amber, ${counts[2][1]} green.${p.checkSource === 'IN_CLOUD' && !p.liveRetry?.swapped ? ' Cloud review added.' : ''}`
            : ''}
        </p>
        {preliminary ? (
          <p id="prelim-label" className="mt-3 text-sm text-text-secondary" role="status" aria-live="polite" data-testid="preliminary">
            <span className="font-medium text-text">Preliminary: playbook rules in your browser.</span> Cloud review running{' '}
            <span className="font-mono" aria-hidden="true">
              {(elapsed / 1000).toFixed(1)}s
            </span>
          </p>
        ) : null}

        <div className={`mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] ${preliminary ? 'opacity-75' : ''}`}>
          {rent ? (
            <div className="cost-band flex flex-col justify-between gap-3 p-4 sm:p-5" data-testid="results-true-monthly">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.08em] muted">True monthly cost:</p>
              <p>
                <strong className="cost-figure block text-[2.6rem] sm:text-[3.4rem]">{formatMoney(rent + fees, p.extract.currency)}</strong>
                <span className="mt-2 block font-mono text-[0.75rem] muted">
                  ({formatMoney(rent, p.extract.currency)} rent + {formatMoney(fees, p.extract.currency)} required fees)
                </span>
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <div
              className="grid grid-cols-3 gap-2"
              role="group"
              aria-label={preliminary ? 'Preliminary counts. Filter findings by status' : 'Filter findings by status'}
              aria-busy={preliminary}
              aria-describedby={preliminary ? 'prelim-label' : undefined}
              data-testid="tiles"
            >
              {counts.map(([s, n]) => {
                const on = show.includes(s)
                const tone = s === 'RED' ? 'text-red-text' : s === 'AMBER' ? 'text-amber-text' : 'text-green-text'
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setShow(on ? show.filter((x) => x !== s) : [...show, s])}
                    className={`tile flex flex-col items-start gap-2 rounded-xl border bg-bg p-2.5 text-left sm:p-3.5 ${on ? 'border-border' : 'border-border-subtle opacity-60'}`}
                    data-testid={`count-${s}`}
                  >
                    <StatusPill status={s} compact />
                    <span className={`num font-mono font-medium ${tone}`}>{n}</span>
                  </button>
                )
              })}
            </div>
            {total > 0 && (
              <div>
                <ol className="map-strip flex h-2.5 gap-[3px]" aria-label="Jump to a finding">
                  {rules.map((f, i) => (
                    <li key={f.key} className="flex-1" style={{ ['--i' as string]: i }}>
                      <a href={`#f-${slug(f.key)}`} className={`seg-${f.status}`} aria-label={`${statusLabel(f.status)}: ${f.title}`} title={f.title} />
                    </li>
                  ))}
                </ol>
                <p className="mt-1.5 font-mono text-[0.68rem] text-text-secondary">
                  {total} playbook {total === 1 ? 'flag' : 'flags'}, most serious first
                </p>
              </div>
            )}
          </div>
        </div>

        {verdict && (
          <p className="mt-4 font-mono text-[0.78rem] text-text sm:text-[0.82rem]" data-testid="verdict-time">
            {verdict}
          </p>
        )}

        {p.pinnedNote && <p className="mt-1.5 text-xs text-text-secondary">{p.pinnedNote}</p>}

        <Receipt steps={p.receipt} leaseText={p.receiptLease} footer={p.receiptFooter} />

        <p className="mt-4 border-t border-border-subtle pt-3 text-[0.82rem] leading-relaxed text-text-secondary">
          <strong className="text-text">Not legal advice.</strong> Red means "likely worth pushing back on before signing", amber means "ask about this",
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
                : 'The live check is still unavailable. Use "Retry live check" to try again.'}
            </p>
          )}
          <button type="button" className="btn mt-3 text-sm" onClick={p.onRetryCheck} data-testid="retry-live">
            Retry live check
          </button>
        </div>
      )}
      {p.checkSource === 'RULES_ONLY' && (
        <div className="rounded-[14px] border border-border bg-surface p-4 text-sm" role="status" data-testid="offline-panel">
          <p className="font-semibold">Checked by the playbook rules in this browser. No model was called.</p>
          <p className="mt-1 text-text-secondary">Cloud review will add commentary when you are back online.</p>
          <button
            type="button"
            className="btn mt-3 text-sm"
            onClick={p.onRetryCheck}
            disabled={!p.online || !p.cloudReviewAvailable}
            data-testid="run-cloud-now"
          >
            Run cloud review now
          </button>
          {!p.online && <span className="hint ml-3">Available when you are back online.</span>}
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
      {!p.cloudReviewAvailable && p.checkSource !== 'RULES_ONLY' && <p className="hint">Cloud review is not configured in this build, so only in-browser playbook rules are shown.</p>}

      <ol className="space-y-3" aria-label="Findings" data-testid="findings">
        {visible.map((f, i) => (
          <Card key={f.key} f={f} i={i} />
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
            {commentary.map((f, i) => (
              <Card key={f.key} f={f} i={i} />
            ))}
          </ol>
        </section>
      )}

      <div className="paper p-5 sm:p-6" data-testid="questions">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl font-medium">Questions for the landlord</h2>
          <div className="no-print flex flex-wrap gap-2">
            {questions.length > 0 && (
              <>
                <button type="button" className="btn text-sm" onClick={() => copy(shareText(questions, p.extract), 'all-questions')} data-testid="copy-all">
                  <IconCopy /> {copied === 'all-questions' ? 'Copied' : 'Copy all'}
                </button>
                <a className="btn text-sm no-underline" href={mailtoHref(questions, p.extract)} data-testid="email-questions">
                  Email these questions
                </a>
              </>
            )}
            <button type="button" className="btn btn-primary text-sm" onClick={() => window.print()}>
              <IconPrint /> Print or save as PDF
            </button>
          </div>
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
          <span className="mr-2 inline-block align-middle">
            <LogoMark size={16} />
          </span>
          Prepared with Portia. Not legal advice. Playbook {p.playbook.id} v{p.playbook.version}.
        </p>
      </div>


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

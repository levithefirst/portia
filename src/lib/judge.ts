import verdict from '../fixtures/sample-verdict.json'
import type { Playbook } from './playbooks'
import { parseFindings } from './pipeline'
import { totalMonthlyFees } from './rules'
import sampleExtractJson from '../fixtures/sample-extract.json'
import type { DisplayFinding, LeaseExtract, SourceLabel } from './types'

/**
 * Judge Mode: a reliability mode for evaluators. Turned on with ?judge=1
 * (kept for the browser session). It pre-warms the models on landing and,
 * for the SAMPLE LEASE ONLY, falls back to a bundled verdict if the live
 * cloud check errors, is rate limited, or takes longer than 8 seconds.
 */
export const JUDGE_TIMEOUT_MS = 8000
export const JUDGE_RETRY_DELAYS_MS = [3000, 6000, 12000, 24000]
export const CACHED_LABEL = 'Cached sample result (live check unavailable)'

const KEY = 'portia.judge'

export function isJudgeMode(): boolean {
  try {
    const q = new URLSearchParams(location.search)
    if (q.has('judge')) {
      const on = q.get('judge') !== '0'
      if (on) sessionStorage.setItem(KEY, '1')
      else sessionStorage.removeItem(KEY)
      return on
    }
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function isRecordMode(): boolean {
  try {
    return new URLSearchParams(location.search).get('record') === '1'
  } catch {
    return false
  }
}

export interface SampleVerdictFile {
  recorded: boolean
  note?: string
  playbookId: string
  model: string
  inferenceSource: string
  recordedAt: string | null
  rawText: string
  approvedExtract?: LeaseExtract
}

export const sampleVerdict = verdict as SampleVerdictFile

export interface CachedVerdict {
  /** Cloud findings from the recorded run, used as commentary only. */
  cloudFindings: DisplayFinding[]
  /** True when cloud findings from a recorded run are included. */
  hasRecordedCloud: boolean
  recordedAt: string | null
}

const baseField = (f: string) => f.replace(/\[\d+\]$/, '')

/**
 * Builds the cached verdict for the sample lease: the recorded cloud findings
 * for the same playbook, as commentary. A recorded finding is dropped when the
 * recorded run saw a different value for that field than the approved JSON,
 * so cached commentary never describes numbers that are not on screen.
 * Callers must only use this for the unmodified bundled sample in Judge Mode.
 */
export function cachedSampleVerdict(playbook: Playbook, approved: LeaseExtract): CachedVerdict {
  const usable = sampleVerdict.recorded && sampleVerdict.playbookId === playbook.id
  let cloud: DisplayFinding[] = []
  if (usable) {
    try {
      const rec = sampleVerdict.approvedExtract
      cloud = parseFindings(sampleVerdict.rawText, playbook)
        .filter((f) => {
          if (!rec) return true
          const k = baseField(f.field) as keyof LeaseExtract
          return JSON.stringify(rec[k]) === JSON.stringify(approved[k])
        })
        .map((f) => ({ ...f, key: `cached:${f.key}` }))
    } catch {
      cloud = []
    }
  }
  return { cloudFindings: cloud, hasRecordedCloud: usable && cloud.length > 0, recordedAt: sampleVerdict.recordedAt }
}

/** The canonical bundled sample extract (from the recorded run; see docs/DEMO-SCRIPT.md). */
export const SAMPLE_EXTRACT = sampleExtractJson as LeaseExtract
export const SAMPLE_MONTHLY_FEES = 111.95

const CORE: (keyof LeaseExtract)[] = [
  'rentAmount',
  'rentPeriod',
  'depositAmount',
  'lateFeeAmount',
  'lateFeeGraceDays',
  'mandatoryFees',
  'noticePeriodDays',
  'autoRenewal',
]

function filled(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'number' && Number.isNaN(v))
}

export function countFilled(x: LeaseExtract): { filled: number; total: number } {
  const keys = Object.keys(LABEL_KEYS) as (keyof LeaseExtract)[]
  return { filled: keys.filter((k) => filled(x[k])).length, total: keys.length }
}

const LABEL_KEYS: Record<keyof LeaseExtract, true> = {
  currency: true,
  rentAmount: true,
  rentPeriod: true,
  depositAmount: true,
  lateFeeAmount: true,
  lateFeeGraceDays: true,
  mandatoryFees: true,
  noticePeriodDays: true,
  autoRenewal: true,
  guestPolicy: true,
  maintenanceResponsibility: true,
  earlyTerminationPenalty: true,
  otherMoneyTerms: true,
  rawNotes: true,
}

/**
 * The fullness bar. Any extract needs rent plus at least 5 of 8 core money
 * fields. The bundled sample must also have deposit, late fee, grace days and
 * required monthly fees totalling about $111.95.
 */
export function isThinExtract(x: LeaseExtract, opts: { sample?: boolean } = {}): boolean {
  if (typeof x.rentAmount !== 'number') return true
  if (CORE.filter((k) => filled(x[k])).length < 5) return true
  if (opts.sample) {
    if ((['depositAmount', 'lateFeeAmount', 'lateFeeGraceDays'] as const).some((k) => typeof x[k] !== 'number')) return true
    if (Math.abs(totalMonthlyFees(x) - SAMPLE_MONTHLY_FEES) > 0.5) return true
  }
  return false
}

/** How many core fields of a live extract match the canonical sample. */
export function matchSample(live: LeaseExtract): { matched: number; total: number; differs: string[] } {
  const differs: string[] = []
  for (const k of CORE) {
    const a = k === 'mandatoryFees' ? Math.round(totalMonthlyFees(live) * 100) : live[k]
    const b = k === 'mandatoryFees' ? Math.round(totalMonthlyFees(SAMPLE_EXTRACT) * 100) : SAMPLE_EXTRACT[k]
    if (JSON.stringify(a) !== JSON.stringify(b)) differs.push(k)
  }
  return { matched: CORE.length - differs.length, total: CORE.length, differs }
}

/** File the record button downloads, to be committed as src/fixtures/sample-verdict.json. */
export function verdictFixture(raw: string, playbookId: string, model: string, approved: LeaseExtract): SampleVerdictFile & { approvedExtract: LeaseExtract } {
  return {
    recorded: true,
    note: 'Recorded from a live Firebase AI Logic cloud check of the Portia sample lease in Judge Mode.',
    playbookId,
    model,
    inferenceSource: 'in_cloud',
    recordedAt: new Date().toISOString(),
    rawText: raw,
    approvedExtract: approved,
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))


const WHERE: Record<SourceLabel, string> = {
  ON_DEVICE: 'on-device',
  IN_CLOUD: 'cloud',
  FIXTURE: 'sample data',
  CACHED: 'cached sample',
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/**
 * "Verdict in 4.2s, on-device + cloud": extract time + check time, excluding
 * the user's review time. With oneClickMs (Judge Mode one-click run), the
 * headline is the wall-clock time from the click, including loading the sample.
 */
export function verdictTimeText(
  extractMs: number | null,
  checkMs: number | null,
  extractSource: SourceLabel,
  checkSource: SourceLabel | null,
  oneClickMs: number | null = null,
): string | null {
  if (checkMs == null || !checkSource) return null
  const total = oneClickMs ?? (extractMs ?? 0) + checkMs
  const parts = extractMs != null ? ` (extract ${secs(extractMs)} + check ${secs(checkMs)})` : ` (check ${secs(checkMs)})`
  return `Verdict in ${secs(total)}, ${WHERE[extractSource]} + ${WHERE[checkSource]}${parts}${oneClickMs != null ? ', one click' : ''}`
}

import verdict from '../fixtures/sample-verdict.json'
import type { Playbook } from './playbooks'
import { mergeFindings, parseFindings } from './pipeline'
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
}

export const sampleVerdict = verdict as SampleVerdictFile

export interface CachedVerdict {
  findings: DisplayFinding[]
  /** True when cloud findings from a recorded run are included. */
  hasRecordedCloud: boolean
  recordedAt: string | null
}

/**
 * Builds the cached verdict for the sample lease: the in-browser playbook
 * rules on the current approved JSON, plus the recorded cloud findings when a
 * real run has been bundled for the same playbook. Callers must only use this
 * when the document is the unmodified sample lease.
 */
export function cachedSampleVerdict(playbook: Playbook, ruleFindings: DisplayFinding[]): CachedVerdict {
  const usable = sampleVerdict.recorded && sampleVerdict.playbookId === playbook.id
  let cloud: DisplayFinding[] = []
  if (usable) {
    try {
      cloud = parseFindings(sampleVerdict.rawText, playbook).map((f) => ({ ...f, key: `cached:${f.key}` }))
    } catch {
      cloud = []
    }
  }
  return { findings: mergeFindings(ruleFindings, cloud), hasRecordedCloud: usable && cloud.length > 0, recordedAt: sampleVerdict.recordedAt }
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

/** "Verdict in 4.2s, on-device + cloud": extract time + check time, excluding the user's review time. */
export function verdictTimeText(extractMs: number | null, checkMs: number | null, extractSource: SourceLabel, checkSource: SourceLabel | null): string | null {
  if (checkMs == null || !checkSource) return null
  const total = (extractMs ?? 0) + checkMs
  const parts = extractMs != null ? ` (extract ${secs(extractMs)} + check ${secs(checkMs)})` : ` (check ${secs(checkMs)})`
  return `Verdict in ${secs(total)}, ${WHERE[extractSource]} + ${WHERE[checkSource]}${parts}`
}

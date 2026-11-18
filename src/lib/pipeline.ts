import type { AiEngine } from './engine'
import type { Playbook } from './playbooks'
import { findRule } from './playbooks'
import { buildCheckPrompt, buildExtractPrompt } from './prompts'
import type { DisplayFinding, Finding, ImagePart, LeaseExtract, SourceLabel, Status } from './types'

export class ConsentRequiredError extends Error {
  constructor() {
    super('On-device model is not ready. Cloud consent is required before sending the document.')
    this.name = 'ConsentRequiredError'
  }
}

export class ParseError extends Error {
  raw: string
  constructor(message: string, raw: string) {
    super(message)
    this.name = 'ParseError'
    this.raw = raw
  }
}

export interface ExtractInput {
  leaseText: string
  images: ImagePart[]
  /** True only after the user accepted the cloud consent banner for this document. */
  cloudConsent: boolean
}

export interface ExtractOutput {
  extract: LeaseExtract
  source: SourceLabel
  /** Exact SDK inferenceSource string. */
  rawSource?: string
  prompt: string
}

/**
 * The privacy gate lives here. Under PREFER_ON_DEVICE the SDK falls back to
 * the cloud when the on-device model is not ready, which would ship the raw
 * lease. Portia checks first and refuses to call the model without consent.
 */
export async function runExtract(engine: AiEngine, input: ExtractInput): Promise<ExtractOutput> {
  const prompt = buildExtractPrompt(input.leaseText, input.images.length)
  const mimeTypes = input.images.map((i) => i.inlineData.mimeType)
  const onDevice = await engine.willRunOnDevice(prompt, mimeTypes)
  if (!onDevice && !input.cloudConsent) throw new ConsentRequiredError()

  const { text, source, rawSource } = await engine.extract(prompt, input.images)
  return { extract: parseExtract(text), source, rawSource, prompt }
}

export function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    return JSON.parse(trimmed)
  } catch (e) {
    throw new ParseError(`The model returned text that is not valid JSON (${(e as Error).message}).`, text)
  }
}

const NUM_FIELDS = ['rentAmount', 'depositAmount', 'lateFeeAmount', 'lateFeeGraceDays', 'noticePeriodDays'] as const
const STR_FIELDS = ['currency', 'rentPeriod', 'guestPolicy', 'maintenanceResponsibility', 'earlyTerminationPenalty', 'rawNotes'] as const

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''))
    if (v.trim() && Number.isFinite(n)) return n
  }
  return undefined
}

/** Parses and normalises the extract. Unknown keys are dropped; bad values become empty fields. */
export function parseExtract(text: string): LeaseExtract {
  const raw = parseJson(text)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ParseError('The model returned JSON, but not an object.', text)
  }
  const r = raw as Record<string, unknown>
  const out: LeaseExtract = {}
  for (const k of NUM_FIELDS) {
    const n = num(r[k])
    if (n !== undefined) out[k] = n
  }
  for (const k of STR_FIELDS) {
    if (typeof r[k] === 'string' && (r[k] as string).trim()) out[k] = (r[k] as string).trim()
  }
  const ar = String(r.autoRenewal ?? '').toLowerCase()
  if (ar === 'yes' || ar === 'true') out.autoRenewal = 'yes'
  else if (ar === 'no' || ar === 'false') out.autoRenewal = 'no'
  else if (ar === 'unclear') out.autoRenewal = 'unclear'
  if (Array.isArray(r.mandatoryFees)) {
    out.mandatoryFees = r.mandatoryFees
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f) => ({ name: String(f.name ?? 'Unnamed fee'), amount: num(f.amount), frequency: f.frequency ? String(f.frequency) : undefined }))
  }
  if (Array.isArray(r.otherMoneyTerms)) {
    out.otherMoneyTerms = r.otherMoneyTerms
      .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
      .map((f) => ({ name: String(f.name ?? 'Other term'), amount: num(f.amount), notes: f.notes ? String(f.notes) : undefined }))
  }
  return out
}

/** Merges a second batch of pages into an existing extract: fills empty fields, appends lists. */
export function mergeExtracts(a: LeaseExtract, b: LeaseExtract): LeaseExtract {
  const out: LeaseExtract = { ...b, ...stripEmpty(a) }
  out.mandatoryFees = dedupeByName([...(a.mandatoryFees ?? []), ...(b.mandatoryFees ?? [])])
  out.otherMoneyTerms = dedupeByName([...(a.otherMoneyTerms ?? []), ...(b.otherMoneyTerms ?? [])])
  if (a.rawNotes && b.rawNotes && a.rawNotes !== b.rawNotes) out.rawNotes = `${a.rawNotes} ${b.rawNotes}`
  return out
}

function stripEmpty(x: LeaseExtract): LeaseExtract {
  return Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== '')) as LeaseExtract
}

function dedupeByName<T extends { name: string }>(list: T[]): T[] {
  const seen = new Set<string>()
  return list.filter((i) => {
    const k = i.name.trim().toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Removes empty values so the approved payload is exactly what the user sees. */
export function cleanExtract(x: LeaseExtract): LeaseExtract {
  const out: LeaseExtract = {}
  for (const [k, v] of Object.entries(x)) {
    if (v === undefined || v === null || v === '') continue
    if (typeof v === 'number' && Number.isNaN(v)) continue
    if (Array.isArray(v)) {
      const items = v
        .map((i) => Object.fromEntries(Object.entries(i).filter(([, iv]) => iv !== undefined && iv !== '' && !(typeof iv === 'number' && Number.isNaN(iv)))))
        .filter((i) => typeof i.name === 'string' && i.name.trim())
      if (items.length) (out as Record<string, unknown>)[k] = items
      continue
    }
    ;(out as Record<string, unknown>)[k] = v
  }
  return out
}

export interface CheckOutput {
  findings: DisplayFinding[]
  source: SourceLabel
  prompt: string
  /** Raw model text, kept so Judge Mode can record the sample verdict fixture. */
  raw: string
  /** Exact SDK inferenceSource string. */
  rawSource?: string
}

/** Sends ONLY the approved JSON (plus the public playbook rules) to the cloud check model. */
export async function runCheck(
  engine: AiEngine,
  approved: LeaseExtract,
  playbook: Playbook,
  unsureFields: string[],
): Promise<CheckOutput> {
  const prompt = buildCheckPrompt(approved, playbook, unsureFields)
  const { text, source, rawSource } = await engine.check(prompt)
  return { findings: parseFindings(text, playbook), source, prompt, raw: text, rawSource }
}

const STATUSES: Status[] = ['RED', 'AMBER', 'GREEN']

export function parseFindings(text: string, playbook: Playbook): DisplayFinding[] {
  const raw = parseJson(text)
  const arr = Array.isArray(raw) ? raw : Array.isArray((raw as { findings?: unknown })?.findings) ? (raw as { findings: unknown[] }).findings : null
  if (!arr) throw new ParseError('The cloud review did not return a list of findings.', text)
  return arr
    .filter((f): f is Finding => !!f && typeof f === 'object')
    .map((f, i) => {
      let status = String(f.status).toUpperCase() as Status
      if (!STATUSES.includes(status)) status = 'AMBER'
      const cited = !!findRule(playbook, String(f.playbookId ?? ''))
      // Never show an uncited RED: without a playbook rule behind it, cap at AMBER.
      const downgraded = !cited && status === 'RED'
      if (downgraded) status = 'AMBER'
      return {
        key: `cloud:${i}`,
        origin: 'cloud-review' as const,
        cited,
        downgraded,
        field: String(f.field ?? ''),
        status,
        title: String(f.title ?? 'Finding'),
        reason: String(f.reason ?? ''),
        askTheLandlord: String(f.askTheLandlord ?? ''),
        playbookId: cited ? String(f.playbookId) : 'none',
      }
    })
}

const baseField = (f: string) => f.replace(/\[\d+\]$/, '')

/**
 * Combines deterministic playbook findings with the cloud review. When the
 * cloud review cites the same rule for the same field, its wording is kept as
 * a note on the rule finding and the deterministic status wins.
 */
export function mergeFindings(ruleFindings: DisplayFinding[], cloud: DisplayFinding[]): DisplayFinding[] {
  const out = ruleFindings.map((f) => ({ ...f }))
  for (const c of cloud) {
    const match = out.find(
      (r) => r.origin === 'playbook-rule' && r.playbookId === c.playbookId && baseField(r.field) === baseField(c.field) && !r.cloudNote,
    )
    if (match) match.cloudNote = c.reason
    else out.push(c)
  }
  return out
}

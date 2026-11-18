import type { ImagePart, SourceLabel } from './types'

/**
 * Privacy receipt: one row per step of a run, built from what the code
 * actually passed to Firebase AI Logic. Sizes are the prompt size handed to
 * the SDK, not bytes on the wire.
 */
export interface ReceiptStep {
  step: 'extract' | 'rules' | 'check'
  requestedMode: 'PREFER_ON_DEVICE' | 'ONLY_IN_CLOUD' | 'none'
  ranOn: SourceLabel
  /** Exact result.response.inferenceSource string from the SDK, when a model ran. */
  sdkInferenceSource?: string
  ms: number
  sentToCloud: {
    kind: 'nothing' | 'approved-json' | 'lease-text-and-images'
    chars: number
    bytes: number
    imageCount: number
    imageBytes: number
  }
  /** The exact prompt string passed to the SDK (check step only). */
  payload?: string
}

const NOTHING = { kind: 'nothing' as const, chars: 0, bytes: 0, imageCount: 0, imageBytes: 0 }

export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length
}

/** Decoded size of a base64 inlineData part. */
export function imagePartBytes(p: ImagePart): number {
  const b64 = p.inlineData.data
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad)
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim()

export const LEASE_WINDOW = 40

/**
 * How many characters of the lease appear verbatim in a payload. Slides
 * 40-character windows over the whitespace-normalised lease text and counts
 * every lease character covered by a window found in the payload.
 */
export function leaseTextMatches(leaseText: string, payload: string, window = LEASE_WINDOW): { chars: number; phrases: string[] } {
  const L = normalise(leaseText)
  const P = normalise(payload)
  if (L.length < window || !P) return { chars: 0, phrases: [] }
  const covered = new Uint8Array(L.length)
  for (let i = 0; i + window <= L.length; i++) {
    if (P.includes(L.slice(i, i + window))) covered.fill(1, i, i + window)
  }
  let chars = 0
  const phrases: string[] = []
  let start = -1
  for (let i = 0; i <= L.length; i++) {
    if (i < L.length && covered[i]) {
      chars++
      if (start < 0) start = i
    } else if (start >= 0) {
      phrases.push(L.slice(start, i).trim())
      start = -1
    }
  }
  return { chars, phrases }
}

export function leaseTextSent(leaseText: string, payload: string): number {
  return leaseTextMatches(leaseText, payload).chars
}

export function extractStep(a: { ranOn: SourceLabel; raw?: string; ms: number; prompt: string; leaseText: string; images: ImagePart[] }): ReceiptStep {
  const cloud = a.ranOn === 'IN_CLOUD'
  return {
    step: 'extract',
    requestedMode: a.ranOn === 'FIXTURE' || a.ranOn === 'CACHED' ? 'none' : 'PREFER_ON_DEVICE',
    ranOn: a.ranOn,
    sdkInferenceSource: a.raw,
    ms: a.ms,
    sentToCloud: cloud
      ? {
          kind: 'lease-text-and-images',
          chars: normalise(a.leaseText).length,
          bytes: utf8Bytes(a.prompt),
          imageCount: a.images.length,
          imageBytes: a.images.reduce((s, p) => s + imagePartBytes(p), 0),
        }
      : NOTHING,
  }
}

export function rulesStep(ms: number): ReceiptStep {
  return { step: 'rules', requestedMode: 'none', ranOn: 'RULES_ONLY', ms, sentToCloud: NOTHING }
}

export function checkStep(a: { ranOn: SourceLabel; raw?: string; ms: number; prompt: string }): ReceiptStep {
  const sent = a.ranOn === 'IN_CLOUD'
  return {
    step: 'check',
    requestedMode: 'ONLY_IN_CLOUD',
    ranOn: a.ranOn,
    sdkInferenceSource: a.raw,
    ms: a.ms,
    sentToCloud: sent ? { kind: 'approved-json', chars: a.prompt.length, bytes: utf8Bytes(a.prompt), imageCount: 0, imageBytes: 0 } : NOTHING,
    payload: sent ? a.prompt : undefined,
  }
}

export interface Headline {
  text: string
  /** True only when the extract stayed on this device AND no lease wording reached the cloud. */
  zero: boolean
  phrases: string[]
}

/** The receipt headline. Never claims zero unless it is true. */
export function receiptHeadline(steps: ReceiptStep[], leaseText: string): Headline {
  const extract = [...steps].reverse().find((s) => s.step === 'extract')
  const check = [...steps].reverse().find((s) => s.step === 'check')
  if (extract && extract.sentToCloud.kind === 'lease-text-and-images') {
    const { chars, imageCount } = extract.sentToCloud
    const parts = [chars ? `${chars.toLocaleString('en')} characters` : null, imageCount ? `${imageCount} image${imageCount > 1 ? 's' : ''}` : null].filter(Boolean)
    return { text: `Lease text sent to cloud Gemini with your consent: ${parts.join(', ')}.`, zero: false, phrases: [] }
  }
  if (extract && extract.ranOn === 'CACHED') {
    return {
      text: 'No lease text of yours was sent in this run. This is the recorded result for the bundled sample lease; the live attempt did not return a result.',
      zero: false,
      phrases: [],
    }
  }
  const local = !!extract && (extract.ranOn === 'ON_DEVICE' || extract.ranOn === 'FIXTURE')
  const payload = check?.payload ?? ''
  const m = leaseTextMatches(leaseText, payload)
  if (local && m.chars === 0) return { text: '0 characters of lease text sent', zero: true, phrases: [] }
  if (local) {
    return {
      text: `The lease never left this device. The approved JSON you sent contains ${m.chars.toLocaleString('en')} characters that match lease wording, inside the summary fields you approved.`,
      zero: false,
      phrases: m.phrases,
    }
  }
  return { text: 'See each step below for what left this device.', zero: false, phrases: m.phrases }
}

export function receiptSummary(steps: ReceiptStep[], h: Headline): string {
  const row = (s: ReceiptStep) => `${s.step}: ${s.ranOn}${s.sentToCloud.kind === 'nothing' ? '' : ` (${s.sentToCloud.kind}, ${s.sentToCloud.bytes} bytes)`}`
  return `Privacy receipt. ${h.text}. ${steps.map(row).join('; ')}.`.replace(/\.\./g, '.')
}

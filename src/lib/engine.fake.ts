import type { AiEngine } from './engine'
import sample from '../fixtures/sample-extract.json'

/**
 * Test-only engine, compiled in only when Vite runs with `--mode e2e`.
 * Simulates a browser without Gemini Nano (like a Pixel 7) so the smoke test
 * can assert the consent gate, badges and the check payload. It records every
 * prompt it receives on window.__portiaCalls for the test to inspect.
 */
interface Call {
  kind: 'extract' | 'check'
  prompt: string
  imageCount: number
}

declare global {
  interface Window {
    __portiaCalls?: Call[]
    __portiaWarmAt?: number
  }
}

/** ?fakeCheck=fail -> every check throws a 429. slow -> first check takes 9 s. offline -> network TypeError. */
function checkMode(): string {
  return new URLSearchParams(location.search).get('fakeCheck') ?? 'ok'
}
let checkCount = 0

/**
 * ?fakeExtract=thin -> every extract is nearly empty. thinonce -> first extract thin, then full.
 * wild -> full but with drifting values (notice 270 days, missing fees), like a flaky live run.
 */
function extractMode(): string {
  return new URLSearchParams(location.search).get('fakeExtract') ?? 'ok'
}
let extractCount = 0

function record(c: Call) {
  window.__portiaCalls = [...(window.__portiaCalls ?? []), c]
}

export const fakeEngine: AiEngine = {
  kind: 'fake',
  async availability() {
    return 'unsupported'
  },
  async prepareDevice() {
    /* nothing to download */
  },
  async warmUp() {
    window.__portiaWarmAt = performance.now()
  },
  async willRunOnDevice() {
    return false
  },
  async extract(prompt, images) {
    record({ kind: 'extract', prompt, imageCount: images.length })
    await new Promise((r) => setTimeout(r, 150))
    const mode = extractMode()
    extractCount++
    if (mode === 'thin' || (mode === 'thinonce' && extractCount === 1)) {
      return { text: JSON.stringify({ rentAmount: 1850, currency: 'USD' }), source: 'IN_CLOUD' }
    }
    if (mode === 'wild') {
      const drift = extractCount % 2 === 0 ? 270 : 90
      return { text: JSON.stringify({ ...sample, noticePeriodDays: drift, mandatoryFees: sample.mandatoryFees.slice(0, 2 + (extractCount % 3)) }), source: 'IN_CLOUD' }
    }
    return { text: JSON.stringify(sample), source: 'IN_CLOUD' }
  },
  async check(prompt) {
    record({ kind: 'check', prompt, imageCount: 0 })
    const mode = checkMode()
    checkCount++
    if (mode === 'offline') {
      await new Promise((r) => setTimeout(r, 100))
      throw new TypeError('Failed to fetch')
    }
    if (mode === 'fail') {
      await new Promise((r) => setTimeout(r, 300))
      throw new Error('[GoogleGenerativeAI Error]: 429 RESOURCE_EXHAUSTED (fake)')
    }
    await new Promise((r) => setTimeout(r, mode === 'slow' && checkCount === 1 ? 9000 : 150))
    return {
      text: JSON.stringify([
        {
          field: 'lateFeeAmount',
          status: 'RED',
          title: 'Late fee is steep',
          reason: 'A 150 late fee on 1,850 rent is about 8%, plus daily charges.',
          askTheLandlord: 'Can the late fee be capped at 5% of rent?',
          playbookId: 'US-LATE-01',
        },
        {
          field: 'guestPolicy',
          status: 'RED',
          title: 'Strict guest limit',
          reason: 'Guests limited to 3 nights per month.',
          askTheLandlord: 'Can guests stay up to 14 nights?',
          playbookId: 'made-up-rule',
        },
      ]),
      source: 'IN_CLOUD',
    }
  },
}

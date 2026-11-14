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
  }
}

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
  async willRunOnDevice() {
    return false
  },
  async extract(prompt, images) {
    record({ kind: 'extract', prompt, imageCount: images.length })
    await new Promise((r) => setTimeout(r, 150))
    return { text: JSON.stringify(sample), source: 'IN_CLOUD' }
  },
  async check(prompt) {
    record({ kind: 'check', prompt, imageCount: 0 })
    await new Promise((r) => setTimeout(r, 150))
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

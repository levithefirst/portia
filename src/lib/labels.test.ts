import { describe, expect, it } from 'vitest'
import { RAW_SOURCE, sourceText } from './labels'
import { isNetworkError } from './network'
import type { SourceLabel } from './types'

const ALL: SourceLabel[] = ['ON_DEVICE', 'IN_CLOUD', 'FIXTURE', 'CACHED', 'RULES_ONLY']

describe('source labels', () => {
  it('RULES_ONLY never mentions Gemini or a model and never claims ON_DEVICE', () => {
    for (const step of ['Extract', 'Check'] as const) {
      const t = sourceText('RULES_ONLY', step)
      expect(t).not.toMatch(/gemini/i)
      expect(t).toBe('Offline: checked on this device')
    }
    expect(RAW_SOURCE.RULES_ONLY).not.toMatch(/on_device/)
  })

  it('only ON_DEVICE and IN_CLOUD carry an SDK inferenceSource value', () => {
    const sdk = ALL.filter((s) => /^(on_device|in_cloud)$/.test(RAW_SOURCE[s]))
    expect(sdk).toEqual(['ON_DEVICE', 'IN_CLOUD'])
  })

  it('no label contains an em dash', () => {
    for (const s of ALL) for (const step of ['Extract', 'Check'] as const) expect(sourceText(s, step, true)).not.toContain('—')
  })
})

describe('isNetworkError', () => {
  it('recognises offline failures', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('Error fetching from https://firebasevertexai.googleapis.com/v1beta/x: Failed to fetch'))).toBe(true)
    expect(isNetworkError(new Error('net::ERR_INTERNET_DISCONNECTED'))).toBe(true)
    expect(isNetworkError(new Error('AppCheck: Fetch failed (appCheck/fetch-network-error)'))).toBe(true)
  })
  it('does not treat model or quota errors as offline', () => {
    expect(isNetworkError(new Error('[GoogleGenerativeAI Error]: 429 RESOURCE_EXHAUSTED'))).toBe(false)
    expect(isNetworkError(new Error('The model returned text that is not valid JSON'))).toBe(false)
  })
})

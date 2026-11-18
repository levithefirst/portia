import { describe, expect, it } from 'vitest'
import { DEFAULT_CLOUD_MODEL, getConfig, playbookOutdated, sanitizeConfig } from './config'

describe('Remote Config validation', () => {
  it('missing values give the defaults', () => {
    expect(sanitizeConfig({})).toEqual({ cloudModel: DEFAULT_CLOUD_MODEL, judgeTimeoutMs: 8000, extractThinRetry: true, playbookMinVersion: '' })
    expect(getConfig().source).toBe('default')
  })

  it('only allowlisted models are accepted', () => {
    expect(sanitizeConfig({ cloud_model: 'gemini-3.8-flash' }).cloudModel).toBe('gemini-3.8-flash')
    expect(sanitizeConfig({ cloud_model: 'gemini-4-hydrogen' }).cloudModel).toBe(DEFAULT_CLOUD_MODEL)
    expect(sanitizeConfig({ cloud_model: 'gpt-x' }).cloudModel).toBe(DEFAULT_CLOUD_MODEL)
    expect(sanitizeConfig({ cloud_model: '' }).cloudModel).toBe(DEFAULT_CLOUD_MODEL)
  })

  it('judge timeout is clamped to 3000..20000 and invalid values fall back to 8000', () => {
    expect(sanitizeConfig({ judge_timeout_ms: '1000' }).judgeTimeoutMs).toBe(3000)
    expect(sanitizeConfig({ judge_timeout_ms: 99999 }).judgeTimeoutMs).toBe(20000)
    expect(sanitizeConfig({ judge_timeout_ms: '12000' }).judgeTimeoutMs).toBe(12000)
    expect(sanitizeConfig({ judge_timeout_ms: 'soon' }).judgeTimeoutMs).toBe(8000)
  })

  it('reads booleans and playbook versions defensively', () => {
    expect(sanitizeConfig({ extract_thin_retry: 'false' }).extractThinRetry).toBe(false)
    expect(sanitizeConfig({ extract_thin_retry: 'nonsense' }).extractThinRetry).toBe(true)
    expect(sanitizeConfig({ playbook_min_version: '2027-01' }).playbookMinVersion).toBe('2027-01')
    expect(sanitizeConfig({ playbook_min_version: 'latest' }).playbookMinVersion).toBe('')
  })

  it('flags an outdated bundled playbook only when a minimum is set', () => {
    expect(playbookOutdated('', ['2026-11'])).toBe(false)
    expect(playbookOutdated('2026-11', ['2026-11'])).toBe(false)
    expect(playbookOutdated('2027-01', ['2026-11'])).toBe(true)
  })
})

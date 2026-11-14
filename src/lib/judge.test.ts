import { describe, expect, it } from 'vitest'
import { cachedSampleVerdict, sampleVerdict, verdictTimeText } from './judge'
import { getPlaybook } from './playbooks'
import { runPlaybook } from './rules'
import sample from '../fixtures/sample-extract.json'
import type { LeaseExtract } from './types'

const pb = getPlaybook('us-typical')
const rules = runPlaybook(pb, sample as LeaseExtract)

describe('cached sample verdict', () => {
  it('without a recorded run, falls back to the in-browser rule findings only', () => {
    const original = { ...sampleVerdict }
    Object.assign(sampleVerdict, { recorded: false, rawText: '[]' })
    const v = cachedSampleVerdict(pb, rules)
    expect(v.hasRecordedCloud).toBe(false)
    expect(v.findings).toHaveLength(rules.length)
    Object.assign(sampleVerdict, original)
  })

  it('merges recorded cloud findings only for the playbook they were recorded with', () => {
    const original = { ...sampleVerdict }
    Object.assign(sampleVerdict, {
      recorded: true,
      playbookId: 'us-typical',
      rawText: JSON.stringify([{ field: 'guestPolicy', status: 'AMBER', title: 'Guest limit', reason: 'r', askTheLandlord: 'q', playbookId: 'none' }]),
    })
    expect(cachedSampleVerdict(pb, rules).hasRecordedCloud).toBe(true)
    expect(cachedSampleVerdict(pb, rules).findings).toHaveLength(rules.length + 1)
    expect(cachedSampleVerdict(getPlaybook('lagos'), runPlaybook(getPlaybook('lagos'), sample as LeaseExtract)).hasRecordedCloud).toBe(false)
    Object.assign(sampleVerdict, original)
  })
})

describe('verdict timing', () => {
  it('formats the core loop time', () => {
    expect(verdictTimeText(1200, 3000, 'ON_DEVICE', 'IN_CLOUD')).toBe('Verdict in 4.2s, on-device + cloud (extract 1.2s + check 3.0s)')
    expect(verdictTimeText(150, 8000, 'IN_CLOUD', 'CACHED')).toBe('Verdict in 8.2s, cloud + cached sample (extract 0.1s + check 8.0s)')
    expect(verdictTimeText(null, null, 'IN_CLOUD', null)).toBeNull()
  })
})

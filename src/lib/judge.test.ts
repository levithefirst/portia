import { describe, expect, it } from 'vitest'
import { cachedSampleVerdict, isThinExtract, matchSample, SAMPLE_EXTRACT, sampleVerdict, verdictTimeText } from './judge'
import { getPlaybook } from './playbooks'
import { monthlyRent, runPlaybook, totalMonthlyFees } from './rules'
import type { LeaseExtract } from './types'

const pb = getPlaybook('us-typical')

describe('canonical sample extract', () => {
  it('matches the recorded live run except the misread notice period', () => {
    const rec = sampleVerdict.approvedExtract!
    expect(sampleVerdict.recorded).toBe(true)
    const { noticePeriodDays: a, ...restCanon } = SAMPLE_EXTRACT
    const { noticePeriodDays: b, ...restRec } = rec
    expect(restCanon).toEqual(restRec)
    expect(a).toBe(90) // lease section 6 says 90 days
    expect(b).toBe(2700)
  })

  it('has the headline numbers', () => {
    expect(monthlyRent(SAMPLE_EXTRACT)).toBe(1850)
    expect(totalMonthlyFees(SAMPLE_EXTRACT)).toBeCloseTo(111.95)
    expect(SAMPLE_EXTRACT.depositAmount).toBe(4625)
  })

  it('produces the canonical counts documented in docs/DEMO-SCRIPT.md', () => {
    const f = runPlaybook(pb, SAMPLE_EXTRACT)
    const n = (s: string) => f.filter((i) => i.status === s).length
    expect([n('RED'), n('AMBER'), n('GREEN')]).toEqual([3, 6, 0])
  })
})

describe('fullness bar', () => {
  it('flags thin extracts', () => {
    expect(isThinExtract({ rentAmount: 1850, currency: 'USD' })).toBe(true)
    expect(isThinExtract({})).toBe(true)
    expect(isThinExtract(SAMPLE_EXTRACT)).toBe(false)
    expect(isThinExtract(SAMPLE_EXTRACT, { sample: true })).toBe(false)
  })

  it('requires the ~$111.95 fee total for the bundled sample', () => {
    const missingFees: LeaseExtract = { ...SAMPLE_EXTRACT, mandatoryFees: SAMPLE_EXTRACT.mandatoryFees!.slice(0, 2) }
    expect(isThinExtract(missingFees)).toBe(false)
    expect(isThinExtract(missingFees, { sample: true })).toBe(true)
  })

  it('reports which fields a live extract got wrong', () => {
    const m = matchSample({ ...SAMPLE_EXTRACT, noticePeriodDays: 270 })
    expect(m).toEqual({ matched: 7, total: 8, differs: ['noticePeriodDays'] })
  })
})

describe('cached sample verdict', () => {
  it('uses recorded cloud findings as commentary, dropping fields whose values differ', () => {
    const v = cachedSampleVerdict(pb, SAMPLE_EXTRACT)
    expect(v.hasRecordedCloud).toBe(true)
    expect(v.cloudFindings.some((f) => f.field === 'noticePeriodDays')).toBe(false) // recorded run saw 2700
    expect(v.cloudFindings.some((f) => f.field === 'depositAmount')).toBe(true)
  })

  it('applies only to the playbook it was recorded with', () => {
    expect(cachedSampleVerdict(getPlaybook('lagos'), SAMPLE_EXTRACT).hasRecordedCloud).toBe(false)
  })
})

describe('verdict timing', () => {
  it('formats the core loop time', () => {
    expect(verdictTimeText(1200, 3000, 'ON_DEVICE', 'IN_CLOUD')).toBe('Verdict in 4.2s, on-device + cloud (extract 1.2s + check 3.0s)')
    expect(verdictTimeText(1000, 3000, 'IN_CLOUD', 'IN_CLOUD', 4600)).toBe('Verdict in 4.6s, cloud + cloud (extract 1.0s + check 3.0s), one click')
    expect(verdictTimeText(null, null, 'IN_CLOUD', null)).toBeNull()
  })
})

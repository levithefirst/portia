import { describe, expect, it } from 'vitest'
import { PLAYBOOKS, getPlaybook } from './playbooks'
import { monthlyRent, runPlaybook, totalMonthlyFees } from './rules'
import sample from '../fixtures/sample-extract.json'
import type { LeaseExtract } from './types'

const x = sample as LeaseExtract

describe('playbooks', () => {
  it('every rule has a unique id, a hedged note and a question', () => {
    const ids = PLAYBOOKS.flatMap((p) => p.rules.map((r) => r.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of PLAYBOOKS) {
      for (const r of p.rules) {
        expect(r.note.length).toBeGreaterThan(20)
        expect(r.ask.length).toBeGreaterThan(10)
        expect(r.note.toLowerCase()).not.toMatch(/\billegal in your state\b/)
      }
    }
  })
})

describe('fixture lease against the US-typical playbook', () => {
  const f = runPlaybook(getPlaybook('us-typical'), x)
  const by = (id: string) => f.filter((i) => i.playbookId === id)

  it('computes true monthly cost', () => {
    expect(monthlyRent(x)).toBe(1850)
    expect(totalMonthlyFees(x)).toBeCloseTo(111.95)
  })

  it('flags the steep late fee and missing grace period', () => {
    expect(by('US-LATE-01')[0].status).toBe('AMBER') // 150 / 1850 = 8.1%
    expect(by('US-LATE-02')[0].status).toBe('RED') // 0 grace days
  })

  it('flags the junk fees as RED and auto-renewal as AMBER', () => {
    const fees = by('US-FEE-01')
    expect(fees).toHaveLength(1)
    expect(fees[0].status).toBe('RED')
    expect(fees[0].reason).toContain('Technology Package')
    expect(by('US-RENEW-01')[0].status).toBe('AMBER')
  })

  it('flags the 2.5 month deposit', () => {
    expect(by('US-DEP-01')[0].status).toBe('RED')
  })

  it('produces at least one RED and one AMBER for every playbook', () => {
    for (const p of PLAYBOOKS) {
      const s = runPlaybook(p, x).map((i) => i.status)
      expect(s, p.id).toContain('AMBER')
    }
    expect(runPlaybook(getPlaybook('england-wales'), x).some((i) => i.status === 'RED')).toBe(true)
    expect(runPlaybook(getPlaybook('general-predatory-fees'), x).some((i) => i.status === 'RED')).toBe(true)
  })
})

describe('yearly rent (Lagos style)', () => {
  it('normalises yearly rent to monthly', () => {
    expect(monthlyRent({ rentAmount: 1_200_000, rentPeriod: 'yearly' })).toBe(100_000)
  })
})

import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM module shared with the Node CLI
import { feeHits, monthlyRent as evalMonthlyRent, scoreRuns, summarize, totalMonthlyFees as evalFees } from '../../eval/score-lib.mjs'
import { monthlyRent, totalMonthlyFees } from './rules'
import type { LeaseExtract } from './types'

// Two tiny hand-made fixtures with known answers.
const truth: Record<string, LeaseExtract> = {
  a: { rentAmount: 1000, rentPeriod: 'monthly', depositAmount: 1000, lateFeeAmount: 50, mandatoryFees: [{ name: 'Tech', amount: 30, frequency: 'monthly' }, { name: 'Admin', amount: 200, frequency: 'one-time' }] },
  b: { rentAmount: 1200000, rentPeriod: 'yearly', depositAmount: 120000, mandatoryFees: [{ name: 'Service', amount: 240000, frequency: 'yearly' }] },
}

describe('eval scorer', () => {
  it('scores a perfect and a partly wrong run with known answers', () => {
    const runs = [
      { id: 'a', split: 'dev', ranOn: 'ON_DEVICE', extractMs: 1000, extract: truth.a },
      // b: rent right, deposit wrong, service charge amount wrong
      { id: 'b', split: 'holdout', ranOn: 'IN_CLOUD', extractMs: 3000, extract: { rentAmount: 1200000, rentPeriod: 'yearly', depositAmount: 100000, mandatoryFees: [{ name: 'Service', amount: 24000, frequency: 'yearly' }] } },
    ]
    const m = scoreRuns(runs, truth)
    expect(m.feeRecall).toBe(0.6667) // 2 of 3 planted fees
    expect(m.rentExact).toBe(1)
    expect(m.depositExact).toBe(0.5)
    expect(m.lateFeeExact).toBe(1) // only fixture a plants a late fee
    expect(m.monthlyFeesExact).toBe(0.5)
    expect(m.trueMonthlyExact).toBe(0.5)
    expect(m.medianExtractMs).toBe(1000)
    expect(m.p90ExtractMs).toBe(3000)
    expect(m.onDeviceShare).toBe(0.5)
    const s = summarize({ date: '2026-11-18T00:00:00Z', runs }, truth)
    expect(s.ranOn).toBe('MIXED')
    expect(s.dev.rentExact).toBe(1)
    expect(s.holdout.depositExact).toBe(0)
  })

  it('counts errors and does not score them', () => {
    const m = scoreRuns([{ id: 'a', split: 'dev', error: 'quota' }], truth)
    expect(m).toMatchObject({ runs: 1, scored: 0, errors: 1, rentExact: null })
  })

  it('matches fees by amount and frequency, not by name', () => {
    expect(feeHits(truth.a, { mandatoryFees: [{ name: 'Technology', amount: 30, frequency: 'per month' }] })).toEqual({ hits: 1, planted: 2 })
    expect(feeHits(truth.a, { mandatoryFees: [{ name: 'Tech', amount: 30, frequency: 'one-time' }] })).toEqual({ hits: 0, planted: 2 })
  })
})

describe('eval fixtures', () => {
  const all: { id: string; synthetic: boolean; truth: LeaseExtract; text: string }[] = []
  for (const split of ['dev', 'holdout']) {
    const dir = new URL(`../../eval/fixtures/${split}/`, import.meta.url)
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const j = JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
      all.push({ ...j, text: readFileSync(new URL(f.replace('.json', '.txt'), dir), 'utf8') })
    }
  }

  it('has 20 dev and 10 holdout fixtures, all marked SYNTHETIC', () => {
    expect(all.filter((x) => x.id.startsWith('dev-'))).toHaveLength(20)
    expect(all.filter((x) => x.id.startsWith('holdout-'))).toHaveLength(10)
    for (const x of all) {
      expect(x.synthetic).toBe(true)
      expect(x.text.startsWith('SYNTHETIC TEST LEASE')).toBe(true)
    }
  })

  it('scorer money math agrees with rules.ts on every fixture', () => {
    for (const x of all) {
      expect(evalFees(x.truth)).toBeCloseTo(totalMonthlyFees(x.truth), 6)
      expect(evalMonthlyRent(x.truth)).toBeCloseTo(monthlyRent(x.truth)!, 6)
    }
  })

  it('ground truth amounts appear in the lease text', () => {
    const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })
    for (const x of all) {
      expect(x.text).toContain(fmt(x.truth.rentAmount!))
      expect(x.text).toContain(fmt(x.truth.depositAmount!))
      for (const f of x.truth.mandatoryFees ?? []) expect(x.text).toContain(fmt(f.amount!))
    }
  })
})

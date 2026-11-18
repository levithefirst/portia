// Scoring for the Portia eval. Pure functions, unit-tested in src/lib/eval-score.test.ts.
// Money helpers mirror src/lib/rules.ts (monthlyFee / totalMonthlyFees / monthlyRent);
// the unit test checks they agree on every committed fixture.

const CENT = 0.01 + 1e-9

export function monthlyFee(amount, frequency) {
  if (typeof amount !== 'number') return 0
  const f = (frequency ?? 'monthly').toLowerCase()
  if (f.includes('one') || f.includes('once') || f.includes('move')) return 0
  if (f.includes('week')) return (amount * 52) / 12
  if (f.includes('year') || f.includes('annual')) return amount / 12
  if (f.includes('quarter')) return amount / 3
  return amount
}

export const totalMonthlyFees = (x) => (x?.mandatoryFees ?? []).reduce((s, f) => s + monthlyFee(f.amount, f.frequency), 0)

export function monthlyRent(x) {
  if (typeof x?.rentAmount !== 'number' || x.rentAmount <= 0) return undefined
  const p = (x.rentPeriod ?? 'monthly').toLowerCase()
  if (p.includes('week')) return (x.rentAmount * 52) / 12
  if (p.includes('year') || p.includes('annual') || p.includes('per annum')) return x.rentAmount / 12
  if (p.includes('quarter')) return x.rentAmount / 3
  return x.rentAmount
}

const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= CENT
const kind = (freq) => {
  const f = (freq ?? 'monthly').toLowerCase()
  return f.includes('one') || f.includes('once') || f.includes('move') ? 'one-time' : f.includes('year') || f.includes('annual') ? 'yearly' : 'monthly'
}

/** Required fees found: a planted fee counts when an extracted fee has the same amount (within 1 cent) and frequency kind. */
export function feeHits(truth, got) {
  const pool = [...(got?.mandatoryFees ?? [])]
  let hits = 0
  for (const f of truth.mandatoryFees ?? []) {
    const i = pool.findIndex((g) => near(g.amount, f.amount) && kind(g.frequency) === kind(f.frequency))
    if (i >= 0) {
      hits++
      pool.splice(i, 1)
    }
  }
  return { hits, planted: (truth.mandatoryFees ?? []).length }
}

export function percentile(xs, p) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))
  return s[i]
}

const rate = (num, den) => (den ? Math.round((num / den) * 10000) / 10000 : null)

/** Scores one set of runs. truthById maps fixture id -> ground truth (LeaseExtract shape). */
export function scoreRuns(runs, truthById) {
  let feeHit = 0, feePlanted = 0
  const field = { rent: [0, 0], deposit: [0, 0], lateFee: [0, 0], monthlyFees: [0, 0], trueMonthly: [0, 0] }
  const ms = []
  let onDevice = 0, inCloud = 0, scored = 0, errors = 0
  for (const r of runs) {
    const t = truthById[r.id]
    if (!t) continue
    if (r.error || !r.extract) {
      errors++
      continue
    }
    scored++
    const g = r.extract
    const fh = feeHits(t, g)
    feeHit += fh.hits
    feePlanted += fh.planted
    const cmp = (key, a, b) => {
      if (typeof a !== 'number') return
      field[key][1]++
      if (near(a, b)) field[key][0]++
    }
    cmp('rent', t.rentAmount, g.rentAmount)
    cmp('deposit', t.depositAmount, g.depositAmount)
    cmp('lateFee', t.lateFeeAmount, g.lateFeeAmount)
    cmp('monthlyFees', totalMonthlyFees(t), totalMonthlyFees(g))
    const tr = monthlyRent(t), gr = monthlyRent(g)
    if (tr !== undefined) {
      field.trueMonthly[1]++
      if (gr !== undefined && near(tr + totalMonthlyFees(t), gr + totalMonthlyFees(g))) field.trueMonthly[0]++
    }
    if (typeof r.extractMs === 'number') ms.push(r.extractMs)
    if (r.ranOn === 'ON_DEVICE') onDevice++
    else if (r.ranOn === 'IN_CLOUD') inCloud++
  }
  const total = onDevice + inCloud
  return {
    runs: runs.length,
    scored,
    errors,
    feeRecall: rate(feeHit, feePlanted),
    feesFound: feeHit,
    feesPlanted: feePlanted,
    rentExact: rate(...field.rent),
    depositExact: rate(...field.deposit),
    lateFeeExact: rate(...field.lateFee),
    monthlyFeesExact: rate(...field.monthlyFees),
    trueMonthlyExact: rate(...field.trueMonthly),
    medianExtractMs: percentile(ms, 50),
    p90ExtractMs: percentile(ms, 90),
    onDeviceShare: rate(onDevice, total),
    inCloudShare: rate(inCloud, total),
  }
}

export function summarize(results, truthById) {
  const runs = results.runs ?? []
  const ranOn = new Set(runs.filter((r) => r.ranOn).map((r) => r.ranOn))
  return {
    schema: 'portia-eval-summary/1',
    synthetic: true,
    date: results.date,
    machine: { chrome: results.chrome ?? null, note: results.machineNote ?? '' },
    model: results.model ?? null,
    ranOn: ranOn.size === 1 ? [...ranOn][0] : ranOn.size ? 'MIXED' : 'NONE',
    overall: scoreRuns(runs, truthById),
    dev: scoreRuns(runs.filter((r) => r.split === 'dev'), truthById),
    holdout: scoreRuns(runs.filter((r) => r.split === 'holdout'), truthById),
  }
}

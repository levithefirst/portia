import type { Playbook, PlaybookRule } from './playbooks'
import type { DisplayFinding, LeaseExtract, Status } from './types'

/**
 * Deterministic playbook checks that run locally in the browser on the
 * approved extract. They make results reproducible and keep the demo useful
 * even if the cloud review is unavailable.
 */

export function monthlyRent(x: LeaseExtract): number | undefined {
  if (typeof x.rentAmount !== 'number' || x.rentAmount <= 0) return undefined
  const p = (x.rentPeriod ?? 'monthly').toLowerCase()
  if (p.includes('week')) return (x.rentAmount * 52) / 12
  if (p.includes('year') || p.includes('annual') || p.includes('per annum')) return x.rentAmount / 12
  if (p.includes('quarter')) return x.rentAmount / 3
  return x.rentAmount
}

/** Normalises a fee to a monthly amount. One-time fees return 0. */
export function monthlyFee(amount: number | undefined, frequency: string | undefined): number {
  if (typeof amount !== 'number') return 0
  const f = (frequency ?? 'monthly').toLowerCase()
  if (f.includes('one') || f.includes('once') || f.includes('move')) return 0
  if (f.includes('week')) return (amount * 52) / 12
  if (f.includes('year') || f.includes('annual')) return amount / 12
  if (f.includes('quarter')) return amount / 3
  return amount
}

export function totalMonthlyFees(x: LeaseExtract): number {
  return (x.mandatoryFees ?? []).reduce((s, f) => s + monthlyFee(f.amount, f.frequency), 0)
}

export function oneTimeFees(x: LeaseExtract): number {
  return (x.mandatoryFees ?? []).reduce((s, f) => {
    const fr = (f.frequency ?? '').toLowerCase()
    const once = fr.includes('one') || fr.includes('once') || fr.includes('move')
    return once && typeof f.amount === 'number' ? s + f.amount : s
  }, 0)
}

const AT_SIGNING = /\b(at|upon|on|before) (lease )?signing\b|\b(due|payable|paid) (at|on|upon|before) move[- ]?in\b|\bmove[- ]?in (fee|charge|cost)s?\b|\bnon-?refundable (move[- ]?in|application|admin|administrative|processing|lease)/i
const CONDITIONAL = /\b(per (day|night|week|month|pet|occurrence|incident)|daily|weekly|monthly|if |when |unless|late|unauthori[sz]ed|optional|refundable deposit)\b/i

/**
 * Other money terms that the lease requires at signing (for example "a
 * non-refundable Administrative Processing Fee of $250.00 ... at signing").
 * Conditional or recurring charges (late fees, per-day fees, pet rent) never count.
 */
export function signingTerms(x: LeaseExtract): NonNullable<LeaseExtract['otherMoneyTerms']> {
  const onceNames = new Set((x.mandatoryFees ?? []).map((f) => (f.name ?? '').trim().toLowerCase()))
  return (x.otherMoneyTerms ?? []).filter((t) => {
    if (typeof t.amount !== 'number' || t.amount <= 0) return false
    if (onceNames.has((t.name ?? '').trim().toLowerCase())) return false
    const text = `${t.name ?? ''} ${t.notes ?? ''}`
    return AT_SIGNING.test(text) && !CONDITIONAL.test(text)
  })
}

export function signingTermsTotal(x: LeaseExtract): number {
  return signingTerms(x).reduce((s, t) => s + (t.amount ?? 0), 0)
}

/**
 * Due at signing: deposit + one-time required fees + other money terms the lease
 * requires at signing + the first month with required monthly fees.
 */
export function dueAtSigning(x: LeaseExtract): number | undefined {
  const rent = monthlyRent(x)
  if (!rent) return undefined
  return (x.depositAmount ?? 0) + oneTimeFees(x) + signingTermsTotal(x) + rent + totalMonthlyFees(x)
}

export function formatMoney(n: number | undefined, currency?: string): string {
  if (typeof n !== 'number' || Number.isNaN(n)) return 'n/a'
  const code = (currency ?? '').toUpperCase()
  try {
    if (/^[A-Z]{3}$/.test(code)) {
      return new Intl.NumberFormat('en', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(n)
    }
  } catch {
    /* fall through */
  }
  // No currency in the extract: show a plain amount with two decimals, and let the UI label it.
  return n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** True when the extract has a usable ISO 4217 currency code. */
export function hasCurrency(x: LeaseExtract): boolean {
  return /^[A-Z]{3}$/.test((x.currency ?? '').toUpperCase())
}

export const NO_CURRENCY_NOTE = 'No currency found in the lease, so amounts are shown as plain numbers. Add the currency code in the Currency field.'

function fieldText(x: LeaseExtract, field: string): string {
  const v = (x as Record<string, unknown>)[field]
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((i) => Object.values(i as object).join(' ')).join(' ; ')
  return String(v)
}

function mk(
  rule: PlaybookRule,
  status: Status,
  reason: string,
  suffix = '',
  field = rule.field,
  title = rule.title,
): DisplayFinding {
  return {
    key: `rule:${rule.id}${suffix}`,
    origin: 'playbook-rule',
    cited: true,
    field,
    status,
    title: status === 'GREEN' && rule.green ? rule.green : title,
    reason,
    askTheLandlord: rule.ask,
    playbookId: rule.id,
  }
}

const pct = (n: number) => `${Math.round(n * 10) / 10}%`

export function evaluateRule(rule: PlaybookRule, x: LeaseExtract): DisplayFinding[] {
  const c = rule.check
  const rent = monthlyRent(x)
  const cur = x.currency
  switch (c.type) {
    case 'lateFeePct': {
      if (typeof x.lateFeeAmount !== 'number' || !rent) return []
      const p = (x.lateFeeAmount / rent) * 100
      const status: Status = p > c.red ? 'RED' : p > c.amber ? 'AMBER' : 'GREEN'
      return [mk(rule, status, `Late fee of ${formatMoney(x.lateFeeAmount, cur)} is ${pct(p)} of monthly rent (${formatMoney(rent, cur)}). ${rule.note}`)]
    }
    case 'graceDays': {
      if (typeof x.lateFeeGraceDays !== 'number') {
        if (typeof x.lateFeeAmount !== 'number') return []
        return [mk(rule, 'AMBER', `A late fee is stated but no grace period was found. ${rule.note}`)]
      }
      const d = x.lateFeeGraceDays
      const status: Status =
        c.redBelow !== undefined && d < c.redBelow ? 'RED' : d < c.amberBelow ? 'AMBER' : 'GREEN'
      return [mk(rule, status, `Grace period: ${d} day${d === 1 ? '' : 's'}. ${rule.note}`)]
    }
    case 'depositMonths': {
      if (typeof x.depositAmount !== 'number' || !rent) return []
      const m = x.depositAmount / rent
      const status: Status = m > c.red ? 'RED' : m > c.amber ? 'AMBER' : 'GREEN'
      return [mk(rule, status, `Deposit of ${formatMoney(x.depositAmount, cur)} is about ${Math.round(m * 10) / 10} months of rent. ${rule.note}`)]
    }
    case 'depositWeeks': {
      if (typeof x.depositAmount !== 'number' || !rent) return []
      const weekly = (rent * 12) / 52
      const w = x.depositAmount / weekly
      const status: Status = w > c.red + 0.05 ? 'RED' : 'GREEN'
      return [mk(rule, status, `Deposit of ${formatMoney(x.depositAmount, cur)} is about ${Math.round(w * 10) / 10} weeks of rent. ${rule.note}`)]
    }
    case 'mandatoryFees': {
      const fees = x.mandatoryFees ?? []
      if (!fees.length) return []
      const flagged = fees.filter((f) => c.keywords?.some((k) => (f.name ?? '').toLowerCase().includes(k)))
      const status = flagged.length && c.keywordStatus ? c.keywordStatus : c.status
      const describe = (f: (typeof fees)[number]) =>
        `${f.name}${typeof f.amount === 'number' ? ` ${formatMoney(f.amount, cur)}` : ''}${f.frequency ? ` (${f.frequency})` : ''}`
      const lead = flagged.length
        ? `${flagged.length} of ${fees.length} required fees match common junk-fee patterns: ${flagged.map(describe).join('; ')}.`
        : `${fees.length} required fee${fees.length > 1 ? 's' : ''} on top of rent: ${fees.map(describe).join('; ')}.`
      const others = flagged.length && flagged.length < fees.length ? ` Also required: ${fees.filter((f) => !flagged.includes(f)).map(describe).join('; ')}.` : ''
      return [mk(rule, status, `${lead}${others} ${rule.note}`, '', 'mandatoryFees', `${rule.title} (${fees.length})`)]
    }
    case 'feesPctOfRent': {
      const total = totalMonthlyFees(x)
      if (!rent || total <= 0) return []
      const p = (total / rent) * 100
      const status: Status = p > c.red ? 'RED' : p > c.amber ? 'AMBER' : 'GREEN'
      return [
        mk(
          rule,
          status,
          `Required recurring fees add ${formatMoney(total, cur)} a month (${pct(p)} of rent), so the true monthly cost is about ${formatMoney(rent + total, cur)}. ${rule.note}`,
        ),
      ]
    }
    case 'autoRenewal': {
      if (x.autoRenewal === 'yes') return [mk(rule, c.yes, `The agreement renews automatically. ${rule.note}`)]
      if (x.autoRenewal === 'unclear') return [mk(rule, c.unclear, `It is unclear whether the agreement renews automatically. ${rule.note}`)]
      if (x.autoRenewal === 'no') return [mk(rule, 'GREEN', 'The agreement does not appear to renew automatically.')]
      return []
    }
    case 'noticeDays': {
      if (typeof x.noticePeriodDays !== 'number') return []
      const d = x.noticePeriodDays
      const status: Status =
        c.redAbove !== undefined && d > c.redAbove ? 'RED' : d > c.amberAbove ? 'AMBER' : 'GREEN'
      return [mk(rule, status, `Notice period: ${d} days. ${rule.note}`)]
    }
    case 'textPresent': {
      const t = fieldText(x, rule.field).trim()
      if (!t) return []
      return [mk(rule, c.status, `"${t}". ${rule.note}`)]
    }
    case 'textMatches': {
      for (const f of c.fields) {
        const t = fieldText(x, f)
        const low = t.toLowerCase()
        const p = c.patterns.find((pat) => low.includes(pat))
        if (p) return [mk(rule, c.status, `Mentions "${p}" in ${f}. ${rule.note}`, '', f)]
      }
      return []
    }
  }
}

export function runPlaybook(playbook: Playbook, x: LeaseExtract): DisplayFinding[] {
  return playbook.rules.flatMap((r) => evaluateRule(r, x))
}

const RANK: Record<Status, number> = { RED: 0, AMBER: 1, GREEN: 2 }

export function sortFindings(list: DisplayFinding[]): DisplayFinding[] {
  return [...list].sort((a, b) => RANK[a.status] - RANK[b.status])
}

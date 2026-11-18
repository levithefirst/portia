import { dueAtSigning, formatMoney, monthlyRent, totalMonthlyFees } from './rules'
import type { LeaseExtract } from './types'

/**
 * Plain-text message with the landlord questions. No lease text and no names:
 * only the questions and the cost math from the in-browser rules.
 */
export const SHARE_SUBJECT = 'Questions about the lease before I sign'
export const MAX_SHARE_QUESTIONS = 9
export const MAX_ENCODED_BODY = 1800
export const MORE_NOTE = '(more questions in the attached printout)'

export function costLine(x: LeaseExtract): string | null {
  const rent = monthlyRent(x)
  if (!rent) return null
  const fees = totalMonthlyFees(x)
  const c = x.currency
  return `Monthly cost as I read the lease: rent ${formatMoney(rent, c)} + required fees ${formatMoney(fees, c)} = ${formatMoney(rent + fees, c)}. Due at signing: ${formatMoney(dueAtSigning(x), c)}.`
}

export function shareText(questions: string[], x: LeaseExtract, opts: { limit?: number; trimmed?: boolean } = {}): string {
  const limit = Math.min(opts.limit ?? MAX_SHARE_QUESTIONS, MAX_SHARE_QUESTIONS)
  const list = questions.slice(0, limit)
  const more = opts.trimmed || questions.length > list.length
  const lines = ['Hello,', '', 'Before I sign the lease, could you help me with a few questions?', '']
  list.forEach((q, i) => lines.push(`${i + 1}. ${q}`))
  if (more) lines.push(MORE_NOTE)
  const cost = costLine(x)
  if (cost) lines.push('', cost)
  lines.push('', 'Thank you.')
  return lines.join('\n')
}

/** mailto: with no recipient; the encoded body is kept under 1,800 characters by trimming questions. */
export function mailtoHref(questions: string[], x: LeaseExtract): string {
  let limit = Math.min(questions.length, MAX_SHARE_QUESTIONS)
  let body = shareText(questions, x, { limit })
  while (encodeURIComponent(body).length >= MAX_ENCODED_BODY && limit > 0) {
    limit--
    body = shareText(questions, x, { limit, trimmed: true })
  }
  return `mailto:?subject=${encodeURIComponent(SHARE_SUBJECT)}&body=${encodeURIComponent(body)}`
}

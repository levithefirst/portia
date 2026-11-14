import type { LeaseExtract } from './types'
import type { Playbook } from './playbooks'

/** Rough token estimate (about 4 characters per token for English). Used only for warnings. */
export function estimateTokens(text: string, imageCount: number): number {
  // Per-image cost on Gemini Nano is not documented by Firebase; 1,000 is a conservative placeholder.
  return Math.ceil(text.length / 4) + imageCount * 1000
}

/** Documented on-device input budget the brief asks Portia to respect. See docs/SDK-NOTES.md. */
export const ON_DEVICE_TOKEN_BUDGET = 9216
export const MAX_IMAGES_PER_EXTRACT = 3
export const HUGE_PASTE_CHARS = 40_000

const EXTRACT_INSTRUCTIONS = `You extract a structured map of money terms and obligations from a residential or consumer rental agreement (lease, tenancy agreement, storage or similar).
Rules:
- Only record what the document actually says. If a field is not stated, leave it out. Never guess.
- Numbers only for amounts (no currency symbols or commas). Put the currency code in "currency" (USD, GBP, NGN, EUR...).
- rentAmount is the base rent for one rentPeriod (monthly, weekly, yearly...).
- lateFeeAmount is the first late charge. Mention any daily or extra late charges in otherMoneyTerms.
- lateFeeGraceDays is how many days after the due date before a late fee applies. Use 0 if the fee applies immediately.
- mandatoryFees are charges the tenant must pay on top of rent whether or not they use anything (amenity, technology, admin, processing, trash, pest, utility billing, required insurance or parking, and similar). Give name, amount and frequency (monthly, one-time, yearly).
- otherMoneyTerms are other money terms: per-day charges, penalties, optional fees, advance rent, agency or legal fees, insurance requirements.
- noticePeriodDays is the notice the tenant must give to leave or to stop renewal, in days (convert months to days using 30 per month).
- autoRenewal: "yes" if the agreement renews or rolls over automatically, "no" if it clearly ends, "unclear" otherwise.
- guestPolicy, maintenanceResponsibility, earlyTerminationPenalty: one short sentence each, in plain words.
- rawNotes: at most 3 short sentences about anything else unusual. Do not copy long passages.
Return only JSON that matches the schema.`

export function buildExtractPrompt(leaseText: string, imageCount: number): string {
  const parts = [EXTRACT_INSTRUCTIONS]
  if (imageCount > 0) {
    parts.push(
      `The agreement is provided as ${imageCount} page image${imageCount > 1 ? 's' : ''}, in page order.`,
    )
  }
  if (leaseText.trim()) {
    parts.push(`AGREEMENT TEXT:\n<<<\n${leaseText.trim()}\n>>>`)
  }
  return parts.join('\n\n')
}

/**
 * The check prompt contains only: instructions, the public static playbook
 * rules, and the user-approved extract JSON. It never contains the lease text
 * or images. pipeline.test.ts asserts this.
 */
export function buildCheckPrompt(approved: LeaseExtract, playbook: Playbook, unsureFields: string[]): string {
  const rules = playbook.rules.map((r) => ({ id: r.id, field: r.field, title: r.title, note: r.note }))
  return `You review a structured summary of a rental agreement for a prospective tenant. You do NOT have the agreement itself, only the JSON below, which the tenant reviewed and approved.

Playbook: ${playbook.id} (${playbook.name}; ${playbook.jurisdiction}).
Playbook rules (static, curated, not legal advice):
${JSON.stringify(rules)}

Approved extract JSON:
${JSON.stringify(approved)}

Fields the tenant marked "not sure": ${JSON.stringify(unsureFields)}

Return a JSON array of findings, one per relevant field, at most 12.
- status: RED = likely problem worth pushing back on before signing; AMBER = unusual, unclear or worth asking about; GREEN = looks typical.
- playbookId: the id of the playbook rule that supports the finding, or "none" if no rule applies. Only use RED when a playbook rule supports it.
- title: under 10 words. reason: 1-2 sentences tied to the numbers in the JSON.
- Use hedged language ("may", "in many places", "worth confirming"). Never state that something is illegal or unenforceable as fact. This is not legal advice.
- askTheLandlord: one concrete, polite question the tenant can send.
- If a field is missing or marked "not sure", say what to confirm instead of assuming.`
}

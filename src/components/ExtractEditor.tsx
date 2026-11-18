import { useState, type ReactNode } from 'react'
import { cleanExtract } from '../lib/pipeline'
import { formatMoney, monthlyRent, totalMonthlyFees, dueAtSigning } from '../lib/rules'
import type { LeaseExtract, MandatoryFee, OtherMoneyTerm, ScalarField, SourceLabel } from '../lib/types'
import { SourceBadge } from './Badges'
import { IconPlus, IconX } from './icons'

interface Props {
  value: LeaseExtract
  onChange: (x: LeaseExtract) => void
  unsure: string[]
  onUnsure: (fields: string[]) => void
  source: SourceLabel
  playbookId: string
  cloudReviewAvailable: boolean
  busy: boolean
  onApprove: () => void
  onBack: () => void
  onAddBatch: () => void
  canAddBatch: boolean
  /** Below the fullness bar (see isThinExtract). Approve is blocked unless the user edited by hand. */
  thin: boolean
  editedByHand: boolean
  nanoMissing: boolean
  /** Label shown when Judge Mode pinned the bundled sample values. */
  pinNote: ReactNode
}

export const THIN_MESSAGE = 'This extract is missing too many fields to check. Fill them in, or go back and extract again.'

const LABELS: Record<string, string> = {
  currency: 'Currency',
  rentAmount: 'Rent amount',
  rentPeriod: 'Rent period',
  depositAmount: 'Security deposit',
  lateFeeAmount: 'Late fee',
  lateFeeGraceDays: 'Grace days before late fee',
  noticePeriodDays: 'Notice to leave or not renew (days)',
  autoRenewal: 'Renews automatically?',
  guestPolicy: 'Guest policy',
  maintenanceResponsibility: 'Repairs and maintenance',
  earlyTerminationPenalty: 'Early termination penalty',
  rawNotes: 'Other notes',
  mandatoryFees: 'Mandatory fees',
  otherMoneyTerms: 'Other money terms',
}

function isEmpty(v: unknown) {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

export function ExtractEditor(p: Props) {
  const x = p.value
  const [showFields, setShowFields] = useState(p.thin)
  const set = (k: ScalarField, v: unknown) => p.onChange({ ...x, [k]: v === '' ? undefined : v })
  const setNum = (k: ScalarField, raw: string) => set(k, raw === '' ? undefined : Number(raw))
  const toggleUnsure = (f: string) => p.onUnsure(p.unsure.includes(f) ? p.unsure.filter((u) => u !== f) : [...p.unsure, f])

  const flagged = (f: string) => isEmpty((x as Record<string, unknown>)[f]) || p.unsure.includes(f)
  const missingCount = Object.keys(LABELS).filter((f) => isEmpty((x as Record<string, unknown>)[f])).length

  function row(f: string, children: ReactNode, wide?: boolean) {
    const empty = isEmpty((x as Record<string, unknown>)[f])
    const unsure = p.unsure.includes(f)
    return (
      <div key={f} className={wide ? 'sm:col-span-2' : ''} data-field={f}>
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={`f-${f}`} className="label">
            {LABELS[f]}
          </label>
          <label className="inline-flex items-center gap-1 text-xs text-text-secondary">
            <input type="checkbox" checked={unsure} onChange={() => toggleUnsure(f)} />
            I'm not sure
          </label>
        </div>
        {children}
        {(empty || unsure) && (
          <p className="mt-1 text-xs text-amber-text" id={`f-${f}-note`}>
            {unsure ? 'Marked not sure. The check will ask you to confirm this.' : 'Not found. Check the lease and fill it in if it is there.'}
          </p>
        )}
      </div>
    )
  }

  const fieldProps = (f: string) => ({
    id: `f-${f}`,
    className: `field ${flagged(f) ? 'unclear' : ''}`,
    'aria-describedby': flagged(f) ? `f-${f}-note` : undefined,
  })

  const rent = monthlyRent(x)
  const recurring = totalMonthlyFees(x)
  const payload = { playbookId: p.playbookId, approvedExtract: cleanExtract(x) }

  function updateFee(i: number, patch: Partial<MandatoryFee>) {
    const list = [...(x.mandatoryFees ?? [])]
    list[i] = { ...list[i], ...patch }
    p.onChange({ ...x, mandatoryFees: list })
  }
  function updateOther(i: number, patch: Partial<OtherMoneyTerm>) {
    const list = [...(x.otherMoneyTerms ?? [])]
    list[i] = { ...list[i], ...patch }
    p.onChange({ ...x, otherMoneyTerms: list })
  }

  const filledCount = Object.keys(LABELS).filter((f) => !isEmpty((x as Record<string, unknown>)[f])).length
  const approveBlocked = p.thin && !p.editedByHand

  const header = (
    <div className="paper p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2 id="review-title" className="font-serif text-2xl font-medium">
              Review the fee and obligation map
            </h2>
            <p className="hint mt-1 max-w-2xl">
              Fix anything the model got wrong. Amber fields were not found or are marked "not sure". When you approve, only this
              JSON is sent for review: no lease text, no photos.
            </p>
          </div>
          <SourceBadge source={p.source} step="Extract" nanoMissing={p.nanoMissing} />
        </div>
        {p.pinNote && (
          <div className="mt-3 rounded-lg border border-border bg-bg px-3 py-2 text-sm" data-testid="pin-note">
            {p.pinNote}
          </div>
        )}
        {p.thin ? (
          <p className="mt-4 rounded-lg border border-amber-solid bg-amber-bg px-3 py-2 text-sm text-amber-text" role="alert" data-testid="thin-warning">
            {THIN_MESSAGE}
            {p.editedByHand && ' You have edited fields by hand, so you can approve anyway.'}
          </p>
        ) : (
          <p className="mt-3 text-sm" data-testid="field-summary">
            <strong>{filledCount} fields extracted</strong>, {p.unsure.length} marked not sure
            {missingCount > 0 ? `, ${missingCount} empty` : ''}.
          </p>
        )}
    </div>
  )

  const form = (
      <div className="paper p-5 sm:p-6" data-testid="field-form">

        <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          {row(
            'rentAmount',
            <input type="number" inputMode="decimal" min={0} step="any" {...fieldProps('rentAmount')} value={x.rentAmount ?? ''} onChange={(e) => setNum('rentAmount', e.target.value)} />,
          )}
          {row(
            'rentPeriod',
            <input type="text" {...fieldProps('rentPeriod')} value={x.rentPeriod ?? ''} onChange={(e) => set('rentPeriod', e.target.value)} placeholder="monthly" />,
          )}
          {row(
            'currency',
            <input type="text" {...fieldProps('currency')} value={x.currency ?? ''} onChange={(e) => set('currency', e.target.value.toUpperCase())} placeholder="USD" maxLength={3} />,
          )}
          {row(
            'depositAmount',
            <input type="number" inputMode="decimal" min={0} step="any" {...fieldProps('depositAmount')} value={x.depositAmount ?? ''} onChange={(e) => setNum('depositAmount', e.target.value)} />,
          )}
          {row(
            'lateFeeAmount',
            <input type="number" inputMode="decimal" min={0} step="any" {...fieldProps('lateFeeAmount')} value={x.lateFeeAmount ?? ''} onChange={(e) => setNum('lateFeeAmount', e.target.value)} />,
          )}
          {row(
            'lateFeeGraceDays',
            <input type="number" inputMode="numeric" min={0} step={1} {...fieldProps('lateFeeGraceDays')} value={x.lateFeeGraceDays ?? ''} onChange={(e) => setNum('lateFeeGraceDays', e.target.value)} />,
          )}
          {row(
            'noticePeriodDays',
            <input type="number" inputMode="numeric" min={0} step={1} {...fieldProps('noticePeriodDays')} value={x.noticePeriodDays ?? ''} onChange={(e) => setNum('noticePeriodDays', e.target.value)} />,
          )}
          {row(
            'autoRenewal',
            <select {...fieldProps('autoRenewal')} value={x.autoRenewal ?? ''} onChange={(e) => set('autoRenewal', e.target.value)}>
              <option value="">Not stated</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="unclear">Unclear</option>
            </select>,
          )}
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="label text-[0.9rem]">Mandatory fees on top of rent</h3>
            <label className="inline-flex items-center gap-1 text-xs text-text-secondary">
              <input type="checkbox" checked={p.unsure.includes('mandatoryFees')} onChange={() => toggleUnsure('mandatoryFees')} />
              I'm not sure
            </label>
          </div>
          <FeeTable
            rows={x.mandatoryFees ?? []}
            third="frequency"
            thirdLabel="Frequency"
            onEdit={updateFee}
            onRemove={(i) => p.onChange({ ...x, mandatoryFees: (x.mandatoryFees ?? []).filter((_, j) => j !== i) })}
            onAdd={() => p.onChange({ ...x, mandatoryFees: [...(x.mandatoryFees ?? []), { name: '', frequency: 'monthly' }] })}
            addLabel="Add fee"
            group="fee"
          />
        </div>

        <div className="mt-6 grid gap-x-5 gap-y-4 sm:grid-cols-2">
          {row(
            'earlyTerminationPenalty',
            <textarea rows={2} {...fieldProps('earlyTerminationPenalty')} value={x.earlyTerminationPenalty ?? ''} onChange={(e) => set('earlyTerminationPenalty', e.target.value)} />,
          )}
          {row(
            'maintenanceResponsibility',
            <textarea rows={2} {...fieldProps('maintenanceResponsibility')} value={x.maintenanceResponsibility ?? ''} onChange={(e) => set('maintenanceResponsibility', e.target.value)} />,
          )}
          {row(
            'guestPolicy',
            <textarea rows={2} {...fieldProps('guestPolicy')} value={x.guestPolicy ?? ''} onChange={(e) => set('guestPolicy', e.target.value)} />,
          )}
          {row(
            'rawNotes',
            <textarea rows={2} {...fieldProps('rawNotes')} value={x.rawNotes ?? ''} onChange={(e) => set('rawNotes', e.target.value)} />,
          )}
        </div>

        <div className="mt-6">
          <h3 className="label text-[0.9rem]">Other money terms</h3>
          <FeeTable
            rows={x.otherMoneyTerms ?? []}
            third="notes"
            thirdLabel="Notes"
            onEdit={updateOther}
            onRemove={(i) => p.onChange({ ...x, otherMoneyTerms: (x.otherMoneyTerms ?? []).filter((_, j) => j !== i) })}
            onAdd={() => p.onChange({ ...x, otherMoneyTerms: [...(x.otherMoneyTerms ?? []), { name: '' }] })}
            addLabel="Add term"
            group="other"
          />
        </div>
      </div>
  )

  const costPanel = (
        <div className="paper p-5" data-testid="cost-panel">
          <p className="eyebrow">What it really costs</p>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Rent per month</dt>
              <dd className="font-mono">{formatMoney(rent, x.currency)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-text-secondary">Required fees per month</dt>
              <dd className="font-mono">{formatMoney(recurring, x.currency)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border-subtle pt-2 font-semibold">
              <dt>True monthly cost</dt>
              <dd className="font-mono" data-testid="true-monthly">
                {rent ? formatMoney(rent + recurring, x.currency) : 'n/a'}
              </dd>
            </div>
            <div className="flex justify-between gap-3 pt-2">
              <dt className="text-text-secondary">Due at signing (deposit + first month with required fees)</dt>
              <dd className="font-mono" data-testid="due-at-signing">{rent ? formatMoney(dueAtSigning(x), x.currency) : 'n/a'}</dd>
            </div>
          </dl>
        </div>
  )

  const payloadPreview = (
        <details className="paper p-5" data-testid="payload-preview">
          <summary className="cursor-pointer text-sm font-semibold">Exactly what "Approve &amp; check" sends to the cloud</summary>
          <p className="hint mt-2">
            The approved JSON below, the selected playbook's public rules, and instructions. Never the lease text or photos.
          </p>
          <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-border-subtle bg-bg p-3 font-mono text-[0.72rem] leading-relaxed">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </details>
  )

  const actionsBar = (
      <div className="no-print flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={p.onApprove} disabled={p.busy || approveBlocked} data-testid="approve" aria-describedby={approveBlocked ? 'thin-msg' : undefined}>
          {p.busy ? 'Checking…' : p.cloudReviewAvailable ? 'Approve & check' : 'Approve & run playbook checks'}
        </button>
        <button type="button" className="btn" onClick={p.onBack} disabled={p.busy}>
          Back to the document
        </button>
        {p.canAddBatch && (
          <button type="button" className="btn btn-ghost" onClick={p.onAddBatch} disabled={p.busy}>
            Add another batch
          </button>
        )}
        {approveBlocked && (
          <p id="thin-msg" className="w-full text-sm text-amber-text">
            {THIN_MESSAGE}
          </p>
        )}
        {!p.cloudReviewAvailable && (
          <p className="hint">Cloud review is not configured in this build. Playbook rules still run in your browser.</p>
        )}
      </div>
  )

  return (
    <section aria-labelledby="review-title" className="space-y-5">
      {header}
      {p.thin ? (
        <>
          {form}
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            {costPanel}
            {payloadPreview}
          </div>
          {actionsBar}
        </>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr] lg:items-start">
            {costPanel}
            <div className="space-y-4">
              {actionsBar}
              {payloadPreview}
            </div>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-ghost text-sm"
              aria-expanded={showFields}
              aria-controls="all-fields"
              onClick={() => setShowFields((v) => !v)}
              data-testid="toggle-fields"
            >
              {showFields ? 'Hide extracted fields' : `Show and edit all ${filledCount} extracted fields`}
            </button>
            <div id="all-fields" hidden={!showFields} className="mt-3">
              {form}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

interface FeeTableProps<T> {
  rows: T[]
  third: 'frequency' | 'notes'
  thirdLabel: string
  onEdit: (i: number, patch: Partial<T>) => void
  onRemove: (i: number) => void
  onAdd: () => void
  addLabel: string
  group: string
}

function FeeTable<T extends { name: string; amount?: number; frequency?: string; notes?: string }>(p: FeeTableProps<T>) {
  return (
    <div className="mt-2">
      {p.rows.length === 0 && <p className="field unclear text-sm text-amber-text">None found. Add any you can see in the lease.</p>}
      <ul className="space-y-2">
        {p.rows.map((r, i) => (
          <li key={i} className="grid grid-cols-[1fr_7rem_2.25rem] gap-2 sm:grid-cols-[1.5fr_8rem_1fr_2.25rem]">
            <input
              type="text"
              className={`field ${!r.name ? 'unclear' : ''}`}
              aria-label={`${p.group === 'fee' ? 'Fee' : 'Term'} ${i + 1} name`}
              value={r.name}
              onChange={(e) => p.onEdit(i, { name: e.target.value } as Partial<T>)}
            />
            <input
              type="number"
              inputMode="decimal"
              step="any"
              className={`field font-mono ${r.amount === undefined && p.group === 'fee' ? 'unclear' : ''}`}
              aria-label={`${p.group === 'fee' ? 'Fee' : 'Term'} ${i + 1} amount`}
              value={r.amount ?? ''}
              onChange={(e) => p.onEdit(i, { amount: e.target.value === '' ? undefined : Number(e.target.value) } as Partial<T>)}
            />
            <input
              type="text"
              className="field col-span-2 sm:col-span-1 order-last sm:order-none"
              aria-label={`${p.group === 'fee' ? 'Fee' : 'Term'} ${i + 1} ${p.thirdLabel.toLowerCase()}`}
              value={(r[p.third] as string | undefined) ?? ''}
              onChange={(e) => p.onEdit(i, { [p.third]: e.target.value } as Partial<T>)}
            />
            <button type="button" className="btn btn-ghost p-2" onClick={() => p.onRemove(i)} aria-label={`Remove ${r.name || `row ${i + 1}`}`}>
              <IconX />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-ghost mt-2 text-sm" onClick={p.onAdd}>
        <IconPlus /> {p.addLabel}
      </button>
    </div>
  )
}

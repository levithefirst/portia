import { Schema } from 'firebase/ai'

/**
 * Response schemas, written with the Schema helpers exactly as the official
 * hybrid structured-output page shows (Schema.object + optionalProperties,
 * Schema.array({ items })). The same object is passed to the cloud model as
 * generationConfig.responseSchema and to the on-device model as
 * onDeviceParams.promptOptions.responseConstraint.
 *
 * autoRenewal: Schema.boolean exists in firebase@13.3.0, but Portia uses an
 * enum (yes / no / unclear) on purpose so the model can say "unclear" instead
 * of guessing a boolean. See docs/SDK-NOTES.md.
 */

const LEASE_FIELDS = [
  'currency',
  'rentAmount',
  'rentPeriod',
  'depositAmount',
  'lateFeeAmount',
  'lateFeeGraceDays',
  'mandatoryFees',
  'noticePeriodDays',
  'autoRenewal',
  'guestPolicy',
  'maintenanceResponsibility',
  'earlyTerminationPenalty',
  'otherMoneyTerms',
  'rawNotes',
]

export const leaseSchema = Schema.object({
  properties: {
    currency: Schema.string({ description: 'ISO 4217 code if known, e.g. USD, GBP, NGN' }),
    rentAmount: Schema.number({ description: 'Base rent per rentPeriod, number only' }),
    rentPeriod: Schema.string({ description: 'e.g. monthly, weekly, yearly' }),
    depositAmount: Schema.number({ description: 'Security deposit, number only' }),
    lateFeeAmount: Schema.number({ description: 'Initial late fee, number only' }),
    lateFeeGraceDays: Schema.number({ description: 'Days after due date before a late fee applies; 0 if none' }),
    mandatoryFees: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          amount: Schema.number(),
          frequency: Schema.string({ description: 'e.g. monthly, one-time, yearly' }),
        },
        optionalProperties: ['amount', 'frequency'],
      }),
    }),
    noticePeriodDays: Schema.number({ description: 'Notice the tenant must give to leave or not renew, in days' }),
    autoRenewal: Schema.enumString({ enum: ['yes', 'no', 'unclear'] }),
    guestPolicy: Schema.string(),
    maintenanceResponsibility: Schema.string(),
    earlyTerminationPenalty: Schema.string(),
    otherMoneyTerms: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          amount: Schema.number(),
          notes: Schema.string(),
        },
        optionalProperties: ['amount', 'notes'],
      }),
    }),
    rawNotes: Schema.string({ description: 'Short notes on anything unusual. Do not copy long passages.' }),
  },
  optionalProperties: LEASE_FIELDS,
})

/** Check step response: a top-level array of findings. Cloud only. */
export const checkSchema = Schema.array({
  items: Schema.object({
    properties: {
      field: Schema.string(),
      status: Schema.enumString({ enum: ['RED', 'AMBER', 'GREEN'] }),
      title: Schema.string(),
      reason: Schema.string(),
      askTheLandlord: Schema.string(),
      playbookId: Schema.string(),
    },
  }),
})

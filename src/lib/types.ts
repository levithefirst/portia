/** Shapes shared across Portia. These mirror the Schema objects in schema.ts. */

export type YesNoUnclear = 'yes' | 'no' | 'unclear'

export interface MandatoryFee {
  name: string
  amount?: number
  frequency?: string
}

export interface OtherMoneyTerm {
  name: string
  amount?: number
  notes?: string
}

/** The structured fee-and-obligation map extracted from a lease. Every field is optional. */
export interface LeaseExtract {
  currency?: string
  rentAmount?: number
  rentPeriod?: string
  depositAmount?: number
  lateFeeAmount?: number
  lateFeeGraceDays?: number
  mandatoryFees?: MandatoryFee[]
  noticePeriodDays?: number
  autoRenewal?: YesNoUnclear
  guestPolicy?: string
  maintenanceResponsibility?: string
  earlyTerminationPenalty?: string
  otherMoneyTerms?: OtherMoneyTerm[]
  rawNotes?: string
}

export type ScalarField = Exclude<keyof LeaseExtract, 'mandatoryFees' | 'otherMoneyTerms'>

export type Status = 'RED' | 'AMBER' | 'GREEN'

export interface Finding {
  field: string
  status: Status
  title: string
  reason: string
  askTheLandlord: string
  playbookId: string
}

/** A finding as shown in the UI, with where it came from. */
export interface DisplayFinding extends Finding {
  key: string
  origin: 'playbook-rule' | 'cloud-review'
  /** True when the cited playbookId exists in the selected playbook. */
  cited: boolean
  /** Extra context from the cloud review when it agreed with a playbook rule. */
  cloudNote?: string
  /** Set when a RED from the cloud review was lowered because it cited no playbook rule. */
  downgraded?: boolean
}

/** Normalised inference source label. The SDK value is lowercase ("on_device" / "in_cloud"). */
/**
 * ON_DEVICE / IN_CLOUD come only from the SDK. FIXTURE = bundled sample data,
 * CACHED = bundled cached verdict, RULES_ONLY = in-browser playbook rules with no model call.
 */
export type SourceLabel = 'ON_DEVICE' | 'IN_CLOUD' | 'FIXTURE' | 'CACHED' | 'RULES_ONLY'

export interface ImagePart {
  type: 'inlineData'
  inlineData: { data: string; mimeType: string }
}

export interface PageImage {
  id: string
  file: File
  url: string
  name: string
  mimeType: string
  size: number
}

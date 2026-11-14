import us from '../playbooks/us-typical.json'
import ew from '../playbooks/england-wales.json'
import lagos from '../playbooks/lagos.json'
import general from '../playbooks/general-predatory-fees.json'
import type { Status } from './types'

export type RuleCheck =
  | { type: 'lateFeePct'; amber: number; red: number }
  | { type: 'graceDays'; amberBelow: number; redBelow?: number }
  | { type: 'depositMonths'; amber: number; red: number }
  | { type: 'depositWeeks'; red: number }
  | { type: 'mandatoryFees'; status: Status; keywords?: string[]; keywordStatus?: Status }
  | { type: 'feesPctOfRent'; amber: number; red: number }
  | { type: 'autoRenewal'; yes: Status; unclear: Status }
  | { type: 'noticeDays'; amberAbove: number; redAbove?: number }
  | { type: 'textPresent'; status: Status }
  | { type: 'textMatches'; fields: string[]; patterns: string[]; status: Status }

export interface PlaybookRule {
  id: string
  field: string
  title: string
  /** Short hedged note. Not legal advice. */
  note: string
  ask: string
  source?: string
  /** Optional text shown when the check passes. */
  green?: string
  check: RuleCheck
}

export interface Playbook {
  id: string
  name: string
  jurisdiction: string
  summary: string
  version: string
  rules: PlaybookRule[]
}

export const PLAYBOOKS: Playbook[] = [us, ew, lagos, general] as Playbook[]

export function getPlaybook(id: string): Playbook {
  return PLAYBOOKS.find((p) => p.id === id) ?? PLAYBOOKS[0]
}

export function findRule(playbook: Playbook, id: string): PlaybookRule | undefined {
  return playbook.rules.find((r) => r.id === id)
}

import type { SourceLabel } from './types'

/**
 * Raw value for the badge tooltip. ON_DEVICE and IN_CLOUD only ever come from
 * the SDK's result.response.inferenceSource. Every other label is a non-model step.
 */
export const RAW_SOURCE: Record<SourceLabel, string> = {
  ON_DEVICE: 'on_device',
  IN_CLOUD: 'in_cloud',
  FIXTURE: 'none (bundled sample data, no model call)',
  CACHED: 'none (bundled cached sample verdict)',
  RULES_ONLY: 'none (in-browser playbook rules, no model call)',
}

/** Plain-language label shown on the badge. */
export function sourceText(source: SourceLabel, step: 'Extract' | 'Check', nanoMissing = false): string {
  if (source === 'ON_DEVICE') return step === 'Extract' ? 'Extracted on this device (Gemini Nano)' : 'Checked on this device'
  if (source === 'IN_CLOUD') {
    if (step === 'Check') return 'Checked in the cloud'
    return nanoMissing ? 'Extracted in the cloud. Gemini Nano is not on this device' : 'Extracted in the cloud'
  }
  if (source === 'CACHED') return step === 'Extract' ? 'Extract: recorded sample, not live' : 'Check: recorded sample, not live'
  if (source === 'RULES_ONLY') return 'Offline: checked on this device'
  return 'Sample data, no model call'
}

import type { SourceLabel, Status } from '../lib/types'
import { IconAmber, IconChip, IconCloud, IconGreen, IconRed } from './icons'

const SOURCE_TEXT: Record<SourceLabel, string> = {
  ON_DEVICE: 'ON_DEVICE',
  IN_CLOUD: 'IN_CLOUD',
  FIXTURE: 'SAMPLE DATA',
  CACHED: 'CACHED SAMPLE',
}

const SOURCE_HELP: Record<SourceLabel, string> = {
  ON_DEVICE: 'Ran on this device with Gemini Nano (result.response.inferenceSource)',
  IN_CLOUD: 'Ran in the cloud with Gemini via Firebase AI Logic (result.response.inferenceSource)',
  FIXTURE: 'Pre-recorded sample, no model was called',
  CACHED: 'Bundled verdict for the sample lease, shown because the live cloud check was unavailable',
}

/** Visible inferenceSource badge shown after every model call. */
export function SourceBadge({ source, step }: { source: SourceLabel; step: string }) {
  const cls =
    source === 'ON_DEVICE'
      ? 'bg-accent text-on-accent border-accent'
      : source === 'IN_CLOUD'
        ? 'bg-surface text-text border-border'
        : 'bg-transparent text-text-secondary border-border border-dashed'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[0.72rem] font-medium tracking-wide ${cls}`}
      title={SOURCE_HELP[source]}
      data-testid={`badge-${step}`}
    >
      {source === 'ON_DEVICE' ? <IconChip width={13} height={13} /> : source === 'IN_CLOUD' ? <IconCloud width={13} height={13} /> : null}
      <span className="sr-only">{step} inference source: </span>
      {step}: {SOURCE_TEXT[source]}
    </span>
  )
}

const STATUS_META: Record<Status, { label: string; cls: string; Icon: typeof IconRed }> = {
  RED: { label: 'Red: push back', cls: 'bg-red-bg text-red-text border-red-solid', Icon: IconRed },
  AMBER: { label: 'Amber: ask', cls: 'bg-amber-bg text-amber-text border-amber-solid', Icon: IconAmber },
  GREEN: { label: 'Green: looks typical', cls: 'bg-green-bg text-green-text border-green-solid', Icon: IconGreen },
}

export function StatusPill({ status, compact = false }: { status: Status; compact?: boolean }) {
  const m = STATUS_META[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${m.cls}`}>
      <m.Icon width={14} height={14} />
      {compact ? status : m.label}
    </span>
  )
}

export function statusLabel(s: Status) {
  return STATUS_META[s].label
}

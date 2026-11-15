import type { DeviceAvailability } from '../lib/onDevice'
import { IconChip, IconCloud } from './icons'

interface Props {
  availability: DeviceAvailability | 'checking'
  progress: number | null
  preparing: boolean
  error: string | null
  onPrepare: () => void
  aiReady: boolean
}

const COPY: Record<DeviceAvailability | 'checking', { title: string; body: string }> = {
  checking: { title: 'Checking for Gemini Nano', body: 'Looking for the Chrome Prompt API in this browser.' },
  available: {
    title: 'Gemini Nano is ready on this device',
    body: 'Extraction runs on-device. Your lease text and photos stay in this browser.',
  },
  downloadable: {
    title: 'Gemini Nano can be downloaded',
    body: 'Prepare the on-device model once (it can take several minutes). Until it is ready, extracting needs your consent to use cloud Gemini.',
  },
  downloading: {
    title: 'Gemini Nano is downloading',
    body: 'Keep this tab open. Extraction stays private once the download finishes.',
  },
  unavailable: {
    title: 'Gemini Nano is not available here',
    body: 'Chrome reports the on-device model cannot run on this device. You can still extract with cloud Gemini after giving consent.',
  },
  unsupported: {
    title: 'This browser cannot run Gemini Nano',
    body: 'On-device extraction needs Chrome on desktop (v139+) with the Prompt API enabled. Phones, including Android Chrome, use cloud Gemini after you give consent.',
  },
}

/** Hero sub-line. Only claims on-device reading when Gemini Nano is actually ready. */
export function heroLine(availability: DeviceAvailability | 'checking'): string {
  const lead = 'Portia maps every fee and obligation in a rental agreement, then flags terms worth questioning against a curated playbook.'
  if (availability === 'available') return `${lead} The document is read on your device. Only the facts you approve go to the cloud.`
  if (availability === 'checking') return lead
  return 'Gemini Nano is not available on this device, so extraction needs your consent to use cloud Gemini. When Nano is available in desktop Chrome, the document is read on your device and only the facts you approve go to the cloud.'
}

export function DeviceStatus({ availability, progress, preparing, error, onPrepare, aiReady }: Props) {
  const c = COPY[availability]
  const onDevice = availability === 'available'
  const canPrepare = aiReady && (availability === 'downloadable' || availability === 'downloading')
  const pct = progress == null ? null : Math.round(progress * 100)
  return (
    <section aria-labelledby="device-title" className="paper p-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${onDevice ? 'border-accent bg-accent text-on-accent' : 'border-border-subtle bg-bg text-text-secondary'}`}
        >
          {onDevice ? <IconChip /> : <IconCloud />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Extraction engine</p>
          <h2 id="device-title" className="mt-0.5 text-[0.95rem] font-semibold">
            {c.title}
          </h2>
          <p className="hint mt-1">{c.body}</p>
          {canPrepare && (
            <div className="mt-3">
              <button type="button" className="btn text-sm" onClick={onPrepare} disabled={preparing && pct === null}>
                {preparing ? 'Preparing on-device model…' : 'Prepare on-device model'}
              </button>
            </div>
          )}
          {pct !== null && (
            <div className="mt-3" aria-live="polite">
              <div
                className="h-2 w-full overflow-hidden rounded-full border border-border-subtle bg-bg"
                role="progressbar"
                aria-label="On-device model download"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <p className="hint mt-1 font-mono">Download {pct}%</p>
            </div>
          )}
          {error && (
            <p className="mt-2 text-sm text-red-text" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

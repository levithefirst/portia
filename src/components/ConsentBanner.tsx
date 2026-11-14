import { useEffect, useRef } from 'react'
import type { DeviceAvailability } from '../lib/onDevice'
import { IconCloud } from './icons'

interface Props {
  availability: DeviceAvailability | 'checking'
  pageCount: number
  hasText: boolean
  onAccept: () => void
  onWait: () => void
  onCancel: () => void
}

/**
 * Shown whenever an extract would NOT run on-device. Nothing is sent until the
 * user presses "Send to cloud Gemini".
 */
export function ConsentBanner({ availability, pageCount, hasText, onAccept, onWait, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const canWait = availability === 'downloadable' || availability === 'downloading'
  const what = [hasText ? 'the lease text you pasted' : null, pageCount ? `${pageCount} page photo${pageCount > 1 ? 's' : ''}` : null]
    .filter(Boolean)
    .join(' and ')
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      className="rounded-[14px] border-2 border-amber-solid bg-amber-bg p-5 text-text"
      data-testid="consent-banner"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-amber-text">
          <IconCloud width={22} height={22} />
        </span>
        <div className="min-w-0">
          <h2 id="consent-title" className="text-base font-semibold">
            Your document would leave this device
          </h2>
          <div id="consent-body" className="mt-1 space-y-2 text-sm">
            <p>
              Gemini Nano is not ready in this browser, so extraction cannot run on-device. If you continue, Portia will send{' '}
              <strong>{what || 'your document'}</strong> to Google's cloud Gemini model through Firebase AI Logic to build the fee
              map.
            </p>
            <p className="text-text-secondary">
              Portia has no server and stores nothing. Google processes the request under its Gemini API terms. If you would rather
              keep the lease private, cancel and use desktop Chrome with Gemini Nano{canWait ? ', or wait for the download to finish' : ''}.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={onAccept}>
              Send to cloud Gemini
            </button>
            {canWait && (
              <button type="button" className="btn" onClick={onWait}>
                Wait for on-device model
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

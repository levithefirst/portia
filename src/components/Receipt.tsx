import { useState, type ReactNode } from 'react'
import { RAW_SOURCE } from '../lib/labels'
import { receiptHeadline, receiptSummary, type ReceiptStep } from '../lib/receipt'

const STEP_NAME: Record<ReceiptStep['step'], string> = {
  extract: 'Extract fee map',
  rules: 'Playbook rules',
  check: 'Cloud review',
}

const RAN_ON: Record<string, string> = {
  ON_DEVICE: 'This device (Gemini Nano)',
  IN_CLOUD: 'Cloud Gemini',
  FIXTURE: 'Bundled sample, no model',
  CACHED: 'Recorded sample result (not live), no model',
  RULES_ONLY: 'This browser, no model',
}

function left(s: ReceiptStep): string {
  const c = s.sentToCloud
  if (c.kind === 'nothing') return 'Nothing'
  if (c.kind === 'approved-json') return `Approved JSON only: ${c.chars.toLocaleString('en')} characters, ${c.bytes.toLocaleString('en')} bytes`
  const img = c.imageCount ? `, ${c.imageCount} image${c.imageCount > 1 ? 's' : ''} (${c.imageBytes.toLocaleString('en')} bytes)` : ''
  return `Lease text with your consent: ${c.chars.toLocaleString('en')} characters, prompt ${c.bytes.toLocaleString('en')} bytes${img}`
}

/** Per-run privacy receipt shown under the tiles. */
export function Receipt({ steps, leaseText, footer }: { steps: ReceiptStep[]; leaseText: string; footer?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  if (!steps.length) return null
  const h = receiptHeadline(steps, leaseText)

  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ headline: h.text, steps }, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="mt-4 rounded-xl border border-border-subtle bg-bg p-3 sm:p-4" aria-labelledby="receipt-title" data-testid="receipt">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="receipt-title" className="eyebrow">
          Privacy receipt
        </h3>
        <button type="button" className="no-print btn btn-ghost px-2 py-1 text-xs" onClick={copy} data-testid="copy-receipt">
          {copied ? 'Copied' : 'Copy receipt (JSON)'}
        </button>
      </div>
      <p className={`mt-1 text-sm ${h.zero ? 'font-semibold' : ''}`} data-testid="receipt-headline" data-zero={h.zero ? 'true' : 'false'}>
        {h.text}
      </p>
      {h.phrases.length > 0 && (
        <details className="no-print mt-1 text-xs text-text-secondary">
          <summary className="cursor-pointer">Show the matching phrases</summary>
          <ul className="mt-1 list-disc pl-5">
            {h.phrases.map((p) => (
              <li key={p} className="font-mono">
                {p}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="no-print mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left text-xs sm:text-[0.8rem]">
          <thead className="text-text-secondary">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Step</th>
              <th scope="col" className="py-1 pr-3 font-medium">Ran on</th>
              <th scope="col" className="py-1 pr-3 font-medium">Time</th>
              <th scope="col" className="py-1 font-medium">What left this device</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => (
              <tr
                key={`${s.step}-${i}`}
                className="border-t border-border-subtle align-top"
                data-testid={`receipt-row-${s.step}`}
                data-ran={s.ranOn}
                data-sdk={s.sdkInferenceSource ?? ''}
                data-kind={s.sentToCloud.kind}
              >
                <td className="py-1.5 pr-3">{STEP_NAME[s.step]}</td>
                <td className="py-1.5 pr-3" title={`inferenceSource: ${s.sdkInferenceSource ?? RAW_SOURCE[s.ranOn]}; requested mode: ${s.requestedMode}`}>
                  {RAN_ON[s.ranOn]}
                </td>
                <td className="py-1.5 pr-3 font-mono">{(s.ms / 1000).toFixed(2)}s</td>
                <td className="py-1.5">
                  {left(s)}
                  {s.payload && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-accent-text">View the exact text sent to the check model</summary>
                      <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-surface p-3 font-mono text-[0.72rem]">
                        {s.payload}
                      </pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint mt-2">Sizes are the prompt size passed to Firebase AI Logic, not bytes on the wire.</p>
        {footer}
      </div>
      <p className="print-only mt-1 text-xs">{receiptSummary(steps, h)}</p>
    </section>
  )
}

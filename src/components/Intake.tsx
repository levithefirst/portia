import { useRef, useState } from 'react'
import { PLAYBOOKS } from '../lib/playbooks'
import { HUGE_PASTE_CHARS, MAX_IMAGES_PER_EXTRACT, ON_DEVICE_TOKEN_BUDGET, estimateTokens } from '../lib/prompts'
import { MAX_QUEUED_PAGES, sortFiles } from '../lib/intake'
import type { PageImage } from '../lib/types'
import { IconArrowDown, IconArrowUp, IconUpload, IconX } from './icons'

interface Props {
  leaseText: string
  onLeaseText: (t: string) => void
  pages: PageImage[]
  onPages: (p: PageImage[]) => void
  batch: string[]
  onBatch: (ids: string[]) => void
  playbookId: string
  onPlaybook: (id: string) => void
  onLoadSample: () => void
  onLoadSamplePhotos: () => void
  rejections: string[]
  onRejections: (r: string[]) => void
}

let seq = 0
export function toPage(file: File): PageImage {
  return { id: `p${++seq}`, file, url: URL.createObjectURL(file), name: file.name, mimeType: file.type || 'image/jpeg', size: file.size }
}

export function Intake(p: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)

  function addFiles(list: FileList | File[]) {
    const { accepted, rejected } = sortFiles(Array.from(list))
    const room = MAX_QUEUED_PAGES - p.pages.length
    const take = accepted.slice(0, Math.max(0, room))
    const extra = accepted.length - take.length
    const msgs = rejected.map((r) => `${r.name}: ${r.reason}`)
    if (extra > 0) msgs.push(`Only ${MAX_QUEUED_PAGES} pages can be queued at once. ${extra} file${extra > 1 ? 's were' : ' was'} skipped.`)
    p.onRejections(msgs)
    if (!take.length) return
    const added = take.map(toPage)
    const next = [...p.pages, ...added]
    p.onPages(next)
    // Auto-select the first batch (up to 3 pages) when nothing is selected yet.
    const sel = p.batch.length ? p.batch : []
    const fill = [...sel]
    for (const pg of next) if (fill.length < MAX_IMAGES_PER_EXTRACT && !fill.includes(pg.id)) fill.push(pg.id)
    p.onBatch(fill)
  }

  function move(i: number, d: -1 | 1) {
    const next = [...p.pages]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    p.onPages(next)
  }

  function remove(id: string) {
    const pg = p.pages.find((x) => x.id === id)
    if (pg) URL.revokeObjectURL(pg.url)
    p.onPages(p.pages.filter((x) => x.id !== id))
    p.onBatch(p.batch.filter((b) => b !== id))
  }

  function toggle(id: string) {
    if (p.batch.includes(id)) p.onBatch(p.batch.filter((b) => b !== id))
    else if (p.batch.length < MAX_IMAGES_PER_EXTRACT) p.onBatch([...p.batch, id])
  }

  const tokens = estimateTokens(p.leaseText, p.batch.length)
  const overBudget = tokens > ON_DEVICE_TOKEN_BUDGET
  const huge = p.leaseText.length > HUGE_PASTE_CHARS
  const playbook = PLAYBOOKS.find((x) => x.id === p.playbookId)

  return (
    <section aria-labelledby="intake-title" className="paper p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2 id="intake-title" className="font-serif text-2xl font-medium">
            Add the agreement
          </h2>
          <p className="hint mt-1">Paste the text, or add photos of each page. Portia never asks for an account.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn text-sm" onClick={p.onLoadSample}>
            Load sample lease
          </button>
          <button type="button" className="btn text-sm" onClick={p.onLoadSamplePhotos}>
            Load sample photos
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <label htmlFor="lease-text" className="label">
            Lease text
          </label>
          <textarea
            id="lease-text"
            className="field min-h-[260px] resize-y font-mono text-[0.8rem] leading-relaxed"
            placeholder="Paste the full agreement here…"
            value={p.leaseText}
            onChange={(e) => p.onLeaseText(e.target.value)}
            aria-describedby="lease-text-hint"
          />
          <p id="lease-text-hint" className="hint mt-1.5 font-mono">
            {p.leaseText.length.toLocaleString()} characters · about {tokens.toLocaleString()} tokens with selected pages
          </p>
          {(overBudget || huge) && (
            <p className="mt-2 rounded-lg border border-amber-solid bg-amber-bg px-3 py-2 text-sm text-amber-text" role="status">
              {huge ? 'This is a very long paste. ' : ''}
              It may exceed the on-device model's input limit (about {ON_DEVICE_TOKEN_BUDGET.toLocaleString()} tokens). Extract in
              batches: paste one section, extract, then add the next section with "Add another batch".
            </p>
          )}
        </div>

        <div>
          <span className="label" id="pages-label">
            Page photos <span className="font-normal text-text-secondary">(JPEG or PNG)</span>
          </span>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              addFiles(e.dataTransfer.files)
            }}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${drag ? 'border-accent bg-bg' : 'border-border-subtle'}`}
            data-testid="dropzone"
          >
            <IconUpload width={22} height={22} className="text-text-secondary" />
            <p className="mt-2 text-sm">Drop page photos here</p>
            <button type="button" className="btn mt-3 text-sm" onClick={() => inputRef.current?.click()} aria-describedby="pages-label">
              Choose images
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,.pdf"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose page images"
              data-testid="file-input"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <p className="hint mt-2">Up to {MAX_IMAGES_PER_EXTRACT} pages per extract. PDFs are not accepted.</p>
          </div>

          {p.rejections.length > 0 && (
            <ul className="mt-2 space-y-1 rounded-lg border border-red-solid bg-red-bg px-3 py-2 text-sm text-red-text" role="alert" data-testid="rejections">
              {p.rejections.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}

          {p.pages.length > 0 && (
            <ol className="mt-3 space-y-2" aria-label="Queued pages in order">
              {p.pages.map((pg, i) => {
                const on = p.batch.includes(pg.id)
                return (
                  <li key={pg.id} className={`flex items-center gap-3 rounded-lg border p-2 ${on ? 'border-accent' : 'border-border-subtle'}`}>
                    <img src={pg.url} alt={`Page ${i + 1} thumbnail`} className="h-14 w-11 rounded border border-border-subtle bg-bg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        <span className="font-mono text-text-secondary">p{i + 1}</span> {pg.name}
                      </p>
                      <label className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-text-secondary">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(pg.id)}
                          disabled={!on && p.batch.length >= MAX_IMAGES_PER_EXTRACT}
                        />
                        Include in this extract
                      </label>
                    </div>
                    <div className="flex items-center">
                      <button type="button" className="btn btn-ghost p-1.5" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move page ${i + 1} up`}>
                        <IconArrowUp />
                      </button>
                      <button type="button" className="btn btn-ghost p-1.5" onClick={() => move(i, 1)} disabled={i === p.pages.length - 1} aria-label={`Move page ${i + 1} down`}>
                        <IconArrowDown />
                      </button>
                      <button type="button" className="btn btn-ghost p-1.5" onClick={() => remove(pg.id)} aria-label={`Remove page ${i + 1}`}>
                        <IconX />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          {p.pages.length > MAX_IMAGES_PER_EXTRACT && (
            <p className="mt-2 rounded-lg border border-amber-solid bg-amber-bg px-3 py-2 text-sm text-amber-text" role="status">
              {p.pages.length} pages queued. Portia extracts up to {MAX_IMAGES_PER_EXTRACT} pages per turn to stay inside the on-device
              input limit. Extract this batch, then use "Add another batch" for the rest.
            </p>
          )}
        </div>
      </div>

      <hr className="rule my-5" />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,320px)_1fr] sm:items-start">
        <div>
          <label htmlFor="playbook" className="label">
            Check against
          </label>
          <select id="playbook" className="field" value={p.playbookId} onChange={(e) => p.onPlaybook(e.target.value)}>
            {PLAYBOOKS.map((pb) => (
              <option key={pb.id} value={pb.id}>
                {pb.name}
              </option>
            ))}
          </select>
        </div>
        {playbook && (
          <p className="hint sm:pt-6">
            <span className="font-mono">{playbook.id}</span> · {playbook.jurisdiction}. {playbook.summary}
          </p>
        )}
      </div>
    </section>
  )
}

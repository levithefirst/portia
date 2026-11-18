/**
 * PDF intake, entirely in this browser. pdfjs-dist is loaded lazily on the
 * first PDF (never at landing). This is parsing, not AI inference: nothing is
 * sent anywhere. Text PDFs fill the lease textarea; scanned PDFs become PNG
 * page images that go through the normal on-device / consent gate.
 */
import { MAX_QUEUED_PAGES } from './intake'

export const MAX_PDF_PAGES = 30
export const MIN_PDF_TEXT_CHARS = 200
const RENDER_SCALE = 1.5
const MAX_SIDE_PX = 2000

export type PdfResult =
  | { kind: 'text'; text: string; pageCount: number }
  | { kind: 'scanned'; images: File[]; pageCount: number; skippedPages: number }

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  return pdfjs
}

export class PdfTooLongError extends Error {
  constructor(pages: number) {
    super(`This PDF has ${pages} pages. Portia reads up to ${MAX_PDF_PAGES} pages; split it into smaller files.`)
    this.name = 'PdfTooLongError'
  }
}

/** Reads a PDF. `queueRoom` is how many more page images the queue can take. */
export async function readPdf(file: File, queueRoom = MAX_QUEUED_PAGES): Promise<PdfResult> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  try {
    if (doc.numPages > MAX_PDF_PAGES) throw new PdfTooLongError(doc.numPages)
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      let t = ''
      for (const item of content.items) {
        if ('str' in item) t += item.str + (item.hasEOL ? '\n' : ' ')
      }
      pages.push(`--- page ${n} ---\n${t.replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim()}`)
    }
    const body = pages.join('\n\n')
    const textChars = body.replace(/--- page \d+ ---/g, '').replace(/\s+/g, '').length
    if (textChars >= MIN_PDF_TEXT_CHARS) return { kind: 'text', text: body, pageCount: doc.numPages }

    // Scanned PDF: render pages to PNG in this browser.
    const take = Math.max(0, Math.min(doc.numPages, queueRoom))
    const base = file.name.replace(/\.pdf$/i, '')
    const images: File[] = []
    for (let n = 1; n <= take; n++) {
      const page = await doc.getPage(n)
      const v1 = page.getViewport({ scale: 1 })
      const scale = Math.min(RENDER_SCALE, MAX_SIDE_PX / Math.max(v1.width, v1.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not render the page.'))), 'image/png'))
      images.push(new File([blob], `${base}-page-${n}.png`, { type: 'image/png' }))
    }
    return { kind: 'scanned', images, pageCount: doc.numPages, skippedPages: doc.numPages - take }
  } finally {
    void task.destroy()
  }
}

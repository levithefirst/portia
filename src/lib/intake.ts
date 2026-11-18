import type { ImagePart } from './types'

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png']
export const ACCEPTED_PDF_TYPE = 'application/pdf'
export const REJECT_MESSAGE =
  'Portia accepts pasted text, PDFs, or JPEG/PNG page images. Export other files as PDF, or photograph each page.'
export const MAX_FILE_BYTES = 15 * 1024 * 1024
export const MAX_QUEUED_PAGES = 9

export interface FileVerdict {
  accepted: File[]
  /** PDFs, read in this browser by pdf.ts (text, or rendered page images). */
  pdfs: File[]
  rejected: { name: string; reason: string }[]
}

function sniffType(file: File): string {
  if (file.type) return file.type
  const n = file.name.toLowerCase()
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg'
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.pdf')) return ACCEPTED_PDF_TYPE
  return ''
}

/** Accepts JPEG/PNG images and PDFs. Everything else is rejected and never sent anywhere. */
export function sortFiles(files: File[]): FileVerdict {
  const out: FileVerdict = { accepted: [], pdfs: [], rejected: [] }
  for (const f of files) {
    const t = f.name.toLowerCase().endsWith('.pdf') ? ACCEPTED_PDF_TYPE : sniffType(f)
    if (t === ACCEPTED_PDF_TYPE) {
      if (f.size > MAX_FILE_BYTES) out.rejected.push({ name: f.name, reason: 'This PDF is larger than 15 MB. Split it into smaller files.' })
      else out.pdfs.push(f)
    } else if (!ACCEPTED_IMAGE_TYPES.includes(t)) {
      out.rejected.push({ name: f.name, reason: REJECT_MESSAGE })
    } else if (f.size > MAX_FILE_BYTES) {
      out.rejected.push({ name: f.name, reason: 'This image is larger than 15 MB. Take a smaller photo or crop the page.' })
    } else {
      out.accepted.push(f)
    }
  }
  return out
}

/** Official get-started pattern: FileReader -> base64 inlineData part. */
export async function fileToGenerativePart(file: File): Promise<ImagePart> {
  const base64EncodedDataPromise = new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image.'))
    reader.readAsDataURL(file)
  })
  return {
    type: 'inlineData',
    inlineData: { data: await base64EncodedDataPromise, mimeType: sniffType(file) },
  }
}

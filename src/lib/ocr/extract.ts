import type { OcrJob, OcrPageResult, OcrResult } from '@/data/repositories/ocr'
import { loadPdfjs, PDF_OPTIONS } from '../pdf'
import { recognize } from './engine'

/** Une page PDF avec au moins 80 caractères non blancs a son texte natif : pas d'OCR. */
export const NATIVE_TEXT_MIN_CHARS = 80
const PDF_RENDER_WIDTH = 2000
const IMAGE_MAX_SIDE = 2500

export const countNonBlank = (text: string) => text.replace(/\s/g, '').length

export function averageConfidence(pages: { confidence?: number }[]): number | undefined {
  const values = pages.map((p) => p.confidence).filter((c): c is number => c !== undefined)
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined
}

/** Plus de 80 % de pages à texte natif : la source du document est le texte natif. */
export function pickSource(nativePages: number, totalPages: number): OcrResult['source'] {
  return totalPages > 0 && nativePages / totalPages > 0.8 ? 'nativeText' : 'tesseract'
}

/** Progression globale : les pages à texte natif comptent comme terminées immédiatement. */
export const globalProgress = (finished: number, current: number, total: number) => (total ? Math.min(1, (finished + current) / total) : 1)

type Progress = (fraction: number, label: string) => void
const toPng = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("L'image n'a pas pu être préparée."))), 'image/png'))

async function readImage(blob: Blob, job: OcrJob, progress: Progress): Promise<OcrPageResult[]> {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const turned = job.rotation === 90 || job.rotation === 270
    const canvas = document.createElement('canvas')
    canvas.width = turned ? h : w
    canvas.height = turned ? w : h
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // La rotation enregistrée est un réglage d'affichage : on l'applique aussi à la lecture.
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((job.rotation * Math.PI) / 180)
    ctx.drawImage(bitmap, -w / 2, -h / 2, w, h)
    const { text, confidence } = await recognize(await toPng(canvas), job.languages, (f, label) => progress(f, label || 'Lecture de la page 1 sur 1'))
    return [{ pageNumber: 1, text, confidence }]
  } finally {
    bitmap.close()
  }
}

async function readPdf(blob: Blob, job: OcrJob, progress: Progress, signal: AbortSignal): Promise<OcrPageResult[]> {
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), ...PDF_OPTIONS })
  const pdf = await task.promise.catch(() => {
    throw new Error('Ce PDF est illisible ou protégé par un mot de passe.')
  })
  const pages: OcrPageResult[] = []
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      if (signal.aborted) throw new DOMException('Annulé', 'AbortError')
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()
      const text = content.items.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '')).join('').trim()
      if (countNonBlank(text) >= NATIVE_TEXT_MIN_CHARS) {
        pages.push({ pageNumber: n, text })
        progress(globalProgress(n, 0, pdf.numPages), `Lecture de la page ${n} sur ${pdf.numPages}`)
        continue
      }
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: PDF_RENDER_WIDTH / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      const finished = n - 1
      const read = await recognize(await toPng(canvas), job.languages, (fraction, label) =>
        progress(globalProgress(finished, fraction, pdf.numPages), label || `Lecture de la page ${n} sur ${pdf.numPages}`),
      )
      pages.push({ pageNumber: n, text: read.text, confidence: read.confidence })
      progress(globalProgress(n, 0, pdf.numPages), `Lecture de la page ${n} sur ${pdf.numPages}`)
    }
  } finally {
    void task.destroy()
  }
  return pages
}

/** Lit un document : texte natif des PDF d'abord, OCR seulement pour les pages sans texte. */
export async function readDocument(blob: Blob, job: OcrJob, progress: Progress, signal: AbortSignal): Promise<OcrResult> {
  const started = performance.now()
  const pages = job.kind === 'pdf' ? await readPdf(blob, job, progress, signal) : await readImage(blob, job, progress)
  const nativePages = pages.filter((p) => p.confidence === undefined).length
  const source = pickSource(nativePages, pages.length)
  return {
    pages,
    source,
    language: source === 'nativeText' ? '' : job.languages,
    confidence: averageConfidence(pages),
    durationMs: Math.round(performance.now() - started),
  }
}

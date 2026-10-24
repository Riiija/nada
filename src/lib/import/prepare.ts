import { loadPdfjs, PDF_OPTIONS } from '../pdf'

export interface PreparedFile {
  pageCount: number
  width?: number
  height?: number
  /** Miniature WebP d'environ 240 px, absente si le navigateur ne sait pas la produire. */
  thumbnail?: Blob
}

const THUMB = 240

function canvasToWebp(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | undefined> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 }).catch(() => undefined)
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? undefined), 'image/webp', 0.8))
}

type Canvas = HTMLCanvasElement | OffscreenCanvas

function draw(canvas: Canvas, source: CanvasImageSource) {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  ctx?.drawImage(source, 0, 0, canvas.width, canvas.height)
}

function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

async function prepareImage(file: Blob): Promise<PreparedFile> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Cette image est illisible ou abîmée.')
  }
  try {
    const scale = Math.min(1, THUMB / Math.max(bitmap.width, bitmap.height))
    const canvas = makeCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
    draw(canvas, bitmap)
    return { pageCount: 1, width: bitmap.width, height: bitmap.height, thumbnail: await canvasToWebp(canvas) }
  } finally {
    bitmap.close()
  }
}

async function preparePdf(file: Blob): Promise<PreparedFile> {
  // Chargé à la demande : pdf.js ne pèse que sur les imports de PDF.
  const pdfjs = await loadPdfjs()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...PDF_OPTIONS })
  let pdf
  try {
    pdf = await task.promise
  } catch {
    throw new Error('Ce PDF est illisible ou protégé par un mot de passe.')
  }
  try {
    const page = await pdf.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: (THUMB * 2) / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    const half = makeCanvas(THUMB, Math.round((THUMB * base.height) / base.width))
    draw(half, canvas)
    return { pageCount: pdf.numPages, thumbnail: await canvasToWebp(half) }
  } finally {
    void task.destroy()
  }
}

/** Nombre de pages, dimensions et miniature, calculés hors transaction. */
export function prepareFile(file: Blob, kind: 'pdf' | 'image'): Promise<PreparedFile> {
  return kind === 'pdf' ? preparePdf(file) : prepareImage(file)
}

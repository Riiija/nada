/** Configuration unique de pdf.js : la version exportée par react-pdf, un seul worker. */
let configured = false

export async function loadPdfjs() {
  const { pdfjs } = await import('react-pdf')
  if (!configured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    configured = true
  }
  return pdfjs
}

/** Options de chargement : polices, CMaps et wasm servis depuis /pdfjs (copiés au postinstall). */
export const PDF_OPTIONS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
  wasmUrl: '/pdfjs/wasm/',
  iccUrl: '/pdfjs/iccs/',
} as const

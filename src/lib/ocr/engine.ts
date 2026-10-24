import type { Worker } from 'tesseract.js'

const IDLE_MS = 60_000

let worker: Worker | null = null
let loaded = ''
let idleTimer: ReturnType<typeof setTimeout> | undefined
let onFraction: ((fraction: number, label: string) => void) | null = null

const languageNames: Record<string, string> = { fra: 'français', ara: 'arabe' }

function describeStatus(status: string, languages: string): string | null {
  if (status.includes('loading tesseract core') || status.includes('initializing tesseract') || status.includes('initialized tesseract')) return 'Préparation du moteur de lecture'
  if (status.includes('language')) return `Chargement du modèle ${languages.split('+').map((l) => languageNames[l] ?? l).join(' et ')}`
  return null
}

/** Un seul worker, créé à la demande, réutilisé, terminé après 60 s d'inactivité. */
async function getWorker(languages: string): Promise<Worker> {
  clearTimeout(idleTimer)
  if (worker && loaded !== languages) await terminateEngine()
  if (!worker) {
    // Import dynamique : le moteur ne pèse que lorsqu'un document est à lire.
    const { createWorker, OEM } = await import('tesseract.js')
    onFraction?.(0, 'Préparation du moteur de lecture')
    worker = await createWorker(languages.split('+'), OEM.LSTM_ONLY, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/core',
      langPath: '/ocr/lang',
      workerBlobURL: false,
      gzip: true,
      logger: (message) => {
        if (message.status === 'recognizing text') onFraction?.(message.progress, '')
        else {
          const label = describeStatus(message.status, languages)
          if (label) onFraction?.(0, label)
        }
      },
    })
    loaded = languages
  }
  return worker
}

export async function terminateEngine() {
  clearTimeout(idleTimer)
  const current = worker
  worker = null
  loaded = ''
  if (current) await current.terminate().catch(() => undefined)
}

export interface Recognition {
  text: string
  /** 0 à 100 */
  confidence: number
}

/** Lit une image avec Tesseract. `progress` reçoit la fraction de la page et un libellé éventuel. */
export async function recognize(image: Blob, languages: string, progress: (fraction: number, label: string) => void): Promise<Recognition> {
  onFraction = progress
  try {
    const engine = await getWorker(languages)
    const { data } = await engine.recognize(image)
    return { text: data.text.trim(), confidence: data.confidence }
  } finally {
    onFraction = null
    idleTimer = setTimeout(() => void terminateEngine(), IDLE_MS)
  }
}

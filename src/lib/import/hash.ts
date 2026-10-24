import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/**
 * SHA-256 d'un fichier lu par morceaux, avec progression. crypto.subtle ne sait pas hacher
 * en continu : on utilise @noble/hashes, qui accepte des mises à jour successives.
 */
export async function sha256Stream(
  blob: Blob,
  onProgress?: (read: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const hash = sha256.create()
  const reader = blob.stream().getReader()
  let read = 0
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('Annulé', 'AbortError')
      const { done, value } = await reader.read()
      if (done) break
      hash.update(value)
      read += value.byteLength
      onProgress?.(read, blob.size)
    }
  } finally {
    reader.releaseLock()
  }
  return bytesToHex(hash.digest())
}

type WorkerMessage =
  | { type: 'progress'; read: number; total: number }
  | { type: 'done'; sha256: string }
  | { type: 'error'; message: string }

/** Hache dans un Web Worker (l'interface reste fluide). Repli sur le fil principal sans Worker. */
export function sha256InWorker(file: Blob, onProgress?: (read: number, total: number) => void, signal?: AbortSignal): Promise<string> {
  if (typeof Worker === 'undefined') return sha256Stream(file, onProgress, signal)
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' })
    const finish = () => {
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
    }
    const onAbort = () => {
      finish()
      reject(new DOMException('Annulé', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort)
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (message.type === 'progress') onProgress?.(message.read, message.total)
      else if (message.type === 'done') {
        finish()
        resolve(message.sha256)
      } else {
        finish()
        reject(new Error(message.message))
      }
    }
    worker.onerror = () => {
      finish()
      reject(new Error("Le calcul de l'empreinte du fichier a échoué."))
    }
    worker.postMessage(file)
  })
}

import { sha256Stream } from './hash'

self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    const sha256 = await sha256Stream(event.data, (read, total) => self.postMessage({ type: 'progress', read, total }))
    self.postMessage({ type: 'done', sha256 })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Erreur de lecture' })
  }
}
